import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';
import { ToolExecutionResult } from '../../core/types.js';

interface GetFeatureParams {
  id: string;
  include?: Array<'notes' | 'objectives' | 'releases' | 'custom_fields'>;
}

export class GetFeatureTool extends BaseTool<GetFeatureParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_feature_get',
      'Get detailed information about a specific feature (Productboard v2 /entities)',
      {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'Feature ID',
          },
          include: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['notes', 'objectives', 'releases', 'custom_fields'],
            },
            description:
              'Retained for compatibility. In v2 the feature is fetched with fields[]=all, which returns every field (including custom fields) plus its relationships (notes, objectives, releases). This param no longer changes the request and is reported as ignored.',
          },
        },
      },
      {
        requiredPermissions: [Permission.FEATURES_READ],
        minimumAccessLevel: AccessLevel.READ,
        description: 'Requires read access to features',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(params: GetFeatureParams): Promise<ToolExecutionResult> {
    this.logger.info('Getting feature details', { featureId: params.id });

    try {
      // v2 fields[]=all returns all fields; relationships come back on the
      // entity, so the legacy `include` expansions are covered automatically.
      const response = await this.apiClient.get<{ data?: unknown }>(
        `/v2/entities/${params.id}`,
        { 'fields[]': 'all' }
      );

      const feature = (response as { data?: unknown })?.data ?? response;

      if (params.include && params.include.length > 0) {
        this.logger.info(
          `pb_feature_get: 'include' param ignored (${params.include.join(', ')}); v2 fields[]=all already returns all fields and relationships`
        );
      }

      return {
        success: true,
        data: feature,
      };
    } catch (error) {
      this.logger.error('Failed to get feature', error);
      return {
        success: false,
        error: `Failed to get feature: ${(error as Error).message}`,
      };
    }
  }
}
