import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface ReleaseStatusUpdateParams {
  id: string;
  status: 'planned' | 'in_progress' | 'released';
  release_notes?: string;
  actual_date?: string;
}

// v1 status tokens → v2 release status field values (verified workspace values).
const STATUS_TO_V2_NAME: Record<string, string> = {
  planned: 'Upcoming',
  in_progress: 'In Progress',
  released: 'Completed',
};

export class ReleaseStatusUpdateTool extends BaseTool<ReleaseStatusUpdateParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_release_status_update',
      'Update release status and publish release notes',
      {
        type: 'object',
        required: ['id', 'status'],
        properties: {
          id: {
            type: 'string',
            description: 'Release ID',
          },
          status: {
            type: 'string',
            enum: ['planned', 'in_progress', 'released'],
            description: 'New release status',
          },
          release_notes: {
            type: 'string',
            description: 'Release notes (required when status is "released")',
          },
          actual_date: {
            type: 'string',
            format: 'date',
            description: 'Actual release date (for released status)',
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

  protected async executeInternal(params: ReleaseStatusUpdateParams): Promise<ToolExecutionResult> {
    try {
      this.logger.info('Updating release status', {
        id: params.id,
        status: params.status,
      });

      // Validate release notes for released status (behavior preserved from v1).
      if (params.status === 'released' && !params.release_notes) {
        return {
          success: false,
          error: 'Release notes are required when status is "released"',
        };
      }

      // v2 has no dedicated release-status endpoint; status is a field on the
      // release entity, updated via PATCH /v2/entities/{id}.
      const fields: Record<string, unknown> = {
        status: { name: STATUS_TO_V2_NAME[params.status] },
      };

      // v1 accepted an actual_date; v2 releases carry a timeframe. Map it there.
      if (params.actual_date) {
        fields['timeframe'] = {
          startDate: params.actual_date,
          endDate: params.actual_date,
          granularity: 'day',
        };
      }

      const response = await this.apiClient.patch(`/v2/entities/${params.id}`, {
        data: { fields },
      });
      const entity = (response as any)?.data ?? response;

      // v2 release entities have no release-notes field/endpoint, so notes text
      // cannot be published through this API. Surface it rather than dropping it.
      const ignoredParams = params.release_notes
        ? {
            release_notes:
              'The v2 release entity has no release-notes field; notes were not published. Use the release description or a note instead.',
          }
        : undefined;

      return {
        success: true,
        data: {
          release: entity,
          ...(ignoredParams ? { ignoredParams } : {}),
        },
      };
    } catch (error) {
      this.logger.error('Failed to update release status', error);
      const detail = (error as any)?.details ? JSON.stringify((error as any).details) : '';
      return {
        success: false,
        error: `Failed to update release status: ${(error as Error).message}${detail ? ` — API detail: ${detail}` : ''}`,
      };
    }
  }
}
