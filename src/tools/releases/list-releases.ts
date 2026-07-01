import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface ListReleasesParams {
  release_group_id?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
}

interface ProductboardRelease {
  id: string;
  name: string;
  description?: string;
  archived?: boolean;
  state?: string;
  timeframe?: {
    startDate?: string;
    endDate?: string;
    granularity?: string;
  };
  releaseGroup?: {
    id?: string;
    links?: { self?: string };
  };
  links?: { self?: string; html?: string };
}

interface ProductboardListResponse<T> {
  data: T[];
  links?: { next?: string };
}

// Legacy status values from the original schema mapped to Productboard's real
// state values. The tool now accepts either; the map lets old callers keep
// working.
const STATUS_ALIAS: Record<string, string> = {
  planned: 'upcoming',
  in_progress: 'in-progress',
  released: 'completed',
};

export class ListReleasesTool extends BaseTool<ListReleasesParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_release_list',
      'List releases with optional filtering by release group, status, and timeframe',
      {
        type: 'object',
        properties: {
          release_group_id: {
            type: 'string',
            description: 'Filter to releases in a specific release group (use pb_release_group_list to look up IDs)',
          },
          status: {
            type: 'string',
            description:
              'Filter by release state. Productboard uses "upcoming" | "in-progress" | "completed". Legacy values "planned" | "in_progress" | "released" are also accepted and mapped.',
          },
          date_from: {
            type: 'string',
            format: 'date',
            description: 'Filter to releases whose timeframe.startDate is on or after this date (YYYY-MM-DD). Releases with no scheduled start are excluded.',
          },
          date_to: {
            type: 'string',
            format: 'date',
            description: 'Filter to releases whose timeframe.startDate is on or before this date (YYYY-MM-DD).',
          },
          limit: {
            type: 'number',
            minimum: 1,
            maximum: 100,
            default: 20,
            description: 'Maximum number of releases to return after filtering',
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

  protected async executeInternal(params: ListReleasesParams = {}): Promise<ToolExecutionResult> {
    try {
      this.logger.info('Listing releases');

      // Productboard's /releases endpoint actively rejects unknown query
      // parameters with HTTP 400 (unlike /notes which silently ignores).
      // The only server-supported filter is `releaseGroup.id` (dot notation).
      // Everything else is applied client-side after fetching all pages.
      const apiParams: Record<string, any> = { pageLimit: 100 };
      if (params.release_group_id) {
        apiParams['releaseGroup.id'] = params.release_group_id;
      }

      const releases = await this.fetchAllPages('/releases', apiParams);

      // Client-side filters
      let filtered = releases;
      if (params.status) {
        const wantedState = STATUS_ALIAS[params.status] ?? params.status;
        filtered = filtered.filter(r => r.state === wantedState);
      }
      if (params.date_from) {
        filtered = filtered.filter(r => {
          const s = r.timeframe?.startDate;
          return s && s !== 'none' && s >= params.date_from!;
        });
      }
      if (params.date_to) {
        filtered = filtered.filter(r => {
          const s = r.timeframe?.startDate;
          return s && s !== 'none' && s <= params.date_to!;
        });
      }

      const limit = params.limit ?? 20;
      const results = filtered.slice(0, limit);

      return {
        success: true,
        data: {
          releases: results.map(r => ({
            id: r.id,
            name: r.name,
            state: r.state,
            timeframe: r.timeframe,
            releaseGroupId: r.releaseGroup?.id,
            archived: r.archived,
            html: r.links?.html,
          })),
          total_matched: filtered.length,
          returned: results.length,
          total_workspace: releases.length,
        },
      };
    } catch (error) {
      this.logger.error('Failed to list releases', error);
      return {
        success: false,
        error: `Failed to list releases: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Fetch every page of a Productboard list endpoint by following the
   * `links.next` cursor.
   */
  private async fetchAllPages(
    endpoint: string,
    initialParams: Record<string, any>
  ): Promise<ProductboardRelease[]> {
    const all: ProductboardRelease[] = [];
    let nextEndpoint: string | undefined = endpoint;
    let nextParams: Record<string, any> | undefined = initialParams;

    while (nextEndpoint) {
      const response = (await this.apiClient.makeRequest({
        method: 'GET',
        endpoint: nextEndpoint,
        params: nextParams,
      })) as ProductboardListResponse<ProductboardRelease>;

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
