import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';
import { ToolExecutionResult } from '../../core/types.js';

interface UpdateFeatureParams {
  id: string;
  name?: string;
  description?: string;
  status?: 'new' | 'in_progress' | 'validation' | 'done' | 'archived';
  owner_email?: string;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  tags?: string[];
}

// Best-effort mapping from the tool's stable status enum to v2 workflow status
// display names. Display names are workspace-configurable.
const STATUS_NAME_MAP: Record<string, string> = {
  new: 'New',
  in_progress: 'In progress',
  validation: 'Validation',
  done: 'Done',
};

export class UpdateFeatureTool extends BaseTool<UpdateFeatureParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_feature_update',
      'Update an existing feature (Productboard v2 /entities PATCH)',
      {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'Feature ID to update',
          },
          name: {
            type: 'string',
            description: 'New feature name',
            maxLength: 255,
          },
          description: {
            type: 'string',
            description: 'New feature description (plain text is converted to HTML)',
          },
          status: {
            type: 'string',
            enum: ['new', 'in_progress', 'validation', 'done', 'archived'],
            description:
              'New feature status. "archived" sets the v2 archived flag; workflow statuses map (best-effort) to v2 status display names, which are workspace-configurable.',
          },
          owner_email: {
            type: 'string',
            format: 'email',
            description: 'New owner email',
          },
          priority: {
            type: 'string',
            enum: ['critical', 'high', 'medium', 'low'],
            description:
              'Retained for compatibility. Priority has no v2 entity field equivalent and is ignored (reported in ignoredParams).',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Replace all tags',
          },
        },
      },
      {
        requiredPermissions: [Permission.FEATURES_WRITE],
        minimumAccessLevel: AccessLevel.WRITE,
        description: 'Requires write access to features',
      },
      apiClient,
      logger
    );
  }

  validateParams(params: unknown) {
    const baseValidation = super.validateParams(params);
    if (!baseValidation.valid) {
      return baseValidation;
    }

    // Additional validation: ensure at least one field to update
    const { id, ...updateFields } = params as UpdateFeatureParams;
    if (Object.keys(updateFields).length === 0) {
      return {
        valid: false,
        errors: [{
          path: '',
          message: 'At least one field must be provided for update',
          value: undefined,
        }],
      };
    }

    return { valid: true, errors: [] };
  }

  protected async executeInternal(params: UpdateFeatureParams): Promise<ToolExecutionResult> {
    try {
      const { id } = params;

      const fields: Record<string, unknown> = {};
      const ignoredParams: string[] = [];

      if (params.name !== undefined) fields.name = params.name;

      if (params.description !== undefined) {
        fields.description = params.description.startsWith('<')
          ? params.description
          : `<p>${params.description.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`;
      }

      if (params.status) {
        if (params.status === 'archived') {
          fields.archived = true;
        } else if (STATUS_NAME_MAP[params.status]) {
          fields.status = { name: STATUS_NAME_MAP[params.status] };
        }
      }

      if (params.owner_email !== undefined) {
        fields.owner = { email: params.owner_email };
      }

      if (params.tags !== undefined) {
        fields.tags = params.tags;
      }

      if (params.priority !== undefined) {
        ignoredParams.push('priority (no v2 entity field equivalent)');
        this.logger.info('pb_feature_update: priority param ignored (no v2 equivalent)');
      }

      if (Object.keys(fields).length === 0) {
        return {
          success: false,
          error:
            'No updatable fields provided. Only priority was supplied, which has no v2 equivalent.',
        };
      }

      const response = await this.apiClient.patch<{ data?: unknown }>(
        `/v2/entities/${id}`,
        { data: { fields } }
      );

      const updated = (response as { data?: unknown })?.data ?? response;

      return {
        success: true,
        data: ignoredParams.length ? { feature: updated, ignoredParams } : updated,
      };
    } catch (error) {
      this.logger.error('Failed to update feature', error);
      const detail = (error as any)?.details ? JSON.stringify((error as any).details) : '';
      return {
        success: false,
        error: `Failed to update feature: ${(error as Error).message}${detail ? ` — API detail: ${detail}` : ''}`,
      };
    }
  }
}
