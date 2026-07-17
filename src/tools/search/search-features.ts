import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface SearchFeaturesParams {
  query: string;
  filters?: {
    status?: string[];
    product_ids?: string[];
    owner_emails?: string[];
    tags?: string[];
    created_after?: string;
    created_before?: string;
    updated_after?: string;
    updated_before?: string;
  };
  // New API-specific parameters
  status_id?: string; // UUID for status ID
  note_id?: string; // UUID for note ID
  include_archived?: boolean; // Include archived features (defaults to false)
  sort?: 'relevance' | 'created_at' | 'updated_at' | 'votes' | 'comments';
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
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
    owner?: { id?: string; email?: string } | null;
    tags?: Array<string | { name?: string }>;
    archived?: boolean;
    [key: string]: unknown;
  };
  links?: { self?: string; html?: string };
  relationships?: unknown;
}

interface V2SearchResponse {
  data?: V2Entity[];
  links?: { next?: string | null };
}

export class SearchFeaturesTool extends BaseTool<SearchFeaturesParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_search_features',
      'Advanced search for features (v2 POST /entities/search; text matches feature name, remaining filters applied client-side)',
      {
        type: 'object',
        required: ['query'],
        properties: {
          query: {
            type: 'string',
            description:
              'Search query text. Matched server-side as a case-insensitive substring of the feature name (v2 entity search only matches on name).',
          },
          filters: {
            type: 'object',
            properties: {
              status: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter by status name(s) (client-side; matches any listed status).',
              },
              product_ids: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter by parent product/component IDs (client-side over relationships; matches any listed ID).',
              },
              owner_emails: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter by owner email(s) (client-side; matches any listed email).',
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter by tags (client-side; feature must carry all listed tags).',
              },
              created_after: {
                type: 'string',
                format: 'date',
                description: 'Filter features created after date (client-side).',
              },
              created_before: {
                type: 'string',
                format: 'date',
                description: 'Filter features created before date (client-side).',
              },
              updated_after: {
                type: 'string',
                format: 'date',
                description: 'Filter features updated after date (client-side).',
              },
              updated_before: {
                type: 'string',
                format: 'date',
                description: 'Filter features updated before date (client-side).',
              },
            },
          },
          status_id: {
            type: 'string',
            description: 'Filter by status ID (UUID) (client-side).',
          },
          note_id: {
            type: 'string',
            description: 'Filter to features linked to this note ID (UUID) (client-side over relationships).',
          },
          include_archived: {
            type: 'boolean',
            default: false,
            description: 'Include archived features in results (defaults to false).',
          },
          sort: {
            type: 'string',
            enum: ['relevance', 'created_at', 'updated_at', 'votes', 'comments'],
            default: 'relevance',
            description: 'Sort results by (client-side). "votes" and "comments" are not available in v2 and are reported as ignored.',
          },
          order: {
            type: 'string',
            enum: ['asc', 'desc'],
            default: 'desc',
            description: 'Sort order (client-side).',
          },
          limit: {
            type: 'number',
            minimum: 1,
            maximum: 100,
            default: 20,
            description: 'Maximum number of results.',
          },
          offset: {
            type: 'number',
            minimum: 0,
            default: 0,
            description: 'Number of results to skip.',
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

  private async searchAllFeatures(query: string): Promise<V2Entity[]> {
    const body = {
      data: {
        filter: {
          type: ['feature'],
          fields: { name: query },
        },
        return: { fields: ['all'] },
      },
    };

    const all: V2Entity[] = [];
    let pageCursor: string | undefined;
    let pages = 0;
    const MAX_PAGES = 40;

    do {
      const params = pageCursor ? { pageCursor } : undefined;
      const resp = await this.apiClient.post<V2SearchResponse>('/v2/entities/search', body, { params });
      const batch = resp?.data ?? [];
      all.push(...batch);

      const next = resp?.links?.next ?? undefined;
      pageCursor = next ? this.extractCursor(next) : undefined;
      pages++;
    } while (pageCursor && pages < MAX_PAGES);

    this.logger.debug(`Feature search fetched ${all.length} features across ${pages} page(s)`);
    return all;
  }

  protected async executeInternal(params: SearchFeaturesParams): Promise<ToolExecutionResult> {
    try {
      this.logger.info('Searching features via v2 entities/search', { query: params.query });

      const query = (params.query || '').toLowerCase();
      const filters = params.filters ?? {};

      // Server-side: case-insensitive substring on name.
      const allFeatures = await this.searchAllFeatures(params.query || '');

      const includeArchived = params.include_archived ?? false;
      const wantTags = filters.tags?.length ? filters.tags.map((t) => t.toLowerCase()) : null;

      let filtered = allFeatures.filter((feature) => {
        const f = feature.fields ?? {};

        // Archived handling (default: exclude archived).
        if (!includeArchived && f.archived === true) return false;

        // status_id (UUID) exact match.
        if (params.status_id && f.status?.id !== params.status_id) return false;

        // status names (any match).
        if (filters.status?.length) {
          const statusName = f.status?.name?.toLowerCase();
          if (!filters.status.some((s) => s.toLowerCase() === statusName)) return false;
        }

        // owner emails (any match).
        if (filters.owner_emails?.length) {
          const ownerEmail = f.owner?.email?.toLowerCase();
          if (!filters.owner_emails.some((e) => e.toLowerCase() === ownerEmail)) return false;
        }

        // tags (must carry all listed tags).
        if (wantTags) {
          const featTags = (f.tags ?? []).map((t) =>
            (typeof t === 'string' ? t : t?.name ?? '').toLowerCase()
          );
          if (!wantTags.every((t) => featTags.includes(t))) return false;
        }

        // product/parent IDs (any match; scan relationships).
        if (filters.product_ids?.length) {
          const rels = JSON.stringify(feature.relationships ?? []);
          if (!filters.product_ids.some((id) => rels.includes(id))) return false;
        }

        // note linkage (scan relationships).
        if (params.note_id) {
          const rels = JSON.stringify(feature.relationships ?? []);
          if (!rels.includes(params.note_id)) return false;
        }

        // Date filters (strict comparisons, matching prior behavior).
        if (filters.created_after && new Date(feature.createdAt ?? 0) <= new Date(filters.created_after)) return false;
        if (filters.created_before && new Date(feature.createdAt ?? 0) >= new Date(filters.created_before)) return false;
        if (filters.updated_after && new Date(feature.updatedAt ?? 0) <= new Date(filters.updated_after)) return false;
        if (filters.updated_before && new Date(feature.updatedAt ?? 0) >= new Date(filters.updated_before)) return false;

        return true;
      });

      // Sort (client-side).
      const sortField = params.sort || 'relevance';
      const sortOrder = params.order || 'desc';
      filtered = filtered.sort((a, b) => {
        let comparison = 0;
        switch (sortField) {
          case 'created_at':
            comparison = new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
            break;
          case 'updated_at':
            comparison = new Date(a.updatedAt ?? 0).getTime() - new Date(b.updatedAt ?? 0).getTime();
            break;
          case 'relevance':
          default: {
            const aName = a.fields?.name?.toLowerCase().includes(query) ? 1 : 0;
            const bName = b.fields?.name?.toLowerCase().includes(query) ? 1 : 0;
            comparison = bName - aName;
            break;
          }
        }
        return sortOrder === 'desc' ? -comparison : comparison;
      });

      // Pagination (client-side).
      const limit = params.limit || 20;
      const offset = params.offset || 0;
      const paginated = filtered.slice(offset, offset + limit);

      const ignoredParams: string[] = [];
      if (sortField === 'votes' || sortField === 'comments') {
        ignoredParams.push(`sort=${sortField} (not available in v2)`);
      }

      this.logger.info(
        `Feature search completed: ${filtered.length} matches, returning ${paginated.length}`
      );

      return {
        success: true,
        data: {
          features: paginated,
          total: filtered.length,
          limit,
          offset,
          query: params.query,
          hasMore: offset + limit < filtered.length,
          ignoredParams: ignoredParams.length ? ignoredParams : undefined,
        },
      };
    } catch (error) {
      this.logger.error('Failed to search features', error);
      return {
        success: false,
        error: `Failed to search features: ${(error as Error).message}`,
      };
    }
  }
}
