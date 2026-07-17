import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface ListKeyResultsParams {
  objective_id?: string;
  metric_type?: 'number' | 'percentage' | 'currency';
  limit?: number;
  offset?: number;
}

interface V2Entity {
  id: string;
  type?: string;
  createdAt?: string;
  updatedAt?: string;
  fields?: Record<string, unknown>;
  links?: { self?: string; html?: string };
  relationships?: unknown;
}

interface V2ListResponse {
  data?: V2Entity[];
  links?: { next?: string | null };
}

export class ListKeyResultsTool extends BaseTool<ListKeyResultsParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_keyresult_list',
      'List key results with optional filtering',
      {
        type: 'object',
        properties: {
          objective_id: {
            type: 'string',
            description:
              'Filter to key results belonging to a specific objective. Applied client-side by inspecting each key result\'s relationships (v2 has no server-side parent filter for this type).',
          },
          metric_type: {
            type: 'string',
            enum: ['number', 'percentage', 'currency'],
            description:
              'Filter by metric type. Applied client-side against the entity fields; reported as ignored if the field is absent.',
          },
          limit: {
            type: 'number',
            minimum: 1,
            maximum: 100,
            default: 20,
            description: 'Maximum number of key results to return',
          },
          offset: {
            type: 'number',
            minimum: 0,
            default: 0,
            description:
              'Number of key results to skip. Applied client-side (v2 uses cursor pagination, not offset).',
          },
        },
      },
      {
        requiredPermissions: [Permission.OBJECTIVES_READ],
        minimumAccessLevel: AccessLevel.READ,
        description: 'Requires read access to objectives',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(params: ListKeyResultsParams = {}): Promise<ToolExecutionResult> {
    try {
      this.logger.info('Listing key results (v2 /entities)');

      const limit = params.limit ?? 20;
      const offset = params.offset ?? 0;
      const cap = offset + limit;

      const serverParams: Record<string, string> = {
        'type[]': 'keyResult',
        'fields[]': 'all',
      };

      const collected: ReturnType<typeof this.shapeKeyResult>[] = [];
      let pageCursor: string | undefined;
      let pages = 0;
      let sawNextLink = false;
      const MAX_PAGES = 40;

      do {
        const query: Record<string, string> = { ...serverParams };
        if (pageCursor) query.pageCursor = pageCursor;

        const resp = await this.apiClient.get<V2ListResponse>('/v2/entities', query);
        const batch = resp?.data ?? [];
        for (const entity of batch) {
          if (params.objective_id && !this.linkedToObjective(entity, params.objective_id)) continue;
          if (params.metric_type && !this.matchesMetricType(entity, params.metric_type)) continue;
          collected.push(this.shapeKeyResult(entity));
        }

        const next = resp?.links?.next ?? undefined;
        sawNextLink = Boolean(next);
        pageCursor = next ? this.extractCursor(next) : undefined;
        pages++;
      } while (pageCursor && collected.length < cap && pages < MAX_PAGES);

      const page = collected.slice(offset, offset + limit);

      const clientSideFilters: string[] = [];
      if (params.objective_id) clientSideFilters.push('objective_id');
      if (params.metric_type) clientSideFilters.push('metric_type');

      return {
        success: true,
        data: {
          keyResults: page,
          returned: page.length,
          totalScanned: collected.length,
          hasMore: sawNextLink || collected.length > offset + limit,
          pagesScanned: pages,
          clientSideFilters: clientSideFilters.length ? clientSideFilters : undefined,
        },
      };
    } catch (error) {
      this.logger.error('Failed to list key results', error);
      return {
        success: false,
        error: `Failed to list key results: ${(error as Error).message}`,
      };
    }
  }

  private shapeKeyResult(entity: V2Entity) {
    const f = entity.fields ?? {};
    return {
      id: entity.id,
      name: (f.name as string) || 'Untitled Key Result',
      // Metric field keys are unverified; surface the full fields object so
      // callers can see whatever the v2 keyResult entity actually carries.
      fields: f,
      created_at: entity.createdAt ?? null,
      updated_at: entity.updatedAt ?? null,
      html_url: entity.links?.html ?? null,
    };
  }

  private linkedToObjective(entity: V2Entity, objectiveId: string): boolean {
    return JSON.stringify(entity.relationships ?? []).includes(objectiveId);
  }

  private matchesMetricType(entity: V2Entity, metricType: string): boolean {
    const f = entity.fields ?? {};
    const val = f.metricType ?? f.metric_type;
    return typeof val === 'string' && val.toLowerCase() === metricType.toLowerCase();
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
