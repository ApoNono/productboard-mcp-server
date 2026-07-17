import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface CreateReleaseParams {
  name: string;
  date: string;
  description?: string;
  release_group_id?: string;
}

export class CreateReleaseTool extends BaseTool<CreateReleaseParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_release_create',
      'Create a new release',
      {
        type: 'object',
        required: ['name', 'date'],
        properties: {
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
          release_group_id: {
            type: 'string',
            description: 'Parent release group ID',
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

  protected async executeInternal(params: CreateReleaseParams): Promise<ToolExecutionResult> {
    try {
      this.logger.info('Creating release', { name: params.name });

      const fields: Record<string, unknown> = {
        name: params.name,
      };

      if (params.description) {
        // Convert plain text description to HTML if needed (releases store HTML).
        fields['description'] = params.description.startsWith('<')
          ? params.description
          : `<p>${params.description.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`;
      }

      // v1 exposed a single `date`; v2 releases carry a `timeframe`
      // ({ startDate, endDate, granularity }). Map the single date to both ends.
      if (params.date) {
        fields['timeframe'] = {
          startDate: params.date,
          endDate: params.date,
          granularity: 'day',
        };
      }

      // The parent release group is a v2 `parent` relationship (verified: a
      // release's relationships include { type:'parent', target: releaseGroup }).
      const relationships: unknown[] = [];
      if (params.release_group_id) {
        relationships.push({
          type: 'parent',
          target: { id: params.release_group_id },
        });
      }

      const body: Record<string, unknown> = {
        data: {
          type: 'release',
          fields,
          ...(relationships.length > 0 ? { relationships } : {}),
        },
      };

      const response = await this.apiClient.post('/v2/entities', body);
      const created = (response as any).data || response;

      return {
        success: true,
        data: created,
      };
    } catch (error) {
      this.logger.error('Failed to create release', error);
      const detail = (error as any)?.details ? JSON.stringify((error as any).details) : '';
      return {
        success: false,
        error: `Failed to create release: ${(error as Error).message}${detail ? ` — API detail: ${detail}` : ''}`,
      };
    }
  }
}
