import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface JiraSyncParams {
  action: 'import' | 'export' | 'sync';
  jira_project_key?: string;
  feature_ids?: string[];
  sync_options?: {
    sync_status?: boolean;
    sync_priority?: boolean;
    sync_assignee?: boolean;
    sync_comments?: boolean;
    create_missing?: boolean;
  };
  mapping?: {
    status_map?: Record<string, string>;
    priority_map?: Record<string, string>;
    custom_field_map?: Record<string, string>;
  };
}

export class JiraSyncTool extends BaseTool<JiraSyncParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_jira_sync',
      'Synchronize features with JIRA issues',
      {
        type: 'object',
        required: ['action'],
        properties: {
          action: {
            type: 'string',
            enum: ['import', 'export', 'sync'],
            description: 'Sync action to perform',
          },
          jira_project_key: {
            type: 'string',
            description: 'JIRA project key',
          },
          feature_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Specific feature IDs to sync',
          },
          sync_options: {
            type: 'object',
            properties: {
              sync_status: {
                type: 'boolean',
                default: true,
                description: 'Sync status between systems',
              },
              sync_priority: {
                type: 'boolean',
                default: true,
                description: 'Sync priority between systems',
              },
              sync_assignee: {
                type: 'boolean',
                default: false,
                description: 'Sync assignee between systems',
              },
              sync_comments: {
                type: 'boolean',
                default: false,
                description: 'Sync comments between systems',
              },
              create_missing: {
                type: 'boolean',
                default: false,
                description: 'Create missing items in target system',
              },
            },
          },
          mapping: {
            type: 'object',
            properties: {
              status_map: {
                type: 'object',
                description: 'Status mapping between systems',
              },
              priority_map: {
                type: 'object',
                description: 'Priority mapping between systems',
              },
              custom_field_map: {
                type: 'object',
                description: 'Custom field mapping',
              },
            },
          },
        },
      },
      {
        requiredPermissions: [Permission.INTEGRATIONS_WRITE],
        minimumAccessLevel: AccessLevel.WRITE,
        description: 'Requires write access to integrations',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(_params: JiraSyncParams): Promise<ToolExecutionResult> {
    // The v1 /integrations/jira/sync endpoint was retired (HTTP 410 Gone). The v2
    // Jira integration API is read-only (GET /v2/jira-integrations only), so there is
    // no sync/write endpoint to call.
    this.logger.info('JIRA sync requested, but the v2 Jira integration is read-only');

    return {
      success: false,
      error: 'Productboard v2 API does not expose a Jira export/sync write endpoint (v2 Jira integration is read-only). This operation is no longer available.',
    };
  }
}