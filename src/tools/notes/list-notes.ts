import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '@api/index.js';
import { Logger } from '@utils/logger.js';
import { Permission, AccessLevel } from '@auth/permissions.js';
import { ToolExecutionResult } from '../../core/types.js';

interface ListNotesParams {
  feature_id?: string;
  customer_email?: string;
  company_name?: string;
  tags?: string[];
  date_from?: string;
  date_to?: string;
  limit?: number;
}

// Shape of a single note as returned by the v2 /notes endpoint. Only the
// fields we surface are described; the API returns more.
interface V2Note {
  id: string;
  type?: string;
  createdAt?: string;
  updatedAt?: string;
  fields?: {
    name?: string;
    content?: string;
    owner?: { id?: string; email?: string } | null;
    tags?: Array<string | { name?: string }>;
    archived?: boolean;
    processed?: boolean;
  };
  links?: { self?: string; html?: string };
  relationships?: unknown;
}

interface V2ListResponse {
  data?: V2Note[];
  links?: { next?: string | null };
}

export class ListNotesTool extends BaseTool<ListNotesParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_note_list',
      'List customer feedback notes (Productboard v2 /notes)',
      {
        type: 'object',
        properties: {
          feature_id: {
            type: 'string',
            description:
              'Filter to notes linked to a specific feature/entity. Applied client-side by inspecting each note\'s relationships (the v2 API has no server-side feature filter).',
          },
          customer_email: {
            type: 'string',
            description:
              'NOTE: not available on the v2 /notes endpoint — the note object does not expose customer data, so this filter is reported as ignored.',
          },
          company_name: {
            type: 'string',
            description:
              'NOTE: not available on the v2 /notes endpoint — reported as ignored.',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by tags (applied client-side; a note must carry all listed tags).',
          },
          date_from: {
            type: 'string',
            format: 'date',
            description: 'Only notes created on/after this date (YYYY-MM-DD). Maps to the v2 created_from filter.',
          },
          date_to: {
            type: 'string',
            format: 'date',
            description: 'Only notes created on/before this date (YYYY-MM-DD). Maps to the v2 created_to filter.',
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 500,
            default: 100,
            description:
              'Maximum number of notes to return. The v2 API ignores page size (fixed ~50/page); this tool follows the cursor across pages until the cap is reached or the window is exhausted.',
          },
        },
      },
      {
        requiredPermissions: [Permission.NOTES_READ],
        minimumAccessLevel: AccessLevel.READ,
        description: 'Requires read access to notes',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(params: ListNotesParams = {}): Promise<ToolExecutionResult> {
    this.logger.info('Listing notes (v2 /notes)');

    try {
      // v2 /notes honours only date filters server-side. It silently ignores
      // owner/customer/company/tag/feature/term params, so those are applied
      // client-side (or reported as unsupported) after fetching.
      const serverParams: Record<string, string> = {};
      if (params.date_from) serverParams.created_from = params.date_from;
      if (params.date_to) serverParams.created_to = params.date_to;

      const cap = Math.min(params.limit ?? 100, 500);
      const wantTags = params.tags?.length
        ? params.tags.map((t) => t.toLowerCase())
        : null;

      const collected: ReturnType<typeof this.shapeNote>[] = [];
      let pageCursor: string | undefined;
      let pages = 0;
      let sawNextLink = false;
      // Safety cap: v2 returns ~50 notes/page, so 40 pages scans ~2000 notes.
      const MAX_PAGES = 40;

      do {
        const query: Record<string, string> = { ...serverParams };
        if (pageCursor) query.pageCursor = pageCursor;

        const resp = await this.apiClient.get<V2ListResponse>('/v2/notes', query);
        const batch = resp?.data ?? [];

        for (const note of batch) {
          if (!this.matchesTags(note, wantTags)) continue;
          if (params.feature_id && !this.linkedToFeature(note, params.feature_id)) continue;
          collected.push(this.shapeNote(note));
          if (collected.length >= cap) break;
        }

        const next = resp?.links?.next ?? undefined;
        sawNextLink = Boolean(next);
        pageCursor = next ? this.extractCursor(next) : undefined;
        pages++;
      } while (pageCursor && collected.length < cap && pages < MAX_PAGES);

      const ignoredFilters: string[] = [];
      if (params.customer_email) ignoredFilters.push('customer_email');
      if (params.company_name) ignoredFilters.push('company_name');

      const clientSideFilters: string[] = [];
      if (wantTags) clientSideFilters.push('tags');
      if (params.feature_id) clientSideFilters.push('feature_id');

      return {
        success: true,
        data: {
          notes: collected,
          returned: collected.length,
          hasMore: sawNextLink && collected.length >= cap,
          pagesScanned: pages,
          appliedServerFilters: Object.keys(serverParams),
          clientSideFilters,
          ignoredFilters: ignoredFilters.length ? ignoredFilters : undefined,
          note:
            'The v2 /notes endpoint has no server-side owner filter. To find a specific PM\'s notes, filter the returned list by each note\'s owner_email. "Unprocessed" corresponds to processed === false.',
        },
      };
    } catch (error) {
      this.logger.error('Failed to list notes', error);
      return {
        success: false,
        error: `Failed to list notes: ${(error as Error).message}`,
      };
    }
  }

  private shapeNote(note: V2Note) {
    const f = note.fields ?? {};
    return {
      id: note.id,
      name: f.name || 'Untitled Note',
      owner_email: f.owner?.email ?? null,
      owner_id: f.owner?.id ?? null,
      processed: f.processed ?? null,
      archived: f.archived ?? null,
      created_at: note.createdAt ?? null,
      updated_at: note.updatedAt ?? null,
      tags: (f.tags ?? []).map((t) => (typeof t === 'string' ? t : t?.name ?? '')),
      // links.html carries the human-facing URL with the note's numeric id,
      // e.g. https://<domain>.productboard.com/all-notes/notes/56482188
      html_url: note.links?.html ?? null,
      feature_ids: this.extractFeatureIds(note),
      content: f.content ?? '',
    };
  }

  private matchesTags(note: V2Note, wantTags: string[] | null): boolean {
    if (!wantTags) return true;
    const noteTags = (note.fields?.tags ?? []).map((t) =>
      (typeof t === 'string' ? t : t?.name ?? '').toLowerCase()
    );
    return wantTags.every((t) => noteTags.includes(t));
  }

  private linkedToFeature(note: V2Note, featureId: string): boolean {
    // relationships shape varies; a substring match on the serialized value is
    // a pragmatic, dependency-free way to detect the linked feature id.
    return JSON.stringify(note.relationships ?? []).includes(featureId);
  }

  private extractFeatureIds(note: V2Note): string[] {
    const ids = new Set<string>();
    const walk = (v: unknown): void => {
      if (!v || typeof v !== 'object') return;
      if (Array.isArray(v)) {
        for (const item of v) walk(item);
        return;
      }
      const obj = v as Record<string, unknown>;
      // v2 read shape: relationships.data[] = { type, target: { id, type: 'feature' } }.
      // A note's feature link is the relationship whose target is a feature entity.
      const target = obj.target as Record<string, unknown> | undefined;
      if (target?.type === 'feature' && typeof target.id === 'string') ids.add(target.id);
      // Legacy/write shape kept for safety: { id, entity: { type: 'feature' } }.
      const entity = obj.entity as Record<string, unknown> | undefined;
      if (entity?.type === 'feature' && typeof obj.id === 'string') ids.add(obj.id);
      for (const val of Object.values(obj)) walk(val);
    };
    walk(note.relationships);
    return [...ids];
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
