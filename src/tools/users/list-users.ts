import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '@api/index.js';
import { Logger } from '@utils/logger.js';
import { Permission, AccessLevel } from '@auth/permissions.js';
import { ToolExecutionResult } from '../../core/types.js';

interface ListUsersParams {
  role?: 'admin' | 'contributor' | 'viewer';
  active?: boolean;
  search?: string;
}

// Shape of a single member as returned by the v2 /members endpoint. Only the
// fields we surface are described; the API returns more.
interface V2Member {
  id: string;
  type?: string;
  createdAt?: string;
  updatedAt?: string;
  fields?: {
    name?: string;
    username?: string;
    email?: string;
    role?: string;
    disabled?: boolean;
    invitationPending?: boolean;
    teams?: Array<{ id?: string; name?: string }>;
  };
  links?: { self?: string; html?: string };
}

interface V2ListResponse {
  data?: V2Member[];
  links?: { next?: string | null };
}

export class ListUsersTool extends BaseTool<ListUsersParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_user_list',
      'List users (workspace members) in the workspace (Productboard v2 /members)',
      {
        type: 'object',
        properties: {
          role: {
            type: 'string',
            enum: ['admin', 'contributor', 'viewer'],
            description:
              'Filter by member role. The v2 /members endpoint has no server-side role filter, so this is applied client-side against each member\'s fields.role.',
          },
          active: {
            type: 'boolean',
            description:
              'Filter by active status. Applied client-side: active === true means the member is not disabled (fields.disabled === false).',
          },
          search: {
            type: 'string',
            description:
              'Search in member names, usernames and emails. Applied client-side (case-insensitive substring); the v2 endpoint has no server-side search.',
          },
        },
      },
      {
        requiredPermissions: [Permission.USERS_READ],
        minimumAccessLevel: AccessLevel.READ,
        description: 'Requires read access to users',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(params: ListUsersParams = {}): Promise<ToolExecutionResult> {
    this.logger.info('Listing users (v2 /members)');

    try {
      // The v2 /members endpoint has no server-side role/active/search filters,
      // so we page through all members and filter client-side.
      const wantSearch = params.search ? params.search.toLowerCase() : null;

      const collected: ReturnType<typeof this.shapeMember>[] = [];
      let pageCursor: string | undefined;
      let pages = 0;
      // Safety cap: v2 returns ~50 members/page, so 40 pages scans ~2000 members.
      const MAX_PAGES = 40;

      do {
        const query: Record<string, string> = {};
        if (pageCursor) query.pageCursor = pageCursor;

        const resp = await this.apiClient.get<V2ListResponse>('/v2/members', query);
        const batch = resp?.data ?? [];

        for (const member of batch) {
          const f = member.fields ?? {};
          if (params.role && (f.role ?? '').toLowerCase() !== params.role) continue;
          if (params.active !== undefined) {
            const isActive = f.disabled !== true;
            if (isActive !== params.active) continue;
          }
          if (wantSearch) {
            const haystack = [f.name, f.username, f.email]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();
            if (!haystack.includes(wantSearch)) continue;
          }
          collected.push(this.shapeMember(member));
        }

        const next = resp?.links?.next ?? undefined;
        pageCursor = next ? this.extractCursor(next) : undefined;
        pages++;
      } while (pageCursor && pages < MAX_PAGES);

      const clientSideFilters: string[] = [];
      if (params.role) clientSideFilters.push('role');
      if (params.active !== undefined) clientSideFilters.push('active');
      if (wantSearch) clientSideFilters.push('search');

      return {
        success: true,
        data: {
          users: collected,
          total: collected.length,
          pagesScanned: pages,
          clientSideFilters,
        },
      };
    } catch (error) {
      this.logger.error('Failed to list users', error);
      return {
        success: false,
        error: `Failed to list users: ${(error as Error).message}`,
      };
    }
  }

  private shapeMember(member: V2Member) {
    const f = member.fields ?? {};
    return {
      id: member.id,
      name: f.name ?? null,
      username: f.username ?? null,
      email: f.email ?? null,
      role: f.role ?? null,
      active: f.disabled !== true,
      invitationPending: f.invitationPending ?? null,
      teams: (f.teams ?? []).map((t) => ({ id: t.id ?? null, name: t.name ?? null })),
      created_at: member.createdAt ?? null,
      updated_at: member.updatedAt ?? null,
      html_url: member.links?.html ?? null,
    };
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
