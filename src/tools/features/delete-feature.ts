import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface DeleteFeatureParams {
  id: string;
  permanent?: boolean;
}

export class DeleteFeatureTool extends BaseTool<DeleteFeatureParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_feature_delete',
      'Delete a feature (or archive it) (Productboard v2 /entities)',
      {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'Feature ID to delete',
          },
          permanent: {
            type: 'boolean',
            default: false,
            description:
              'If true, permanently delete (DELETE /v2/entities/{id}). If false, archive by setting the v2 archived flag.',
          },
        },
      },
      {
        requiredPermissions: [Permission.FEATURES_DELETE],
        minimumAccessLevel: AccessLevel.DELETE,
        description: 'Requires delete access to features',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(params: DeleteFeatureParams): Promise<ToolExecutionResult> {
    try {
      const { id, permanent = false } = params;

      if (permanent) {
        // Permanent deletion
        await this.apiClient.delete(`/v2/entities/${id}`);
        return {
          success: true,
          data: {
            action: 'deleted',
            feature_id: id,
          },
        };
      } else {
        // Archive by setting the v2 archived flag.
        const response = await this.apiClient.patch<{ data?: unknown }>(
          `/v2/entities/${id}`,
          { data: { fields: { archived: true } } }
        );
        const feature = (response as { data?: unknown })?.data ?? response;
        return {
          success: true,
          data: {
            feature,
            action: 'archived',
          },
        };
      }
    } catch (error) {
      this.logger.error('Failed to delete feature', error);
      return {
        success: false,
        error: `Failed to delete feature: ${(error as Error).message}`,
      };
    }
  }
}
