import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface ReleaseTimelineParams {
  release_group_id?: string;
  date_from?: string;
  date_to?: string;
  include_features?: boolean;
}

interface ReleaseEntity {
  id: string;
  type: string;
  fields?: {
    name?: string;
    status?: { id?: string; name?: string } | null;
    timeframe?: { startDate?: string; endDate?: string; granularity?: string } | null;
    [key: string]: unknown;
  };
}

interface EntityListResponse {
  data: ReleaseEntity[];
  links?: { next?: string | null };
}

interface RelationshipsResponse {
  data: Array<{
    type: string;
    target: { id: string; type: string };
  }>;
  links?: { next?: string | null };
}

const MAX_PAGES = 40;

export class ReleaseTimelineTool extends BaseTool<ReleaseTimelineParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_release_timeline',
      'Get release timeline with features and milestones',
      {
        type: 'object',
        properties: {
          release_group_id: {
            type: 'string',
            description: 'Filter by release group',
          },
          date_from: {
            type: 'string',
            format: 'date',
            description: 'Start date for timeline',
          },
          date_to: {
            type: 'string',
            format: 'date',
            description: 'End date for timeline',
          },
          include_features: {
            type: 'boolean',
            default: true,
            description: 'Include features linked to each release',
          },
        },
      },
      {
        requiredPermissions: [Permission.RELEASES_READ],
        minimumAccessLevel: AccessLevel.READ,
        description: 'Requires read access to releases',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(params: ReleaseTimelineParams = {}): Promise<ToolExecutionResult> {
    try {
      this.logger.info('Getting release timeline');

      // v1 exposed GET /releases/timeline; v2 has no such endpoint. Build the
      // timeline client-side from release entities and their `timeframe` field.
      const initialParams: Record<string, any> = {
        'type[]': 'release',
        'fields[]': 'all',
      };
      if (params.release_group_id) initialParams['parent[id]'] = params.release_group_id;

      const releases = await this.fetchAllReleases(initialParams);
      const includeFeatures = params.include_features ?? true;

      // Only releases with a timeframe can appear on a timeline.
      let timed = releases.filter((r) => r.fields?.timeframe?.startDate || r.fields?.timeframe?.endDate);

      if (params.date_from || params.date_to) {
        timed = timed.filter((r) => {
          const tf = r.fields!.timeframe!;
          if (params.date_to && tf.startDate && tf.startDate > params.date_to) return false;
          if (params.date_from && tf.endDate && tf.endDate < params.date_from) return false;
          return true;
        });
      }

      // Sort chronologically by start (fall back to end) date.
      timed.sort((a, b) => {
        const av = a.fields!.timeframe!.startDate || a.fields!.timeframe!.endDate || '';
        const bv = b.fields!.timeframe!.startDate || b.fields!.timeframe!.endDate || '';
        return av.localeCompare(bv);
      });

      const timeline = [] as unknown[];
      for (const r of timed) {
        const entry: Record<string, unknown> = {
          id: r.id,
          name: r.fields?.name,
          status: r.fields?.status ?? null,
          timeframe: r.fields?.timeframe ?? null,
        };

        if (includeFeatures) {
          entry.features = await this.fetchLinkedFeatureIds(r.id);
        }

        timeline.push(entry);
      }

      return {
        success: true,
        data: {
          timeline,
          total: timeline.length,
          note:
            'v2 has no /releases/timeline endpoint; this timeline is assembled client-side from release entities and their timeframe fields. Releases without a timeframe are omitted.',
        },
      };
    } catch (error) {
      this.logger.error('Failed to get release timeline', error);
      return {
        success: false,
        error: `Failed to get release timeline: ${(error as Error).message}`,
      };
    }
  }

  private async fetchAllReleases(initialParams: Record<string, any>): Promise<ReleaseEntity[]> {
    const all: ReleaseEntity[] = [];
    let endpoint = '/v2/entities';
    let queryParams: Record<string, any> | undefined = initialParams;
    let pages = 0;

    while (endpoint && pages < MAX_PAGES) {
      const response = (await this.apiClient.makeRequest({
        method: 'GET',
        endpoint,
        params: queryParams,
      })) as EntityListResponse;

      if (Array.isArray(response?.data)) all.push(...response.data);

      const next = response?.links?.next;
      if (next) {
        const url = new URL(next);
        endpoint = url.pathname.replace(/^\/+/, '/');
        queryParams = Object.fromEntries(url.searchParams.entries());
      } else {
        break;
      }
      pages += 1;
    }

    return all;
  }

  private async fetchLinkedFeatureIds(releaseId: string): Promise<string[]> {
    const response = (await this.apiClient.makeRequest({
      method: 'GET',
      endpoint: `/v2/entities/${releaseId}/relationships`,
    })) as RelationshipsResponse;

    if (!Array.isArray(response?.data)) return [];
    return response.data
      .filter((rel) => rel.type === 'link' && rel.target?.type === 'feature')
      .map((rel) => rel.target.id);
  }
}
