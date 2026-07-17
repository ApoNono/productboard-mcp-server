import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface UpdateReleaseParams {
  id: string;
  name?: string;
  date?: string;
  description?: string;
  status?: 'planned' | 'in_progress' | 'released';
  release_group_id?: string;
}

// v1 status tokens → v2 release status field values (workspace values verified
// as Upcoming / In Progress / Completed).
const STATUS_TO_V2_NAME: Record<string, string> = {
  planned: 'Upcoming',
  in_progress: 'In Progress',
  released: 'Completed',
};

export class UpdateReleaseTool extends BaseTool<UpdateReleaseParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_release_update',
      'Update an existing release',
      {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'Release ID to update',
          },
          name: {
            type: 'string',
            description: 'Release name/version',
          },
          date: {
            type: 'string',
            format: 'date',
            description: 'Release date (mapped to the v2 release timeframe start/end date)',
          },
          description: {
            type: 'string',
            description: 'Release description',
          },
          status: {
            type: 'string',
            enum: ['planned', 'in_progress', 'released'],
            description: 'Release status',
          },
          release_group_id: {
            type: 'string',
            description: 'Parent release group ID (reparents the release via a v2 parent relationship)',
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

  protected async executeInternal(params: UpdateReleaseParams): Promise<ToolExecutionResult> {
    try {
      this.logger.info('Updating release', { id: params.id });

      const { id, name, date, description, status, release_group_id } = params;

      const fields: Record<string, unknown> = {};
      if (name !== undefined) fields['name'] = name;
      if (description !== undefined) {
        fields['description'] = description.startsWith('<')
          ? description
          : `<p>${description.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`;
      }
      if (status !== undefined) fields['status'] = { name: STATUS_TO_V2_NAME[status] };
      if (date !== undefined) {
        fields['timeframe'] = { startDate: date, endDate: date, granularity: 'day' };
      }

      if (Object.keys(fields).length === 0 && release_group_id === undefined) {
        return {
          success: false,
          error: 'No update fields provided',
        };
      }

      const results: Record<string, unknown> = {};

      // Field-level updates go through PATCH /v2/entities/{id}.
      if (Object.keys(fields).length > 0) {
        results.entity = await this.apiClient.patch(`/v2/entities/${id}`, {
          data: { fields },
        });
      }

      // The parent release group is a relationship, not a field, so reparenting
      // is applied separately via the relationships endpoint (parent link).
      if (release_group_id !== undefined) {
        results.parent = await this.apiClient.post(`/v2/entities/${id}/relationships`, {
          data: { type: 'parent', target: { id: release_group_id } },
        });
      }

      const entity = (results.entity as any)?.data ?? results.entity;

      return {
        success: true,
        data: entity ?? results,
      };
    } catch (error) {
      this.logger.error('Failed to update release', error);
      const detail = (error as any)?.details ? JSON.stringify((error as any).details) : '';
      return {
        success: false,
        error: `Failed to update release: ${(error as Error).message}${detail ? ` — API detail: ${detail}` : ''}`,
      };
    }
  }
}
