import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface ListInitiativesParams {
  status?: string;
  owner_email?: string;
  archived?: boolean;
  limit?: number;
}

// Shape of a single initiative entity as returned by v2 /entities. Only the
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
    archived?: boolean;
    [key: string]: unknown;
  };
  links?: { self?: string; html?: string };
}

interface V2ListResponse {
  data?: V2Entity[];
  links?: { next?: string | null };
}

export class ListInitiativesTool extends BaseTool<ListInitiativesParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_initiative_list',
      'List initiatives in the workspace',
      {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: 'Filter by initiative status name (e.g., "In Progress", "Completed")',
          },
          owner_email: {
            type: 'string',
            format: 'email',
            description: 'Filter by owner email',
          },
          archived: {
            type: 'boolean',
            description: 'Include archived initiatives (default: false)',
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            default: 20,
            description: 'Maximum number of results',
          },
        },
      },
      {
        requiredPermissions: [Permission.INITIATIVES_READ],
        minimumAccessLevel: AccessLevel.READ,
        description: 'Requires read access to initiatives',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(params: ListInitiativesParams = {}): Promise<ToolExecutionResult> {
    try {
      this.logger.info('Listing initiatives (v2 /entities)');

      // v2 entities list: filter server-side by type and (per the v2 contract)
      // status[name], owner[email], and archived. Array-style params are passed
      // with the literal bracketed key; axios URL-encodes them and the API
      // accepts the result (verified against the live API).
      const baseParams: Record<string, string | boolean> = {
        'type[]': 'initiative',
        'fields[]': 'all',
      };
      if (params.status) baseParams['status[name]'] = params.status;
      if (params.owner_email) baseParams['owner[email]'] = params.owner_email;
      if (params.archived !== undefined) baseParams.archived = params.archived;

      const cap = Math.min(params.limit ?? 20, 100);
      const collected: V2Entity[] = [];
      let pageCursor: string | undefined;
      let pages = 0;
      let sawNextLink = false;
      // Safety cap: v2 returns up to 100/page, so 40 pages scans ~4000 entities.
      const MAX_PAGES = 40;

      do {
        const query: Record<string, string | boolean> = { ...baseParams };
        if (pageCursor) query.pageCursor = pageCursor;

        const resp = await this.apiClient.get<V2ListResponse>('/v2/entities', query);
        const batch = resp?.data ?? [];

        for (const entity of batch) {
          collected.push(entity);
          if (collected.length >= cap) break;
        }

        const next = resp?.links?.next ?? undefined;
        sawNextLink = Boolean(next);
        pageCursor = next ? this.extractCursor(next) : undefined;
        pages++;
      } while (pageCursor && collected.length < cap && pages < MAX_PAGES);

      const initiatives = collected.map((i) => {
        const f = i.fields ?? {};
        return {
          id: i.id,
          name: f.name,
          description: f.description,
          status: f.status?.name,
          owner: f.owner?.email,
          timeframe: f.timeframe,
          archived: f.archived,
          createdAt: i.createdAt,
          updatedAt: i.updatedAt,
          html: i.links?.html,
        };
      });

      return {
        success: true,
        data: {
          initiatives,
          total: initiatives.length,
          hasMore: sawNextLink && initiatives.length >= cap,
          pagesScanned: pages,
        },
      };
    } catch (error) {
      this.logger.error('Failed to list initiatives', error);
      return {
        success: false,
        error: `Failed to list initiatives: ${(error as Error).message}`,
      };
    }
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
