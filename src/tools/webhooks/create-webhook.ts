import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface CreateWebhookParams {
  name: string;
  url: string;
  events: string[];
  secret?: string;
  active?: boolean;
}

export class CreateWebhookTool extends BaseTool<CreateWebhookParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_webhook_create',
      'Create a new webhook subscription (Productboard v2 /webhooks)',
      {
        type: 'object',
        required: ['name', 'url', 'events'],
        properties: {
          name: {
            type: 'string',
            description: 'Webhook name (1-255 chars)',
          },
          url: {
            type: 'string',
            format: 'uri',
            description: 'Webhook endpoint URL (must be HTTPS, max 1024 chars)',
          },
          events: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            description:
              'Event types to subscribe to (e.g. feature.created). Sent to v2 as data.fields.events[].eventType.',
          },
          secret: {
            type: 'string',
            description:
              'Optional secret. v2 has no HMAC signing-secret field; this value is sent as the notification.headers.authorization header (best-effort mapping) so your endpoint can authenticate the caller.',
          },
          active: {
            type: 'boolean',
            default: true,
            description:
              'Whether webhook is active. NOTE: the v2 create endpoint has no active/enabled flag — webhooks are always created active — so this parameter is reported as ignored.',
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

  protected async executeInternal(params: CreateWebhookParams): Promise<ToolExecutionResult> {
    try {
      this.logger.info('Creating webhook (v2 /webhooks)', { name: params.name, url: params.url });

      const notification: {
        url: string;
        version: number;
        headers?: { authorization: string };
      } = {
        url: params.url,
        // v2 currently only supports notification.version === 1.
        version: 1,
      };
      if (params.secret) {
        notification.headers = { authorization: params.secret };
      }

      const body = {
        data: {
          fields: {
            name: params.name,
            events: params.events.map((eventType) => ({ eventType })),
            notification,
          },
        },
      };

      const response = await this.apiClient.post('/v2/webhooks', body);

      const ignoredParams: string[] = [];
      if (params.active !== undefined) ignoredParams.push('active');

      return {
        success: true,
        data: {
          webhook: response,
          ignoredParams: ignoredParams.length ? ignoredParams : undefined,
        },
      };
    } catch (error) {
      this.logger.error('Failed to create webhook', error);

      return {
        success: false,
        error: `Failed to create webhook: ${(error as Error).message}`,
      };
    }
  }
}
