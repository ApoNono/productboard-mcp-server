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

interface ProductboardReleaseGroup {
  id: string;
  name: string;
  description?: string;
  archived?: boolean;
  links?: { self?: string; html?: string };
}

interface ProductboardListResponse<T> {
  data: T[];
  links?: { next?: string };
}

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
            description: 'Case-insensitive substring filter on the group name',
          },
          archived: {
            type: 'boolean',
            description: 'If true, include archived groups; if false, only active ones. Omit for all.',
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

      // Productboard's /release-groups endpoint has no server-side filters
      // beyond pagination — everything else is applied client-side.
      const groups = await this.fetchAllPages('/release-groups', { pageLimit: 100 });

      let filtered = groups;
      if (params.name) {
        const needle = params.name.toLowerCase();
        filtered = filtered.filter(g => (g.name ?? '').toLowerCase().includes(needle));
      }
      if (params.archived !== undefined) {
        filtered = filtered.filter(g => Boolean(g.archived) === params.archived);
      }

      const limit = params.limit ?? 20;
      const results = filtered.slice(0, limit);

      return {
        success: true,
        data: {
          release_groups: results.map(g => ({
            id: g.id,
            name: g.name,
            archived: g.archived,
            description: g.description,
          })),
          total_matched: filtered.length,
          returned: results.length,
          total_workspace: groups.length,
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

  private async fetchAllPages(
    endpoint: string,
    initialParams: Record<string, any>
  ): Promise<ProductboardReleaseGroup[]> {
    const all: ProductboardReleaseGroup[] = [];
    let nextEndpoint: string | undefined = endpoint;
    let nextParams: Record<string, any> | undefined = initialParams;

    while (nextEndpoint) {
      const response = (await this.apiClient.makeRequest({
        method: 'GET',
        endpoint: nextEndpoint,
        params: nextParams,
      })) as ProductboardListResponse<ProductboardReleaseGroup>;

      if (Array.isArray(response?.data)) {
        all.push(...response.data);
      }

      const next = response?.links?.next;
      if (next) {
        const url = new URL(next);
        nextEndpoint = url.pathname.replace(/^\/+/, '/');
        nextParams = Object.fromEntries(url.searchParams.entries());
      } else {
        nextEndpoint = undefined;
      }
    }

    return all;
  }
}
