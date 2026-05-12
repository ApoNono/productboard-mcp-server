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

      // POST   /initiatives/{id}/links/objectives/{objectiveId}   (link)
      // DELETE /initiatives/{id}/links/objectives/{objectiveId}   (unlink)
      const method = action === 'unlink' ? 'DELETE' : 'POST';
      const results = await Promise.all(
        params.objective_ids.map(async objectiveId => {
          try {
            await this.apiClient.makeRequest({
              method,
              endpoint: `/initiatives/${params.initiative_id}/links/objectives/${objectiveId}`,
            });
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
