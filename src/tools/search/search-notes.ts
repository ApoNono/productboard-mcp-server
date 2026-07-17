import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface SearchNotesParams {
  query: string;
  filters?: {
    customer_emails?: string[];
    company_names?: string[];
    tags?: string[];
    source?: string[];
    created_after?: string;
    created_before?: string;
    feature_ids?: string[];
  };
  sort?: 'relevance' | 'created_at' | 'sentiment';
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

interface V2Note {
  id: string;
  createdAt?: string;
  fields?: {
    name?: string;
    content?: string;
    owner?: { email?: string } | null;
    tags?: Array<string | { name?: string }>;
    processed?: boolean;
  };
  links?: { html?: string };
  relationships?: unknown;
}

interface V2ListResponse {
  data?: V2Note[];
  links?: { next?: string | null };
}

export class SearchNotesTool extends BaseTool<SearchNotesParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_search_notes',
      'Search customer notes by text (client-side over the v2 /notes endpoint)',
      {
        type: 'object',
        required: ['query'],
        properties: {
          query: {
            type: 'string',
            description:
              'Text to match against note name + content. The v2 API has no server-side note text search, so matching is done client-side over notes fetched within the (optional) date window.',
          },
          filters: {
            type: 'object',
            properties: {
              customer_emails: {
                type: 'array',
                items: { type: 'string' },
                description: 'NOT supported by v2 /notes (customer data is not on the note object); reported as ignored.',
              },
              company_names: {
                type: 'array',
                items: { type: 'string' },
                description: 'NOT supported by v2 /notes; reported as ignored.',
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter by tags (client-side; note must carry all listed tags).',
              },
              source: {
                type: 'array',
                items: { type: 'string' },
                description: 'NOT supported by v2 /notes; reported as ignored.',
              },
              created_after: {
                type: 'string',
                format: 'date',
                description: 'Only notes created on/after this date (YYYY-MM-DD). Maps to v2 created_from.',
              },
              created_before: {
                type: 'string',
                format: 'date',
                description: 'Only notes created on/before this date (YYYY-MM-DD). Maps to v2 created_to.',
              },
              feature_ids: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter to notes linked to any of these features (client-side over relationships).',
              },
            },
          },
          sort: {
            type: 'string',
            enum: ['relevance', 'created_at', 'sentiment'],
            default: 'relevance',
            description: 'Retained for backwards compatibility. Only created_at ordering is applied client-side; other values are ignored.',
          },
          order: {
            type: 'string',
            enum: ['asc', 'desc'],
            default: 'desc',
            description: 'Sort order for created_at (client-side).',
          },
          limit: {
            type: 'number',
            minimum: 1,
            maximum: 200,
            default: 20,
            description: 'Maximum number of matching notes to return.',
          },
          offset: {
            type: 'number',
            minimum: 0,
            default: 0,
            description: 'Retained for backwards compatibility; v2 uses cursor pagination, so offset has no effect.',
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

  protected async executeInternal(params: SearchNotesParams): Promise<ToolExecutionResult> {
    this.logger.info('Searching notes (client-side over v2 /notes)', { query: params.query });

    try {
      const f = params.filters ?? {};
      const serverParams: Record<string, string> = {};
      if (f.created_after) serverParams.created_from = f.created_after;
      if (f.created_before) serverParams.created_to = f.created_before;

      const term = (params.query || '').toLowerCase();
      const wantTags = f.tags?.length ? f.tags.map((t) => t.toLowerCase()) : null;
      const wantFeatures = f.feature_ids?.length ? f.feature_ids : null;
      const cap = Math.min(params.limit ?? 20, 200);

      const matches: Array<Record<string, unknown>> = [];
      let pageCursor: string | undefined;
      let pages = 0;
      const MAX_PAGES = 40; // ~2000 notes scanned

      do {
        const query: Record<string, string> = { ...serverParams };
        if (pageCursor) query.pageCursor = pageCursor;

        const resp = await this.apiClient.get<V2ListResponse>('/v2/notes', query);
        const batch = resp?.data ?? [];

        for (const note of batch) {
          const nf = note.fields ?? {};
          const haystack = `${nf.name ?? ''} ${nf.content ?? ''}`.toLowerCase();
          if (term && !haystack.includes(term)) continue;

          if (wantTags) {
            const noteTags = (nf.tags ?? []).map((t) =>
              (typeof t === 'string' ? t : t?.name ?? '').toLowerCase()
            );
            if (!wantTags.every((t) => noteTags.includes(t))) continue;
          }

          if (wantFeatures) {
            const rels = JSON.stringify(note.relationships ?? []);
            if (!wantFeatures.some((id) => rels.includes(id))) continue;
          }

          matches.push({
            id: note.id,
            name: nf.name || 'Untitled Note',
            owner_email: nf.owner?.email ?? null,
            processed: nf.processed ?? null,
            created_at: note.createdAt ?? null,
            html_url: note.links?.html ?? null,
            content: nf.content ?? '',
          });
        }

        const next = resp?.links?.next ?? undefined;
        pageCursor = next ? this.extractCursor(next) : undefined;
        pages++;
      } while (pageCursor && pages < MAX_PAGES);

      // Client-side ordering by created_at (only ordering v2 data supports here).
      const asc = params.order === 'asc';
      matches.sort((a, b) => {
        const av = String(a.created_at ?? '');
        const bv = String(b.created_at ?? '');
        return asc ? av.localeCompare(bv) : bv.localeCompare(av);
      });

      const ignoredFilters: string[] = [];
      if (f.customer_emails?.length) ignoredFilters.push('customer_emails');
      if (f.company_names?.length) ignoredFilters.push('company_names');
      if (f.source?.length) ignoredFilters.push('source');

      return {
        success: true,
        data: {
          notes: matches.slice(0, cap),
          returned: Math.min(matches.length, cap),
          totalMatched: matches.length,
          pagesScanned: pages,
          truncated: matches.length > cap,
          ignoredFilters: ignoredFilters.length ? ignoredFilters : undefined,
          note: 'Text search is performed client-side; broaden the date window (created_after/created_before) if a known note is missing.',
        },
      };
    } catch (error) {
      this.logger.error('Failed to search notes', error);
      return {
        success: false,
        error: `Failed to search notes: ${(error as Error).message}`,
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
