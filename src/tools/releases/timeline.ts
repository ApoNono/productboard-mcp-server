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

interface ProductboardRelease {
  id: string;
  name: string;
  state?: string;
  archived?: boolean;
  timeframe?: { startDate?: string; endDate?: string; granularity?: string };
  releaseGroup?: { id?: string };
  links?: { html?: string };
}

interface ProductboardListResponse<T> {
  data: T[];
  links?: { next?: string };
}

export class ReleaseTimelineTool extends BaseTool<ReleaseTimelineParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_release_timeline',
      'Build a chronological timeline of releases (optionally with the features assigned to each)',
      {
        type: 'object',
        properties: {
          release_group_id: {
            type: 'string',
            description: 'Filter to releases in a specific release group',
          },
          date_from: {
            type: 'string',
            format: 'date',
            description: 'Start of window (YYYY-MM-DD). Releases whose timeframe.startDate is earlier are excluded.',
          },
          date_to: {
            type: 'string',
            format: 'date',
            description: 'End of window (YYYY-MM-DD). Releases whose timeframe.startDate is later are excluded.',
          },
          include_features: {
            type: 'boolean',
            default: true,
            description: 'Include the list of feature IDs assigned to each release',
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
      this.logger.info('Building release timeline');

      // Productboard has no /releases/timeline endpoint — assemble the
      // timeline client-side from /releases plus /feature-release-assignments.
      const apiParams: Record<string, any> = { pageLimit: 100 };
      if (params.release_group_id) apiParams['releaseGroup.id'] = params.release_group_id;

      const releases = await this.fetchAllPages<ProductboardRelease>('/releases', apiParams);

      // Client-side date window filter
      let filtered = releases;
      if (params.date_from) {
        filtered = filtered.filter(r => {
          const s = r.timeframe?.startDate;
          return s && s !== 'none' && s >= params.date_from!;
        });
      }
      if (params.date_to) {
        filtered = filtered.filter(r => {
          const s = r.timeframe?.startDate;
          return s && s !== 'none' && s <= params.date_to!;
        });
      }

      // Sort ascending by scheduled start; releases with no schedule at the end.
      filtered.sort((a, b) => {
        const sa = a.timeframe?.startDate;
        const sb = b.timeframe?.startDate;
        if (!sa || sa === 'none') return 1;
        if (!sb || sb === 'none') return -1;
        return sa.localeCompare(sb);
      });

      const includeFeatures = params.include_features ?? true;
      const timeline = await Promise.all(
        filtered.map(async r => {
          const entry: Record<string, any> = {
            id: r.id,
            name: r.name,
            state: r.state,
            timeframe: r.timeframe,
            releaseGroupId: r.releaseGroup?.id,
            html: r.links?.html,
          };
          if (includeFeatures) {
            entry.feature_ids = await this.fetchFeatureIdsForRelease(r.id);
          }
          return entry;
        })
      );

      return {
        success: true,
        data: {
          timeline,
          count: timeline.length,
          total_workspace: releases.length,
        },
      };
    } catch (error) {
      this.logger.error('Failed to build release timeline', error);
      return {
        success: false,
        error: `Failed to build release timeline: ${(error as Error).message}`,
      };
    }
  }

  private async fetchFeatureIdsForRelease(releaseId: string): Promise<string[]> {
    const assignments = await this.fetchAllPages<{ feature?: { id?: string } }>(
      '/feature-release-assignments',
      { 'release.id': releaseId, pageLimit: 100 }
    );
    return assignments.map(a => a.feature?.id).filter((id): id is string => Boolean(id));
  }

  private async fetchAllPages<T>(
    endpoint: string,
    initialParams: Record<string, any>
  ): Promise<T[]> {
    const all: T[] = [];
    let nextEndpoint: string | undefined = endpoint;
    let nextParams: Record<string, any> | undefined = initialParams;

    while (nextEndpoint) {
      const response = (await this.apiClient.makeRequest({
        method: 'GET',
        endpoint: nextEndpoint,
        params: nextParams,
      })) as ProductboardListResponse<T>;

      if (Array.isArray(response?.data)) {
        all.push(...response.data);
      }

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
