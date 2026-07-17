import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface UpdateWebhookParams {
  id: string;
  name?: string;
  url?: string;
  events?: string[];
  secret?: string;
  active?: boolean;
}

export class UpdateWebhookTool extends BaseTool<UpdateWebhookParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_webhook_update',
      'Update webhook subscription settings',
      {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'Webhook ID to update',
          },
          name: {
            type: 'string',
            description: 'Webhook name',
          },
          url: {
            type: 'string',
            format: 'uri',
            description: 'Webhook endpoint URL',
          },
          events: {
            type: 'array',
            items: { type: 'string' },
            description: 'Event types to subscribe to',
          },
          secret: {
            type: 'string',
            description: 'Secret for webhook signature verification',
          },
          active: {
            type: 'boolean',
            description: 'Whether webhook is active',
          },
        },
      },
      {
        requiredPermissions: [Permission.WEBHOOKS_WRITE],
        minimumAccessLevel: AccessLevel.ADMIN,
        description: 'Requires admin access for webhooks',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(params: UpdateWebhookParams): Promise<ToolExecutionResult> {
    this.logger.info('pb_webhook_update called — the Productboard v2 API has no webhook update endpoint', {
      id: params.id,
    });

    // The v1 REST API is retired (HTTP 410 Gone) and the Productboard v2 API
    // exposes no PATCH/PUT endpoint for webhooks. Rather than hit a dead endpoint,
    // return a clear explanation of the supported alternative.
    return {
      success: false,
      error:
        'The Productboard v2 API has no webhook update endpoint (webhooks are immutable). ' +
        'To change a webhook, delete it with pb_webhook_delete and recreate it with pb_webhook_create.',
    };
  }
}