import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface BulkFeature {
  name: string;
  description: string;
  status?: 'new' | 'in_progress' | 'validation' | 'done' | 'archived';
  product_id?: string;
  component_id?: string;
  owner_email?: string;
  tags?: string[];
  priority?: 'critical' | 'high' | 'medium' | 'low';
}

interface BulkCreateFeaturesParams {
  features: BulkFeature[];
  batch_size?: number;
}

// Best-effort mapping from the tool's stable status enum to v2 workflow status
// display names. Display names are workspace-configurable.
const STATUS_NAME_MAP: Record<string, string> = {
  new: 'New',
  in_progress: 'In progress',
  validation: 'Validation',
  done: 'Done',
};

export class BulkCreateFeaturesTool extends BaseTool<BulkCreateFeaturesParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_feature_bulk_create',
      'Bulk create multiple features (loops v2 /entities POST; v2 has no batch create endpoint)',
      {
        type: 'object',
        required: ['features'],
        properties: {
          features: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'description'],
              properties: {
                name: {
                  type: 'string',
                  description: 'Feature name',
                },
                description: {
                  type: 'string',
                  description: 'Feature description (plain text is converted to HTML)',
                },
                status: {
                  type: 'string',
                  enum: ['new', 'in_progress', 'validation', 'done', 'archived'],
                  description: 'Feature status (best-effort mapping to v2 status display names)',
                },
                product_id: {
                  type: 'string',
                  description: 'Parent product ID (used as the v2 parent relationship)',
                },
                component_id: {
                  type: 'string',
                  description: 'Parent component ID (used as the v2 parent relationship)',
                },
                owner_email: {
                  type: 'string',
                  format: 'email',
                  description: 'Owner email',
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Feature tags',
                },
                priority: {
                  type: 'string',
                  enum: ['critical', 'high', 'medium', 'low'],
                  description: 'Retained for compatibility; priority has no v2 field equivalent and is ignored.',
                },
              },
            },
            minItems: 1,
            maxItems: 100,
            description: 'Features to create',
          },
          batch_size: {
            type: 'number',
            minimum: 1,
            maximum: 50,
            default: 10,
            description:
              'Retained for compatibility. v2 has no batch create endpoint, so features are created one-by-one via sequential POST /v2/entities; this value no longer controls a server-side batch.',
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

  protected async executeInternal(params: BulkCreateFeaturesParams): Promise<ToolExecutionResult> {
    try {
      this.logger.info('Bulk creating features (v2 /entities loop)', {
        count: params.features.length,
      });

      const created: unknown[] = [];
      const errors: Array<{ index: number; name: string; error: string }> = [];
      let priorityIgnored = false;

      for (let i = 0; i < params.features.length; i++) {
        const f = params.features[i];

        if (!f.component_id && !f.product_id) {
          errors.push({
            index: i,
            name: f.name,
            error:
              'Feature creation requires a parent. Provide component_id or product_id.',
          });
          continue;
        }

        if (f.priority !== undefined) priorityIgnored = true;

        const description = f.description.startsWith('<')
          ? f.description
          : `<p>${f.description.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`;

        const fields: Record<string, unknown> = {
          name: f.name,
          description,
        };

        if (f.owner_email) fields.owner = { email: f.owner_email };
        if (f.tags) fields.tags = f.tags;
        if (f.status) {
          if (f.status === 'archived') {
            fields.archived = true;
          } else if (STATUS_NAME_MAP[f.status]) {
            fields.status = { name: STATUS_NAME_MAP[f.status] };
          }
        }

        const parentId = f.component_id || f.product_id;
        const body = {
          data: {
            type: 'feature',
            fields,
            relationships: [{ type: 'parent', target: { id: parentId } }],
          },
        };

        try {
          const response = await this.apiClient.post<{ data?: unknown }>('/v2/entities', body);
          created.push((response as { data?: unknown })?.data ?? response);
        } catch (error) {
          this.logger.error(`Failed to create feature at index ${i}`, error);
          const detail = (error as any)?.details ? ` — ${JSON.stringify((error as any).details)}` : '';
          errors.push({
            index: i,
            name: f.name,
            error: `${(error as Error).message}${detail}`,
          });
        }
      }

      return {
        success: errors.length === 0,
        data: {
          created,
          total_created: created.length,
          total_requested: params.features.length,
          errors: errors.length > 0 ? errors : undefined,
          ignoredParams: priorityIgnored ? ['priority (no v2 equivalent)'] : undefined,
        },
      };
    } catch (error) {
      this.logger.error('Failed to bulk create features', error);
      return {
        success: false,
        error: `Failed to bulk create features: ${(error as Error).message}`,
      };
    }
  }
}
