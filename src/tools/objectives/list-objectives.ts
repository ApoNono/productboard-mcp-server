import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface ListObjectivesParams {
  status?: 'active' | 'completed' | 'cancelled';
  owner_email?: string;
  period?: 'quarter' | 'year';
  limit?: number;
  offset?: number;
}

// Shape of a single objective entity as returned by v2 /entities. Only the
// fields we surface are described; the API returns more.
interface V2Entity {
  id: string;
  type?: string;
  createdAt?: string;
  updatedAt?: string;
  fields?: {
    name?: string;
    description?: string;
    status?: { id?: string; name?: string } | null;
    owner?: { id?: string; email?: string } | null;
    timeframe?: unknown;
    teams?: unknown;
    archived?: boolean;
    health?: unknown;
  };
  links?: { self?: string; html?: string };
  relationships?: unknown;
}

interface V2ListResponse {
  data?: V2Entity[];
  links?: { next?: string | null };
}

export class ListObjectivesTool extends BaseTool<ListObjectivesParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_objective_list',
      'List objectives with optional filtering',
      {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['active', 'completed', 'cancelled'],
            description:
              'Filter by objective status. NOTE: the v2 API filters on named workflow statuses (e.g. "Upcoming", "In Progress"), which do not map to these legacy values, so this filter is reported as ignored.',
          },
          owner_email: {
            type: 'string',
            format: 'email',
            description: 'Filter by owner email (applied server-side via owner[email]).',
          },
          period: {
            type: 'string',
            enum: ['quarter', 'year'],
            description:
              'Filter by objective period. NOTE: not a field on the v2 objective entity; reported as ignored.',
          },
          limit: {
            type: 'number',
            minimum: 1,
            maximum: 100,
            default: 20,
            description: 'Maximum number of objectives to return',
          },
          offset: {
            type: 'number',
            minimum: 0,
            default: 0,
            description:
              'Number of objectives to skip. Applied client-side (v2 uses cursor pagination, not offset).',
          },
        },
      },
      {
        requiredPermissions: [Permission.OBJECTIVES_READ],
        minimumAccessLevel: AccessLevel.READ,
        description: 'Requires read access to objectives',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(params: ListObjectivesParams = {}): Promise<ToolExecutionResult> {
    try {
      this.logger.info('Listing objectives (v2 /entities)');

      const limit = params.limit ?? 20;
      const offset = params.offset ?? 0;
      // We must collect offset+limit items to honour client-side offset.
      const cap = offset + limit;

      const serverParams: Record<string, string> = {
        'type[]': 'objective',
        'fields[]': 'all',
      };
      if (params.owner_email) serverParams['owner[email]'] = params.owner_email;

      const collected: ReturnType<typeof this.shapeObjective>[] = [];
      let pageCursor: string | undefined;
      let pages = 0;
      let sawNextLink = false;
      const MAX_PAGES = 40;

      do {
        const query: Record<string, string> = { ...serverParams };
        if (pageCursor) query.pageCursor = pageCursor;

        const resp = await this.apiClient.get<V2ListResponse>('/v2/entities', query);
        const batch = resp?.data ?? [];
        for (const entity of batch) {
          collected.push(this.shapeObjective(entity));
        }

        const next = resp?.links?.next ?? undefined;
        sawNextLink = Boolean(next);
        pageCursor = next ? this.extractCursor(next) : undefined;
        pages++;
      } while (pageCursor && collected.length < cap && pages < MAX_PAGES);

      const page = collected.slice(offset, offset + limit);

      const ignoredFilters: string[] = [];
      if (params.status) ignoredFilters.push('status');
      if (params.period) ignoredFilters.push('period');

      return {
        success: true,
        data: {
          objectives: page,
          returned: page.length,
          totalScanned: collected.length,
          hasMore: sawNextLink || collected.length > offset + limit,
          pagesScanned: pages,
          appliedServerFilters: params.owner_email ? ['owner[email]'] : [],
          ignoredFilters: ignoredFilters.length ? ignoredFilters : undefined,
        },
      };
    } catch (error) {
      this.logger.error('Failed to list objectives', error);
      return {
        success: false,
        error: `Failed to list objectives: ${(error as Error).message}`,
      };
    }
  }

  private shapeObjective(entity: V2Entity) {
    const f = entity.fields ?? {};
    return {
      id: entity.id,
      name: f.name || 'Untitled Objective',
      status: f.status?.name ?? null,
      owner_email: f.owner?.email ?? null,
      archived: f.archived ?? null,
      created_at: entity.createdAt ?? null,
      updated_at: entity.updatedAt ?? null,
      html_url: entity.links?.html ?? null,
    };
  }

  private extractCursor(nextUrl: string): string | undefined {
    try {
      return new URL(nextUrl).searchParams.get('pageCursor') ?? undefined;
    } catch {
      const match = nextUrl.match(/[?&]pageCursor=([^&]+)/);
      return match ? decodeURIComponent(match[1]) : undefined;
    }
  }
}
