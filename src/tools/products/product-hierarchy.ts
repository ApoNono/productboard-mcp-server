import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface ProductHierarchyParams {
  product_id?: string;
  depth?: number;
  include_features?: boolean;
}

type NodeType = 'product' | 'component' | 'feature' | 'subfeature';

interface HierarchyNode {
  id: string;
  name: string;
  type: NodeType;
  children: HierarchyNode[];
}

interface V2Entity {
  id: string;
  type?: string;
  fields?: { name?: string; [key: string]: unknown };
  relationships?: { data?: Array<{ type?: string; target?: { id?: string; type?: string } }> };
}

interface V2ListResponse {
  data?: V2Entity[];
  links?: { next?: string | null };
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
            description: 'Include features (and subfeatures) at each level',
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

  protected async executeInternal(params: ProductHierarchyParams = {}): Promise<ToolExecutionResult> {
    this.logger.info('Building product hierarchy (v2 /entities)');

    try {
      // The v2 API has no dedicated hierarchy endpoint. Each entity, however,
      // carries its children as `child` relationships (verified via curl), so
      // the tree is reconstructed client-side: fetch every entity of the
      // relevant types, index by id, then attach children by relationship.
      const depth = params.depth ?? 3;
      const includeFeatures = params.include_features ?? false;

      const [products, components, features, subfeatures] = await Promise.all([
        this.fetchAllEntities('product'),
        this.fetchAllEntities('component'),
        includeFeatures ? this.fetchAllEntities('feature') : Promise.resolve<V2Entity[]>([]),
        includeFeatures ? this.fetchAllEntities('subfeature') : Promise.resolve<V2Entity[]>([]),
      ]);

      const nodes = new Map<string, HierarchyNode>();
      const addNode = (e: V2Entity, type: NodeType): void => {
        nodes.set(e.id, {
          id: e.id,
          name: e.fields?.name ?? 'Untitled',
          type,
          children: [],
        });
      };

      products.forEach((e) => addNode(e, 'product'));
      components.forEach((e) => addNode(e, 'component'));
      features.forEach((e) => addNode(e, 'feature'));
      subfeatures.forEach((e) => addNode(e, 'subfeature'));

      // Attach children using each entity's `child` relationships. A Set guards
      // against attaching the same child twice (an entity can surface a child
      // both here and via the child's own record).
      const attached = new Set<string>();
      const attachChildren = (e: V2Entity): void => {
        const parent = nodes.get(e.id);
        if (!parent) return;
        for (const rel of e.relationships?.data ?? []) {
          if (rel.type !== 'child') continue;
          const childId = rel.target?.id;
          if (!childId) continue;
          const child = nodes.get(childId);
          const edge = `${e.id}->${childId}`;
          if (child && !attached.has(edge)) {
            parent.children.push(child);
            attached.add(edge);
          }
        }
      };

      products.forEach(attachChildren);
      components.forEach(attachChildren);
      features.forEach(attachChildren);

      // Roots: a specific product (if requested) or all products that are not
      // themselves a child of another indexed entity.
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
        const childIds = new Set<string>();
        for (const edge of attached) childIds.add(edge.split('->')[1]);
        roots = products
          .map((p) => nodes.get(p.id))
          .filter((n): n is HierarchyNode => Boolean(n) && !childIds.has(n!.id));
      }

      const truncate = (node: HierarchyNode, levelsRemaining: number): HierarchyNode => ({
        id: node.id,
        name: node.name,
        type: node.type,
        children:
          levelsRemaining <= 1 ? [] : node.children.map((c) => truncate(c, levelsRemaining - 1)),
      });

      const tree = roots.map((r) => truncate(r, depth));

      return {
        success: true,
        data: {
          tree,
          counts: {
            products: products.length,
            components: components.length,
            features: features.length,
            subfeatures: subfeatures.length,
          },
        },
      };
    } catch (error) {
      this.logger.error('Failed to build product hierarchy', error);
      return {
        success: false,
        error: `Failed to build product hierarchy: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Fetch every entity of a given type by following the v2 links.next cursor.
   * Hierarchy reconstruction needs every entity, not just the first page.
   */
  private async fetchAllEntities(type: NodeType): Promise<V2Entity[]> {
    const all: V2Entity[] = [];
    let pageCursor: string | undefined;
    let pages = 0;
    const MAX_PAGES = 40;

    do {
      const query: Record<string, string> = { 'type[]': type, 'fields[]': 'all' };
      if (pageCursor) query.pageCursor = pageCursor;

      const resp = await this.apiClient.get<V2ListResponse>('/v2/entities', query);
      if (Array.isArray(resp?.data)) all.push(...resp.data);

      const next = resp?.links?.next ?? undefined;
      pageCursor = next ? this.extractCursor(next) : undefined;
      pages++;
    } while (pageCursor && pages < MAX_PAGES);

    return all;
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
