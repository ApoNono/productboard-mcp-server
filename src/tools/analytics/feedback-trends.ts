import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface FeedbackTrendsParams {
  date_from?: string;
  date_to?: string;
  product_id?: string;
  feature_id?: string;
  source?: string;
  tags?: string[];
  groupBy?: 'day' | 'week' | 'month';
}

export class FeedbackTrendsTool extends BaseTool<FeedbackTrendsParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_analytics_feedback_trends',
      'Analyze feedback trends over time',
      {
        type: 'object',
        properties: {
          date_from: {
            type: 'string',
            format: 'date',
            description: 'Start date for analysis',
          },
          date_to: {
            type: 'string',
            format: 'date',
            description: 'End date for analysis',
          },
          product_id: {
            type: 'string',
            description: 'Filter by product ID',
          },
          feature_id: {
            type: 'string',
            description: 'Filter by feature ID',
          },
          source: {
            type: 'string',
            description: 'Filter by feedback source',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by tags',
          },
          groupBy: {
            type: 'string',
            enum: ['day', 'week', 'month'],
            default: 'week',
            description: 'Time period grouping',
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

  protected async executeInternal(_params: FeedbackTrendsParams = {}): Promise<ToolExecutionResult> {
    // The v1 /analytics/feedback-trends endpoint was retired (HTTP 410 Gone).
    // Productboard's v2 Analytics API is not a drop-in replacement, so no networked
    // call is made here.
    this.logger.info('Feedback trends requested, but the v1 analytics endpoint has been retired');

    return {
      success: false,
      error: 'The v1 analytics endpoint has been retired; no equivalent is wired up in this server yet.',
    };
  }
}