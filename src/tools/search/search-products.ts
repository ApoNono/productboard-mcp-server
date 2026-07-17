import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface SearchProductsParams {
  query: string;
  includeComponents?: boolean;
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
    [key: string]: unknown;
  };
  links?: { self?: string; html?: string };
  relationships?: unknown;
}

interface V2SearchResponse {
  data?: V2Entity[];
  links?: { next?: string | null };
}

export class SearchProductsTool extends BaseTool<SearchProductsParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_search_products',
      'Search for products and components (v2 POST /entities/search; text matches entity name)',
      {
        type: 'object',
        required: ['query'],
        properties: {
          query: {
            type: 'string',
            description:
              'Search query text. Matched server-side as a case-insensitive substring of the product/component name.',
          },
          includeComponents: {
            type: 'boolean',
            default: true,
            description: 'Include components in search results (searches both "product" and "component" entity types).',
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

  private async searchEntities(query: string, types: string[]): Promise<V2Entity[]> {
    const body = {
      data: {
        filter: {
          type: types,
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
      all.push(...(resp?.data ?? []));

      const next = resp?.links?.next ?? undefined;
      pageCursor = next ? this.extractCursor(next) : undefined;
      pages++;
    } while (pageCursor && pages < MAX_PAGES);

    return all;
  }

  protected async executeInternal(params: SearchProductsParams): Promise<ToolExecutionResult> {
    try {
      this.logger.info('Searching products via v2 entities/search', { query: params.query });

      const includeComponents = params.includeComponents !== false;
      const types = includeComponents ? ['product', 'component'] : ['product'];

      const results = await this.searchEntities(params.query || '', types);

      // Pagination (client-side).
      const limit = params.limit || 20;
      const offset = params.offset || 0;
      const paginated = results.slice(offset, offset + limit);

      this.logger.info(
        `Product search completed: ${results.length} matches, returning ${paginated.length}`
      );

      return {
        success: true,
        data: {
          results: paginated,
          total: results.length,
          limit,
          offset,
          query: params.query,
          includeComponents,
          hasMore: offset + limit < results.length,
        },
      };
    } catch (error) {
      this.logger.error('Failed to search products', error);
      return {
        success: false,
        error: `Failed to search products: ${(error as Error).message}`,
      };
    }
  }
}
