import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface TestWebhookParams {
  id: string;
  test_event?: string;
}

export class TestWebhookTool extends BaseTool<TestWebhookParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_webhook_test',
      'Test webhook endpoint with sample payload',
      {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'Webhook ID to test',
          },
          test_event: {
            type: 'string',
            default: 'test',
            description: 'Type of test event to send',
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

  protected async executeInternal(params: TestWebhookParams): Promise<ToolExecutionResult> {
    this.logger.info('pb_webhook_test called — the Productboard v2 API has no webhook test endpoint', {
      id: params.id,
    });

    // The v1 REST API is retired (HTTP 410 Gone) and the Productboard v2 API
    // exposes no test/ping endpoint for webhooks. Rather than hit a dead endpoint,
    // return a clear not-supported message.
    return {
      success: false,
      error:
        'The Productboard v2 API has no webhook test endpoint. There is no supported way to trigger a ' +
        'test delivery via the API; verify the webhook by performing a real action that emits one of its ' +
        'subscribed events, or inspect the webhook with pb_webhook_list.',
    };
  }
}