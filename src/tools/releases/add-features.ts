import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface AddFeaturesToReleaseParams {
  release_id: string;
  feature_ids: string[];
}

export class AddFeaturesToReleaseTool extends BaseTool<AddFeaturesToReleaseParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_release_feature_add',
      'Add features to a release',
      {
        type: 'object',
        required: ['release_id', 'feature_ids'],
        properties: {
          release_id: {
            type: 'string',
            description: 'Release ID',
          },
          feature_ids: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            description: 'Feature IDs to add to the release',
          },
        },
      },
      {
        requiredPermissions: [Permission.RELEASES_WRITE],
        minimumAccessLevel: AccessLevel.WRITE,
        description: 'Requires write access to releases',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(params: AddFeaturesToReleaseParams): Promise<ToolExecutionResult> {
    try {
      this.logger.info('Adding features to release', {
        release_id: params.release_id,
        feature_count: params.feature_ids.length,
      });

      // v2: a feature is linked to a release through a "link" relationship
      // (verified: a feature's relationships include { type:'link', target:{ type:'release' } }).
      // Create one relationship per feature on the release entity, mirroring
      // the note-attach pattern (POST /v2/entities/{id}/relationships).
      const results: unknown[] = [];
      for (const featureId of params.feature_ids) {
        const body = {
          data: {
            type: 'link',
            target: {
              type: 'link',
              id: featureId,
              entity: { type: 'feature' },
            },
          },
        };
        const response = await this.apiClient.post(
          `/v2/entities/${params.release_id}/relationships`,
          body,
        );
        results.push(response);
      }

      return {
        success: true,
        data: results,
      };
    } catch (error) {
      this.logger.error('Failed to add features to release', error);
      const detail = (error as any)?.details ? JSON.stringify((error as any).details) : '';
      return {
        success: false,
        error: `Failed to add features to release: ${(error as Error).message}${detail ? ` — API detail: ${detail}` : ''}`,
      };
    }
  }
}
