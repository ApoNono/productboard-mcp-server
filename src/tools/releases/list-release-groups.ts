import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface ListReleaseGroupsParams {
  name?: string;
  archived?: boolean;
  limit?: number;
}

interface ReleaseGroupEntity {
  id: string;
  type: string;
  fields?: {
    name?: string;
    description?: string;
    archived?: boolean;
    [key: string]: unknown;
  };
  links?: { html?: string };
  [key: string]: unknown;
}

interface EntityListResponse {
  data: ReleaseGroupEntity[];
  links?: { next?: string | null };
}

const MAX_PAGES = 40;

export class ListReleaseGroupsTool extends BaseTool<ListReleaseGroupsParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_release_group_list',
      'List release groups. Release groups organize releases (e.g., sprints vs. marketing launches vs. Now/Next/Later horizons). Use this to find release-group IDs for filtering pb_release_list.',
      {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Case-insensitive substring filter on the group name (client-side)',
          },
          archived: {
            type: 'boolean',
            description: 'If true, include only archived groups; if false, only active ones. Omit for all. (client-side)',
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            default: 20,
            description: 'Maximum number of groups to return after filtering',
          },
        },
      },
      {
        requiredPermissions: [Permission.RELEASES_READ],
        minimumAccessLevel: AccessLevel.READ,
        description: 'Requires read access to releases',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(params: ListReleaseGroupsParams = {}): Promise<ToolExecutionResult> {
    try {
      this.logger.info('Listing release groups');

      // v2 entities list. The v1 /release-groups endpoint now returns 410 Gone;
      // release groups are v2 entities of type "releaseGroup". No server-side
      // name/archived filters exist for them, so those are applied client-side.
      let all: ReleaseGroupEntity[] = [];
      let endpoint = '/v2/entities';
      let queryParams: Record<string, any> | undefined = {
        'type[]': 'releaseGroup',
        'fields[]': 'all',
      };
      let pages = 0;

      while (endpoint && pages < MAX_PAGES) {
        const response = (await this.apiClient.makeRequest({
          method: 'GET',
          endpoint,
          params: queryParams,
        })) as EntityListResponse;

        if (Array.isArray(response?.data)) {
          all.push(...response.data);
        }

        const next = response?.links?.next;
        if (next) {
          const url = new URL(next);
          endpoint = url.pathname.replace(/^\/+/, '/');
          queryParams = Object.fromEntries(url.searchParams.entries());
        } else {
          break;
        }
        pages += 1;
      }

      let filtered = all;
      if (params.name) {
        const needle = params.name.toLowerCase();
        filtered = filtered.filter(g => (g.fields?.name ?? '').toLowerCase().includes(needle));
      }
      if (params.archived !== undefined) {
        filtered = filtered.filter(g => Boolean(g.fields?.archived) === params.archived);
      }

      const limit = params.limit ?? 20;
      const results = filtered.slice(0, limit);

      return {
        success: true,
        data: {
          release_groups: results.map(g => ({
            id: g.id,
            name: g.fields?.name,
            archived: g.fields?.archived,
            description: g.fields?.description,
            html: g.links?.html,
          })),
          total_matched: filtered.length,
          returned: results.length,
          total_workspace: all.length,
        },
      };
    } catch (error) {
      this.logger.error('Failed to list release groups', error);
      return {
        success: false,
        error: `Failed to list release groups: ${(error as Error).message}`,
      };
    }
  }
}
