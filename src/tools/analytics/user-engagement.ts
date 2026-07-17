import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface UserEngagementParams {
  user_id?: string;
  user_role?: string;
  date_from?: string;
  date_to?: string;
  engagement_types?: ('logins' | 'features_created' | 'votes' | 'comments' | 'notes_created')[];
}

export class UserEngagementTool extends BaseTool<UserEngagementParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_analytics_user_engagement',
      'Get user engagement analytics',
      {
        type: 'object',
        properties: {
          user_id: {
            type: 'string',
            description: 'Specific user ID to analyze',
          },
          user_role: {
            type: 'string',
            description: 'Filter by user role',
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
          engagement_types: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['logins', 'features_created', 'votes', 'comments', 'notes_created'],
            },
            description: 'Types of engagement to track',
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

  protected async executeInternal(_params: UserEngagementParams = {}): Promise<ToolExecutionResult> {
    // The v1 /analytics/user-engagement endpoint was retired (HTTP 410 Gone).
    // Productboard's v2 Analytics API is not a drop-in replacement, so no networked
    // call is made here.
    this.logger.info('User engagement requested, but the v1 analytics endpoint has been retired');

    return {
      success: false,
      error: 'The v1 analytics endpoint has been retired; no equivalent is wired up in this server yet.',
    };
  }
}