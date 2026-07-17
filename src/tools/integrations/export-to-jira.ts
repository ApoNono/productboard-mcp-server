import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface ExportToJiraParams {
  feature_ids: string[];
  jira_project_key: string;
  issue_type?: 'Story' | 'Task' | 'Bug' | 'Epic';
  create_options?: {
    include_description?: boolean;
    include_attachments?: boolean;
    include_notes_as_comments?: boolean;
    link_back_to_productboard?: boolean;
  };
  field_mapping?: {
    priority?: Record<string, string>;
    custom_fields?: Record<string, string>;
  };
}

export class ExportToJiraTool extends BaseTool<ExportToJiraParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_to_jira',
      'Export features to JIRA as issues',
      {
        type: 'object',
        required: ['feature_ids', 'jira_project_key'],
        properties: {
          feature_ids: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            description: 'Feature IDs to export',
          },
          jira_project_key: {
            type: 'string',
            description: 'Target JIRA project key',
          },
          issue_type: {
            type: 'string',
            enum: ['Story', 'Task', 'Bug', 'Epic'],
            default: 'Story',
            description: 'JIRA issue type',
          },
          create_options: {
            type: 'object',
            properties: {
              include_description: {
                type: 'boolean',
                default: true,
                description: 'Include feature description',
              },
              include_attachments: {
                type: 'boolean',
                default: false,
                description: 'Include attachments',
              },
              include_notes_as_comments: {
                type: 'boolean',
                default: true,
                description: 'Convert notes to JIRA comments',
              },
              link_back_to_productboard: {
                type: 'boolean',
                default: true,
                description: 'Add link back to Productboard',
              },
            },
          },
          field_mapping: {
            type: 'object',
            properties: {
              priority: {
                type: 'object',
                description: 'Priority mapping',
              },
              custom_fields: {
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

  protected async executeInternal(_params: ExportToJiraParams): Promise<ToolExecutionResult> {
    // The v1 /integrations/jira/export endpoint was retired (HTTP 410 Gone). The v2
    // Jira integration API is read-only (GET /v2/jira-integrations only), so there is
    // no write/export endpoint to call.
    this.logger.info('JIRA export requested, but the v2 Jira integration is read-only');

    return {
      success: false,
      error: 'Productboard v2 API does not expose a Jira export/sync write endpoint (v2 Jira integration is read-only). This operation is no longer available.',
    };
  }
}