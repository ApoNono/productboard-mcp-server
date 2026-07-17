import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface ListProductsParams {
  parent_id?: string;
  include_components?: boolean;
  include_archived?: boolean;
}

// Minimal shape of a v2 entity as returned by GET /v2/entities.
interface V2Entity {
  id: string;
  type?: string;
  createdAt?: string;
  updatedAt?: string;
  fields?: {
    name?: string;
    description?: string;
    owner?: { id?: string; email?: string } | null;
    archived?: boolean;
    [key: string]: unknown;
  };
  links?: { self?: string; html?: string };
  relationships?: { data?: Array<{ type?: string; target?: { id?: string; type?: string } }> };
}

interface V2ListResponse {
  data?: V2Entity[];
  links?: { next?: string | null };
}

export class ListProductsTool extends BaseTool<ListProductsParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_product_list',
      'List all products in the workspace',
      {
        type: 'object',
        properties: {
          parent_id: {
            type: 'string',
            description: 'Filter by parent product ID (for sub-products). Maps to the v2 parent[id] filter.',
          },
          include_components: {
            type: 'boolean',
            default: false,
            description: 'Include the child component references carried on each product entity.',
          },
          include_archived: {
            type: 'boolean',
            default: false,
            description: 'Include archived products (applied client-side; archived products are excluded by default).',
          },
        },
      },
      {
        requiredPermissions: [Permission.PRODUCTS_READ],
        minimumAccessLevel: AccessLevel.READ,
        description: 'Requires read access to products',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(params: ListProductsParams = {}): Promise<ToolExecutionResult> {
    this.logger.info('Listing products (v2 /entities type=product)');

    try {
      // v2 lists entities by type. Products are entities of type "product".
      const serverParams: Record<string, string> = {
        'type[]': 'product',
        'fields[]': 'all',
      };
      // parent[id] is a supported server-side filter (verified via curl).
      if (params.parent_id) serverParams['parent[id]'] = params.parent_id;

      const collected: V2Entity[] = [];
      let pageCursor: string | undefined;
      let pages = 0;
      const MAX_PAGES = 40;

      do {
        const query: Record<string, string> = { ...serverParams };
        if (pageCursor) query.pageCursor = pageCursor;

        const resp = await this.apiClient.get<V2ListResponse>('/v2/entities', query);
        const batch = resp?.data ?? [];
        collected.push(...batch);

        const next = resp?.links?.next ?? undefined;
        pageCursor = next ? this.extractCursor(next) : undefined;
        pages++;
      } while (pageCursor && pages < MAX_PAGES);

      const includeArchived = params.include_archived ?? false;
      const filtered = includeArchived
        ? collected
        : collected.filter((e) => e.fields?.archived !== true);

      const products = filtered.map((e) => this.shapeProduct(e, params.include_components ?? false));

      return {
        success: true,
        data: {
          products,
          total: products.length,
          pagesScanned: pages,
        },
      };
    } catch (error) {
      this.logger.error('Failed to list products', error);
      return {
        success: false,
        error: `Failed to list products: ${(error as Error).message}`,
      };
    }
  }

  private shapeProduct(e: V2Entity, includeComponents: boolean) {
    const f = e.fields ?? {};
    const shaped: Record<string, unknown> = {
      id: e.id,
      name: f.name ?? 'Untitled Product',
      description: f.description ?? '',
      owner_email: f.owner?.email ?? null,
      archived: f.archived ?? false,
      created_at: e.createdAt ?? null,
      updated_at: e.updatedAt ?? null,
      html_url: e.links?.html ?? null,
    };
    if (includeComponents) {
      shaped.components = (e.relationships?.data ?? [])
        .filter((r) => r.type === 'child' && r.target?.type === 'component')
        .map((r) => r.target?.id)
        .filter((id): id is string => Boolean(id));
    }
    return shaped;
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
