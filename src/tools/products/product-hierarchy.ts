import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface ProductHierarchyParams {
  product_id?: string;
  depth?: number;
  include_features?: boolean;
}

interface HierarchyNode {
  id: string;
  name: string;
  type: 'product' | 'component' | 'feature';
  children: HierarchyNode[];
}

interface ProductboardListResponse<T> {
  data: T[];
  links?: { next?: string };
  pageCursor?: string | null;
}

interface ProductboardEntity {
  id: string;
  name: string;
  parent?: {
    product?: { id: string };
    component?: { id: string };
  } | null;
}

export class ProductHierarchyTool extends BaseTool<ProductHierarchyParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_product_hierarchy',
      'Get the complete product hierarchy tree',
      {
        type: 'object',
        properties: {
          product_id: {
            type: 'string',
            description: 'Root product ID (optional, defaults to all top-level products)',
          },
          depth: {
            type: 'integer',
            minimum: 1,
            maximum: 5,
            default: 3,
            description: 'Maximum depth of hierarchy to retrieve',
          },
          include_features: {
            type: 'boolean',
            default: false,
            description: 'Include features at each level',
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

  protected async executeInternal(params: ProductHierarchyParams = {}): Promise<unknown> {
    this.logger.info('Building product hierarchy');

    // Productboard does not expose a /products/hierarchy endpoint — calling it
    // returns 400 ("Input string 'hierarchy' is not a valid UUID"). The
    // hierarchy must be assembled client-side from /products and /components
    // (and optionally /features), each of which carries a `parent` reference.
    const depth = params.depth ?? 3;
    const includeFeatures = params.include_features ?? false;

    const [products, components, features] = await Promise.all([
      this.fetchAllPages('/products'),
      this.fetchAllPages('/components'),
      includeFeatures ? this.fetchAllPages('/features') : Promise.resolve<ProductboardEntity[]>([]),
    ]);

    // Build a map of nodes keyed by id, then attach each entity to its parent.
    const nodes = new Map<string, HierarchyNode>();
    const addNode = (e: ProductboardEntity, type: HierarchyNode['type']): HierarchyNode => {
      const node: HierarchyNode = { id: e.id, name: e.name, type, children: [] };
      nodes.set(e.id, node);
      return node;
    };

    products.forEach(p => addNode(p, 'product'));
    components.forEach(c => addNode(c, 'component'));
    features.forEach(f => addNode(f, 'feature'));

    const attach = (e: ProductboardEntity): void => {
      const parentId = e.parent?.product?.id ?? e.parent?.component?.id;
      if (!parentId) return;
      const parent = nodes.get(parentId);
      const self = nodes.get(e.id);
      if (parent && self) parent.children.push(self);
    };

    components.forEach(attach);
    features.forEach(attach);

    // Determine roots: a specific product (if requested) or all top-level products.
    let roots: HierarchyNode[];
    if (params.product_id) {
      const root = nodes.get(params.product_id);
      if (!root) {
        return {
          success: false,
          error: `Product not found: ${params.product_id}`,
        };
      }
      roots = [root];
    } else {
      roots = products
        .filter(p => !p.parent?.product?.id && !p.parent?.component?.id)
        .map(p => nodes.get(p.id))
        .filter((n): n is HierarchyNode => Boolean(n));
    }

    // Truncate the tree at the requested depth.
    const truncate = (node: HierarchyNode, levelsRemaining: number): HierarchyNode => ({
      id: node.id,
      name: node.name,
      type: node.type,
      children:
        levelsRemaining <= 1
          ? []
          : node.children.map(c => truncate(c, levelsRemaining - 1)),
    });

    const tree = roots.map(r => truncate(r, depth));

    return {
      success: true,
      data: {
        tree,
        counts: {
          products: products.length,
          components: components.length,
          features: features.length,
        },
      },
    };
  }

  /**
   * Fetch every page of a Productboard list endpoint by following the
   * `links.next` cursor. Used because hierarchy reconstruction needs every
   * entity, not just the first page.
   */
  private async fetchAllPages(endpoint: string): Promise<ProductboardEntity[]> {
    const all: ProductboardEntity[] = [];
    let nextEndpoint: string | undefined = endpoint;
    let nextParams: Record<string, any> | undefined = { pageLimit: 100 };

    while (nextEndpoint) {
      const response = (await this.apiClient.makeRequest({
        method: 'GET',
        endpoint: nextEndpoint,
        params: nextParams,
      })) as ProductboardListResponse<ProductboardEntity>;

      if (Array.isArray(response?.data)) {
        all.push(...response.data);
      }

      // Productboard returns links.next as a fully-qualified URL; once we have
      // a cursor link, all paging params are encoded in it, so we drop our own.
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
