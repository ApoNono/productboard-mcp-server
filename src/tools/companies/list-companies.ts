import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface ListCompaniesParams {
  search?: string;
  size?: 'small' | 'medium' | 'large' | 'enterprise';
  industry?: string;
}

interface V2Entity {
  id: string;
  type?: string;
  createdAt?: string;
  updatedAt?: string;
  fields?: {
    name?: string;
    description?: string;
    domain?: string;
    owner?: { id?: string; email?: string } | null;
    archived?: boolean;
    [key: string]: unknown;
  };
  links?: { self?: string; html?: string };
}

interface V2ListResponse {
  data?: V2Entity[];
  links?: { next?: string | null };
}

export class ListCompaniesTool extends BaseTool<ListCompaniesParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_company_list',
      'List customer companies',
      {
        type: 'object',
        properties: {
          search: {
            type: 'string',
            description: 'Search in company names (maps to the v2 name filter, case-insensitive substring).',
          },
          size: {
            type: 'string',
            enum: ['small', 'medium', 'large', 'enterprise'],
            description:
              'NOTE: v2 has no standard company "size" field (it existed only as a workspace-specific custom field in v1). Reported as ignored.',
          },
          industry: {
            type: 'string',
            description:
              'NOTE: v2 has no standard company "industry" field (workspace-specific custom field only). Reported as ignored.',
          },
        },
      },
      {
        requiredPermissions: [Permission.COMPANIES_READ],
        minimumAccessLevel: AccessLevel.READ,
        description: 'Requires read access to companies',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(params: ListCompaniesParams = {}): Promise<ToolExecutionResult> {
    this.logger.info('Listing companies (v2 /entities type=company)');

    try {
      // Companies are v2 entities of type "company". The list endpoint supports
      // a server-side `name` filter; there is no standard size/industry field.
      const serverParams: Record<string, string> = {
        'type[]': 'company',
        'fields[]': 'all',
      };
      if (params.search) serverParams.name = params.search;

      const collected: V2Entity[] = [];
      let pageCursor: string | undefined;
      let pages = 0;
      const MAX_PAGES = 40;

      do {
        const query: Record<string, string> = { ...serverParams };
        if (pageCursor) query.pageCursor = pageCursor;

        const resp = await this.apiClient.get<V2ListResponse>('/v2/entities', query);
        collected.push(...(resp?.data ?? []));

        const next = resp?.links?.next ?? undefined;
        pageCursor = next ? this.extractCursor(next) : undefined;
        pages++;
      } while (pageCursor && pages < MAX_PAGES);

      const companies = collected.map((e) => this.shapeCompany(e));

      const ignoredFilters: string[] = [];
      if (params.size) ignoredFilters.push('size');
      if (params.industry) ignoredFilters.push('industry');

      return {
        success: true,
        data: {
          companies,
          total: companies.length,
          pagesScanned: pages,
          appliedServerFilters: Object.keys(serverParams).filter(
            (k) => k !== 'type[]' && k !== 'fields[]'
          ),
          ignoredFilters: ignoredFilters.length ? ignoredFilters : undefined,
        },
      };
    } catch (error) {
      this.logger.error('Failed to list companies', error);
      return {
        success: false,
        error: `Failed to list companies: ${(error as Error).message}`,
      };
    }
  }

  private shapeCompany(e: V2Entity) {
    const f = e.fields ?? {};
    return {
      id: e.id,
      name: f.name ?? 'Untitled Company',
      description: f.description ?? '',
      domain: f.domain ?? null,
      owner_email: f.owner?.email ?? null,
      archived: f.archived ?? false,
      created_at: e.createdAt ?? null,
      updated_at: e.updatedAt ?? null,
      html_url: e.links?.html ?? null,
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
