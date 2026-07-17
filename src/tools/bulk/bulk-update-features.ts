import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ValidationError } from '../../utils/errors.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface BulkUpdateFeaturesParams {
  feature_ids: string[];
  updates: {
    status?: 'new' | 'in_progress' | 'validation' | 'done' | 'archived';
    owner_email?: string;
    tags?: string[];
  };
}

// Best-effort mapping from the tool's stable status enum to v2 workflow status
// display names. Display names are workspace-configurable.
const STATUS_NAME_MAP: Record<string, string> = {
  new: 'New',
  in_progress: 'In progress',
  validation: 'Validation',
  done: 'Done',
};

export class BulkUpdateFeaturesTool extends BaseTool<BulkUpdateFeaturesParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_feature_bulk_update',
      'Update multiple features at once (loops v2 /entities PATCH; v2 has no batch update endpoint)',
      {
        type: 'object',
        required: ['feature_ids', 'updates'],
        properties: {
          feature_ids: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 100,
            description: 'Feature IDs to update',
          },
          updates: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: ['new', 'in_progress', 'validation', 'done', 'archived'],
              },
              owner_email: {
                type: 'string',
                format: 'email',
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            description: 'Fields to update (applied to every feature)',
          },
        },
      },
      {
        requiredPermissions: [Permission.BULK_OPERATIONS],
        minimumAccessLevel: AccessLevel.WRITE,
        description: 'Requires write access for bulk operations',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(params: BulkUpdateFeaturesParams): Promise<ToolExecutionResult> {
    // Validate that at least one update field is provided
    if (Object.keys(params.updates).length === 0) {
      throw new ValidationError('At least one update field must be provided');
    }

    this.logger.info('Bulk updating features (v2 /entities loop)', {
      count: params.feature_ids.length,
    });

    // Build the shared v2 fields payload once.
    const fields: Record<string, unknown> = {};
    if (params.updates.status) {
      if (params.updates.status === 'archived') {
        fields.archived = true;
      } else if (STATUS_NAME_MAP[params.updates.status]) {
        fields.status = { name: STATUS_NAME_MAP[params.updates.status] };
      }
    }
    if (params.updates.owner_email !== undefined) {
      fields.owner = { email: params.updates.owner_email };
    }
    if (params.updates.tags !== undefined) {
      fields.tags = params.updates.tags;
    }

    if (Object.keys(fields).length === 0) {
      throw new ValidationError(
        'No updatable v2 fields resolved from the provided updates.'
      );
    }

    const updated: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const id of params.feature_ids) {
      try {
        await this.apiClient.patch(`/v2/entities/${id}`, { data: { fields } });
        updated.push(id);
      } catch (error) {
        this.logger.error(`Failed to update feature ${id}`, error);
        const detail = (error as any)?.details ? ` — ${JSON.stringify((error as any).details)}` : '';
        failed.push({ id, error: `${(error as Error).message}${detail}` });
      }
    }

    return {
      success: failed.length === 0,
      data: {
        updated,
        total_updated: updated.length,
        total_requested: params.feature_ids.length,
        total_failed: failed.length,
        failed: failed.length > 0 ? failed : undefined,
      },
    };
  }
}
