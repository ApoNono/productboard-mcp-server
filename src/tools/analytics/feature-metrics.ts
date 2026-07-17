import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface FeatureMetricsParams {
  feature_ids?: string[];
  product_id?: string;
  date_from?: string;
  date_to?: string;
  metrics?: ('views' | 'votes' | 'comments' | 'status_changes')[];
}

export class FeatureMetricsTool extends BaseTool<FeatureMetricsParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_analytics_feature_metrics',
      'Get analytics metrics for features',
      {
        type: 'object',
        properties: {
          feature_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Specific feature IDs to analyze',
          },
          product_id: {
            type: 'string',
            description: 'Filter by product ID',
          },
          date_from: {
            type: 'string',
            format: 'date',
            description: 'Start date for metrics',
          },
          date_to: {
            type: 'string',
            format: 'date',
            description: 'End date for metrics',
          },
          metrics: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['views', 'votes', 'comments', 'status_changes'],
            },
            description: 'Types of metrics to retrieve',
          },
        },
      },
      {
        requiredPermissions: [Permission.ANALYTICS_READ],
        minimumAccessLevel: AccessLevel.ADMIN,
        description: 'Requires admin access for analytics',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(_params: FeatureMetricsParams = {}): Promise<ToolExecutionResult> {
    // The v1 /analytics/features endpoint was retired (HTTP 410 Gone). Productboard's
    // v2 Analytics API is not a drop-in replacement for this tool, so no networked
    // call is made here.
    this.logger.info('Feature metrics requested, but the v1 analytics endpoint has been retired');

    return {
      success: false,
      error: 'The v1 analytics endpoint has been retired; no equivalent is wired up in this server yet.',
    };
  }
}