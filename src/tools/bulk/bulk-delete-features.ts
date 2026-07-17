import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface BulkDeleteFeaturesParams {
  feature_ids: string[];
  permanent?: boolean;
  batch_size?: number;
}

export class BulkDeleteFeaturesTool extends BaseTool<BulkDeleteFeaturesParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_feature_bulk_delete',
      'Bulk delete or archive multiple features (loops v2 /entities; v2 has no batch delete endpoint)',
      {
        type: 'object',
        required: ['feature_ids'],
        properties: {
          feature_ids: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 100,
            description: 'Feature IDs to delete',
          },
          permanent: {
            type: 'boolean',
            default: false,
            description:
              'If true, permanently delete (DELETE /v2/entities/{id}). If false, archive by setting the v2 archived flag.',
          },
          batch_size: {
            type: 'number',
            minimum: 1,
            maximum: 50,
            default: 10,
            description:
              'Retained for compatibility. v2 has no batch delete endpoint, so features are processed one-by-one; this value no longer controls a server-side batch.',
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

  protected async executeInternal(params: BulkDeleteFeaturesParams): Promise<ToolExecutionResult> {
    try {
      this.logger.info('Bulk deleting features (v2 /entities loop)', {
        count: params.feature_ids.length,
        permanent: params.permanent,
      });

      const results = {
        deleted: [] as string[],
        archived: [] as string[],
        failed: [] as { id: string; error: string }[],
      };

      for (const id of params.feature_ids) {
        if (params.permanent) {
          try {
            await this.apiClient.delete(`/v2/entities/${id}`);
            results.deleted.push(id);
          } catch (error) {
            this.logger.error(`Failed to delete feature ${id}`, error);
            results.failed.push({ id, error: (error as Error).message });
          }
        } else {
          try {
            await this.apiClient.patch(`/v2/entities/${id}`, {
              data: { fields: { archived: true } },
            });
            results.archived.push(id);
          } catch (error) {
            this.logger.error(`Failed to archive feature ${id}`, error);
            results.failed.push({ id, error: (error as Error).message });
          }
        }
      }

      return {
        success: results.failed.length === 0,
        data: {
          ...results,
          total_processed: params.feature_ids.length,
          total_succeeded: results.deleted.length + results.archived.length,
          total_failed: results.failed.length,
        },
      };
    } catch (error) {
      this.logger.error('Failed to bulk delete features', error);
      return {
        success: false,
        error: `Failed to bulk delete features: ${(error as Error).message}`,
      };
    }
  }
}
