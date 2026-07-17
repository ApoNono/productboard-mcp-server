import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface ListReleasesParams {
  release_group_id?: string;
  status?: 'planned' | 'in_progress' | 'released';
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

interface ReleaseEntity {
  id: string;
  type: string;
  fields?: {
    name?: string;
    status?: { id?: string; name?: string } | null;
    timeframe?: { startDate?: string; endDate?: string; granularity?: string } | null;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface EntityListResponse {
  data: ReleaseEntity[];
  links?: { next?: string | null };
}

const MAX_PAGES = 40;

// v1 used status tokens planned/in_progress/released. v2 releases expose a
// status field whose workspace values are Upcoming / In Progress / Completed.
const STATUS_TO_V2_NAME: Record<string, string> = {
  planned: 'Upcoming',
  in_progress: 'In Progress',
  released: 'Completed',
};

export class ListReleasesTool extends BaseTool<ListReleasesParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_release_list',
      'List releases with optional filtering',
      {
        type: 'object',
        properties: {
          release_group_id: {
            type: 'string',
            description: 'Filter by release group',
          },
          status: {
            type: 'string',
            enum: ['planned', 'in_progress', 'released'],
            description: 'Filter by release status',
          },
          date_from: {
            type: 'string',
            format: 'date',
            description: 'Filter releases whose timeframe ends on or after this date',
          },
          date_to: {
            type: 'string',
            format: 'date',
            description: 'Filter releases whose timeframe starts on or before this date',
          },
          limit: {
            type: 'number',
            minimum: 1,
            maximum: 100,
            default: 20,
            description: 'Maximum number of releases to return',
          },
          offset: {
            type: 'number',
            minimum: 0,
            default: 0,
            description: 'Number of releases to skip',
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

      // v2 entities list. type[]/fields[] bracket keys are passed literally;
      // parent[id] and status[name] are supported server-side filters (verified).
      const initialParams: Record<string, any> = {
        'type[]': 'release',
        'fields[]': 'all',
      };
      if (params.release_group_id) initialParams['parent[id]'] = params.release_group_id;
      if (params.status) initialParams['status[name]'] = STATUS_TO_V2_NAME[params.status];

      let all: ReleaseEntity[] = [];
      let endpoint = '/v2/entities';
      let queryParams: Record<string, any> | undefined = initialParams;
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

        // links.next is a fully-qualified URL with all paging params encoded.
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

      // date_from/date_to have no server-side filter on releases — apply them
      // client-side against the release timeframe.
      if (params.date_from || params.date_to) {
        all = all.filter((r) => {
          const tf = r.fields?.timeframe;
          if (!tf) return false;
          if (params.date_to && tf.startDate && tf.startDate > params.date_to) return false;
          if (params.date_from && tf.endDate && tf.endDate < params.date_from) return false;
          return true;
        });
      }

      const total = all.length;
      const offset = params.offset ?? 0;
      const limit = params.limit ?? 20;
      const paged = all.slice(offset, offset + limit);

      return {
        success: true,
        data: {
          data: paged,
          total,
          offset,
          limit,
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
}
