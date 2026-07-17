import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '@api/index.js';
import { Logger } from '@utils/logger.js';
import { ToolExecutionResult } from '@core/types.js';
import { Permission, AccessLevel } from '@auth/permissions.js';

// Entity types searchable via v2 POST /entities/search.
const ENTITY_TYPES = ['feature', 'product', 'component', 'objective', 'initiative', 'release'] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

// Types accepted for backwards compatibility but NOT covered by the v2 entities
// search endpoint (they live under separate v2 APIs: /notes, /members).
const NON_ENTITY_TYPES = ['note', 'user'] as const;

type SearchType = EntityType | (typeof NON_ENTITY_TYPES)[number];

interface GlobalSearchParams {
  query: string;
  types?: SearchType[];
  limit?: number;
}

interface V2Entity {
  id: string;
  type?: string;
  createdAt?: string;
  updatedAt?: string;
  fields?: {
    name?: string;
    description?: string;
    status?: { id?: string; name?: string } | null;
    [key: string]: unknown;
  };
  links?: { self?: string; html?: string };
}

interface V2SearchResponse {
  data?: V2Entity[];
  links?: { next?: string | null };
}

export class GlobalSearchTool extends BaseTool<GlobalSearchParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_search',
      'Search across Productboard entities (v2 POST /entities/search; text matches entity name)',
      {
        type: 'object',
        required: ['query'],
        properties: {
          query: {
            type: 'string',
            minLength: 1,
            description:
              'Search query. Matched server-side as a case-insensitive substring of the entity name.',
          },
          types: {
            type: 'array',
            items: {
              type: 'string',
              enum: [...ENTITY_TYPES, ...NON_ENTITY_TYPES],
            },
            description:
              'Entity types to search (defaults to feature, product, component, objective, initiative, release). "note" and "user" are accepted for backwards compatibility but are not covered by the v2 entity search; they are reported as unsupported.',
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 50,
            default: 10,
            description: 'Maximum results per type.',
          },
        },
      },
      {
        requiredPermissions: [Permission.SEARCH],
        minimumAccessLevel: AccessLevel.READ,
        description: 'Requires search access',
      },
      apiClient,
      logger
    );
  }

  private extractCursor(nextUrl: string): string | undefined {
    try {
      return new URL(nextUrl).searchParams.get('pageCursor') ?? undefined;
    } catch {
      const match = nextUrl.match(/[?&]pageCursor=([^&]+)/);
      return match ? decodeURIComponent(match[1]) : undefined;
    }
  }

  private async searchEntities(query: string, types: EntityType[], perTypeLimit: number): Promise<V2Entity[]> {
    const body = {
      data: {
        filter: {
          type: types,
          fields: { name: query },
        },
        return: { fields: ['all'] },
      },
    };

    // We fetch enough pages to satisfy perTypeLimit for each requested type,
    // then trim client-side. Cap pages defensively.
    const targetTotal = perTypeLimit * types.length;
    const all: V2Entity[] = [];
    let pageCursor: string | undefined;
    let pages = 0;
    const MAX_PAGES = 40;

    do {
      const params = pageCursor ? { pageCursor } : undefined;
      const resp = await this.apiClient.post<V2SearchResponse>('/v2/entities/search', body, { params });
      all.push(...(resp?.data ?? []));

      const next = resp?.links?.next ?? undefined;
      pageCursor = next ? this.extractCursor(next) : undefined;
      pages++;
    } while (pageCursor && pages < MAX_PAGES && all.length < targetTotal);

    return all;
  }

  protected async executeInternal(params: GlobalSearchParams): Promise<ToolExecutionResult> {
    try {
      this.logger.info('Performing global search via v2 entities/search', { query: params.query });

      const limit = params.limit || 10;
      const requested = params.types && params.types.length > 0 ? params.types : [...ENTITY_TYPES];

      const entityTypes = requested.filter((t): t is EntityType =>
        (ENTITY_TYPES as readonly string[]).includes(t)
      );
      const unsupported = requested.filter((t) => (NON_ENTITY_TYPES as readonly string[]).includes(t));

      // Group results by type, capping each type at `limit`.
      const grouped: Record<string, Array<Record<string, unknown>>> = {};

      if (entityTypes.length > 0) {
        const entities = await this.searchEntities(params.query, entityTypes, limit);
        for (const e of entities) {
          const t = e.type || 'unknown';
          if (!grouped[t]) grouped[t] = [];
          if (grouped[t].length >= limit) continue;
          grouped[t].push({
            id: e.id,
            name: e.fields?.name ?? null,
            status: e.fields?.status?.name ?? null,
            description: e.fields?.description ?? null,
            createdAt: e.createdAt ?? null,
            updatedAt: e.updatedAt ?? null,
            html_url: e.links?.html ?? null,
          });
        }
      }

      const totalResults = Object.values(grouped).reduce((n, arr) => n + arr.length, 0);

      return {
        success: true,
        data: {
          query: params.query,
          typesSearched: entityTypes,
          resultsByType: grouped,
          totalResults,
          unsupportedTypes: unsupported.length
            ? {
                types: unsupported,
                reason:
                  'These types are not covered by the v2 entities/search endpoint. Use pb_search_notes for notes; members live under the v2 /members API.',
              }
            : undefined,
        },
      };
    } catch (error) {
      this.logger.error('Failed to perform global search', error);
      return {
        success: false,
        error: `Failed to perform search: ${(error as Error).message}`,
      };
    }
  }
}
