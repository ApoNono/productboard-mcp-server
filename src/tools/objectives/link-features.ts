import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface LinkFeaturesToObjectiveParams {
  objective_id: string;
  feature_ids: string[];
}

export class LinkFeaturesToObjectiveTool extends BaseTool<LinkFeaturesToObjectiveParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_objective_link_feature',
      'Link features to an objective',
      {
        type: 'object',
        required: ['objective_id', 'feature_ids'],
        properties: {
          objective_id: {
            type: 'string',
            description: 'Objective ID',
          },
          feature_ids: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            description: 'Feature IDs to link',
          },
        },
      },
      {
        requiredPermissions: [Permission.OBJECTIVES_WRITE],
        minimumAccessLevel: AccessLevel.WRITE,
        description: 'Requires write access to objectives',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(params: LinkFeaturesToObjectiveParams): Promise<ToolExecutionResult> {
    try {
      this.logger.info('Linking features to objective', {
        objective_id: params.objective_id,
        feature_count: params.feature_ids.length,
      });

      // v2 endpoint: POST /v2/entities/{objectiveId}/relationships, one call per
      // feature link. The relationship "type" token is "link" (verified via GET
      // /v2/entities/{id}/relationships, which returns entries of {type:"link", target:{...}}).
      // Body shape mirrors notes/attach-note.ts.
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
          `/v2/entities/${params.objective_id}/relationships`,
          body,
        );
        results.push(response);
      }

      return {
        success: true,
        data: {
          objective_id: params.objective_id,
          linked_feature_ids: params.feature_ids,
          results,
        },
      };
    } catch (error) {
      this.logger.error('Failed to link features to objective', error);
      const detail = (error as any)?.details ? JSON.stringify((error as any).details) : '';
      return {
        success: false,
        error: `Failed to link features to objective: ${(error as Error).message}${detail ? ` — API detail: ${detail}` : ''}`,
      };
    }
  }
}
