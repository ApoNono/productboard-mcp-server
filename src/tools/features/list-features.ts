import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';
import { ToolExecutionResult } from '../../core/types.js';

interface ListFeaturesParams {
  status?: 'new' | 'in_progress' | 'validation' | 'done' | 'archived';
  product_id?: string;
  component_id?: string;
  owner_email?: string;
  tags?: string[];
  search?: string;
  limit?: number;
  offset?: number;
  sort?: 'created_at' | 'updated_at' | 'name' | 'priority';
  order?: 'asc' | 'desc';
}

// Shape of a single feature entity as returned by v2 /entities. Only the
// fields we surface are described; the API returns more (incl. custom fields
// keyed by UUID).
interface V2Feature {
  id: string;
  type?: string;
  createdAt?: string;
  updatedAt?: string;
  fields?: {
    name?: string;
    description?: string;
    status?: { id?: string; name?: string } | null;
    owner?: { id?: string; email?: string } | null;
    teams?: Array<{ id?: string; name?: string }>;
    archived?: boolean;
    tags?: Array<string | { id?: string; name?: string }>;
    timeframe?: unknown;
  };
  links?: { self?: string; html?: string };
  relationships?: unknown;
}

interface V2ListResponse {
  data?: V2Feature[];
  links?: { next?: string | null };
}

// Best-effort mapping from the tool's stable status enum to v2 workflow status
// display names. Display names are workspace-configurable, so this is applied
// server-side as a best-effort filter and reported in appliedServerFilters.
const STATUS_NAME_MAP: Record<string, string> = {
  new: 'New',
  in_progress: 'In progress',
  validation: 'Validation',
  done: 'Done',
};

export class ListFeaturesTool extends BaseTool<ListFeaturesParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_feature_list',
      'List features with optional filtering and pagination (Productboard v2 /entities, type=feature)',
      {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['new', 'in_progress', 'validation', 'done', 'archived'],
            description:
              'Filter by feature status. "archived" maps to the v2 archived flag; the workflow statuses map (best-effort) to v2 status display names, which are workspace-configurable.',
          },
          product_id: {
            type: 'string',
            description:
              'Filter by parent product ID (maps to the v2 parent[id] filter). If both product_id and component_id are given, component_id wins.',
          },
          component_id: {
            type: 'string',
            description: 'Filter by parent component ID (maps to the v2 parent[id] filter).',
          },
          owner_email: {
            type: 'string',
            description: 'Filter by owner email (maps to the v2 owner[email] filter).',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Filter by tags (features must have all specified tags). Applied client-side; v2 /entities has no server-side tag filter.',
          },
          search: {
            type: 'string',
            description:
              'Case-insensitive substring match on feature name (maps to the v2 name filter). Does not search descriptions server-side.',
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            default: 20,
            description: 'Number of results to return (applied client-side after filtering).',
          },
          offset: {
            type: 'integer',
            minimum: 0,
            default: 0,
            description: 'Number of results to skip (applied client-side after filtering).',
          },
          sort: {
            type: 'string',
            enum: ['created_at', 'updated_at', 'name', 'priority'],
            default: 'created_at',
            description:
              'Sort field (applied client-side). "priority" has no v2 equivalent and is ignored (reported in ignoredParams).',
          },
          order: {
            type: 'string',
            enum: ['asc', 'desc'],
            default: 'desc',
            description: 'Sort order (applied client-side).',
          },
        },
      },
      {
        requiredPermissions: [Permission.FEATURES_READ],
        minimumAccessLevel: AccessLevel.READ,
        description: 'Requires read access to features',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(params: ListFeaturesParams = {}): Promise<ToolExecutionResult> {
    this.logger.info('Listing features (v2 /entities type=feature)');

    try {
      // Server-side filters supported by v2 /entities.
      const serverParams: Record<string, string> = {
        'type[]': 'feature',
        'fields[]': 'all',
      };

      if (params.search) serverParams.name = params.search;
      if (params.owner_email) serverParams['owner[email]'] = params.owner_email;

      // Only one parent[id] can be applied; component takes precedence.
      const parentId = params.component_id || params.product_id;
      if (parentId) serverParams['parent[id]'] = parentId;

      if (params.status === 'archived') {
        serverParams.archived = 'true';
      } else if (params.status && STATUS_NAME_MAP[params.status]) {
        serverParams['status[name]'] = STATUS_NAME_MAP[params.status];
      }

      const wantTags = params.tags?.length
        ? params.tags.map((t) => t.toLowerCase())
        : null;

      const limit = params.limit ?? 20;
      const offset = params.offset ?? 0;
      // We must collect enough matches to satisfy offset + limit after
      // client-side tag filtering.
      const need = offset + limit;

      const matched: V2Feature[] = [];
      let pageCursor: string | undefined;
      let pages = 0;
      let sawNextLink = false;
      // v2 returns 100 entities/page; 40 pages scans ~4000 features.
      const MAX_PAGES = 40;

      do {
        const query: Record<string, string> = { ...serverParams };
        if (pageCursor) query.pageCursor = pageCursor;

        const resp = await this.apiClient.get<V2ListResponse>('/v2/entities', query);
        const batch = resp?.data ?? [];

        for (const feature of batch) {
          if (!this.matchesTags(feature, wantTags)) continue;
          matched.push(feature);
        }

        const next = resp?.links?.next ?? undefined;
        sawNextLink = Boolean(next);
        pageCursor = next ? this.extractCursor(next) : undefined;
        pages++;
        // Stop early once we have enough for this page, unless a client-side
        // sort other than the server default is requested (then we need the
        // full window to sort correctly).
        if (!params.sort && matched.length >= need) break;
      } while (pageCursor && pages < MAX_PAGES);

      // Client-side sort.
      const sortField = params.sort ?? 'created_at';
      const order = params.order ?? 'desc';
      const ignoredParams: string[] = [];
      if (sortField === 'priority') {
        ignoredParams.push('sort=priority (no v2 equivalent)');
      } else {
        this.sortFeatures(matched, sortField, order);
      }

      const page = matched.slice(offset, offset + limit);
      const shaped = page.map((f) => this.shapeFeature(f));

      const clientSideFilters: string[] = [];
      if (wantTags) clientSideFilters.push('tags');

      return {
        success: true,
        data: {
          features: shaped,
          returned: shaped.length,
          matchedTotal: matched.length,
          hasMore: sawNextLink || matched.length > offset + limit,
          pagesScanned: pages,
          appliedServerFilters: Object.keys(serverParams).filter(
            (k) => k !== 'type[]' && k !== 'fields[]'
          ),
          clientSideFilters: clientSideFilters.length ? clientSideFilters : undefined,
          ignoredParams: ignoredParams.length ? ignoredParams : undefined,
          note:
            'v2 /entities has no server-side tag filter or sort; those are applied client-side across the scanned window. Status display names are workspace-configurable, so the status filter is best-effort.',
        },
      };
    } catch (error) {
      this.logger.error('Failed to list features', error);
      return {
        success: false,
        error: `Failed to list features: ${(error as Error).message}`,
      };
    }
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private shapeFeature(feature: V2Feature) {
    const f = feature.fields ?? {};
    return {
      id: feature.id,
      name: f.name || 'Untitled Feature',
      description: f.description ? this.stripHtml(f.description) : '',
      status: f.status?.name || 'Unknown',
      owner: f.owner?.email || 'Unassigned',
      archived: f.archived ?? null,
      tags: (f.tags ?? []).map((t) => (typeof t === 'string' ? t : t?.name ?? '')),
      teams: (f.teams ?? []).map((t) => t?.name ?? '').filter(Boolean),
      html_url: feature.links?.html ?? null,
      createdAt: feature.createdAt ?? null,
      updatedAt: feature.updatedAt ?? null,
    };
  }

  private matchesTags(feature: V2Feature, wantTags: string[] | null): boolean {
    if (!wantTags) return true;
    const featureTags = (feature.fields?.tags ?? []).map((t) =>
      (typeof t === 'string' ? t : t?.name ?? '').toLowerCase()
    );
    return wantTags.every((t) => featureTags.includes(t));
  }

  private sortFeatures(
    features: V2Feature[],
    field: 'created_at' | 'updated_at' | 'name',
    order: 'asc' | 'desc'
  ): void {
    const dir = order === 'asc' ? 1 : -1;
    features.sort((a, b) => {
      let av: string;
      let bv: string;
      if (field === 'name') {
        av = (a.fields?.name ?? '').toLowerCase();
        bv = (b.fields?.name ?? '').toLowerCase();
      } else if (field === 'updated_at') {
        av = a.updatedAt ?? '';
        bv = b.updatedAt ?? '';
      } else {
        av = a.createdAt ?? '';
        bv = b.createdAt ?? '';
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
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
