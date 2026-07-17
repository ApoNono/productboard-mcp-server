import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface LinkObjectivesToInitiativeParams {
  initiative_id: string;
  objective_ids: string[];
  action?: 'link' | 'unlink';
}

export class LinkObjectivesToInitiativeTool extends BaseTool<LinkObjectivesToInitiativeParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_initiative_link_objective',
      'Link (or unlink) objectives to an initiative',
      {
        type: 'object',
        required: ['initiative_id', 'objective_ids'],
        properties: {
          initiative_id: {
            type: 'string',
            description: 'Initiative ID (UUID)',
          },
          objective_ids: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            description: 'One or more objective IDs to link/unlink',
          },
          action: {
            type: 'string',
            enum: ['link', 'unlink'],
            default: 'link',
            description: 'Whether to link or unlink (default: link)',
          },
        },
      },
      {
        requiredPermissions: [Permission.INITIATIVES_WRITE],
        minimumAccessLevel: AccessLevel.WRITE,
        description: 'Requires write access to initiatives',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(
    params: LinkObjectivesToInitiativeParams
  ): Promise<ToolExecutionResult> {
    try {
      const action = params.action ?? 'link';
      this.logger.info('Linking objectives to initiative', {
        initiative_id: params.initiative_id,
        objective_count: params.objective_ids.length,
        action,
      });

      // v2 has no exposed endpoint to remove an entity relationship (the
      // GET /v2/entities/{id}/relationships response carries no relationship
      // ids to target for deletion). Keep the param in the schema for
      // compatibility, but report unlink as unsupported rather than hit dead v1.
      if (action === 'unlink') {
        return {
          success: false,
          error:
            'Unlinking is not supported by the Productboard v2 API: v2 exposes no endpoint to remove an entity relationship. Remove the link in the Productboard UI instead.',
        };
      }

      // v2 relationships: POST /v2/entities/{initiativeId}/relationships, one
      // call per objective (mirrors notes/attach-note.ts). The relationship
      // "type" token is "link" (verified against GET relationships output).
      const results = await Promise.all(
        params.objective_ids.map(async objectiveId => {
          try {
            await this.apiClient.post(
              `/v2/entities/${params.initiative_id}/relationships`,
              {
                data: {
                  type: 'link',
                  target: {
                    type: 'link',
                    id: objectiveId,
                    entity: { type: 'objective' },
                  },
                },
              }
            );
            return { objective_id: objectiveId, success: true };
          } catch (error) {
            return {
              objective_id: objectiveId,
              success: false,
              error: (error as Error).message,
            };
          }
        })
      );

      const failures = results.filter(r => !r.success);
      return {
        success: failures.length === 0,
        data: {
          initiative_id: params.initiative_id,
          action,
          results,
          ...(failures.length > 0 && {
            error: `${failures.length} of ${results.length} ${action} operations failed`,
          }),
        },
      };
    } catch (error) {
      this.logger.error('Failed to link objectives to initiative', error);
      return {
        success: false,
        error: `Failed to link objectives to initiative: ${(error as Error).message}`,
      };
    }
  }
}
