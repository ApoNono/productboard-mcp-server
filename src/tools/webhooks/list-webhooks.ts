import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface ListWebhooksParams {
  active?: boolean;
  event_type?: string;
}

// Shape of a single webhook as returned by the v2 /webhooks endpoint. Only the
// fields we surface are described; the API returns more.
interface V2Webhook {
  id: string;
  type?: string;
  createdAt?: string;
  updatedAt?: string;
  fields?: {
    name?: string;
    events?: Array<{ eventType?: string }>;
    notification?: {
      url?: string;
      version?: number;
    };
  };
  links?: { self?: string };
}

interface V2ListResponse {
  data?: V2Webhook[];
  links?: { next?: string | null };
}

export class ListWebhooksTool extends BaseTool<ListWebhooksParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_webhook_list',
      'List webhook subscriptions (Productboard v2 /webhooks)',
      {
        type: 'object',
        properties: {
          active: {
            type: 'boolean',
            description:
              'Filter by active status. NOTE: the v2 webhook object has no active/enabled flag, so this filter is reported as ignored.',
          },
          event_type: {
            type: 'string',
            description:
              'Filter by event type. Applied client-side: a webhook matches if any of its subscribed events[].eventType equals this value.',
          },
        },
      },
      {
        requiredPermissions: [Permission.WEBHOOKS_READ],
        minimumAccessLevel: AccessLevel.ADMIN,
        description: 'Requires admin access for webhooks',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(params: ListWebhooksParams = {}): Promise<ToolExecutionResult> {
    try {
      this.logger.info('Listing webhooks (v2 /webhooks)');

      const collected: ReturnType<typeof this.shapeWebhook>[] = [];
      let pageCursor: string | undefined;
      let pages = 0;
      const MAX_PAGES = 40;

      do {
        const query: Record<string, string> = {};
        if (pageCursor) query.pageCursor = pageCursor;

        const resp = await this.apiClient.get<V2ListResponse>('/v2/webhooks', query);
        const batch = resp?.data ?? [];

        for (const webhook of batch) {
          if (params.event_type) {
            const events = webhook.fields?.events ?? [];
            const matches = events.some((e) => e?.eventType === params.event_type);
            if (!matches) continue;
          }
          collected.push(this.shapeWebhook(webhook));
        }

        const next = resp?.links?.next ?? undefined;
        pageCursor = next ? this.extractCursor(next) : undefined;
        pages++;
      } while (pageCursor && pages < MAX_PAGES);

      const ignoredFilters: string[] = [];
      if (params.active !== undefined) ignoredFilters.push('active');

      const clientSideFilters: string[] = [];
      if (params.event_type) clientSideFilters.push('event_type');

      return {
        success: true,
        data: {
          webhooks: collected,
          total: collected.length,
          pagesScanned: pages,
          clientSideFilters,
          ignoredFilters: ignoredFilters.length ? ignoredFilters : undefined,
        },
      };
    } catch (error) {
      this.logger.error('Failed to list webhooks', error);

      return {
        success: false,
        error: `Failed to list webhooks: ${(error as Error).message}`,
      };
    }
  }

  private shapeWebhook(webhook: V2Webhook) {
    const f = webhook.fields ?? {};
    return {
      id: webhook.id,
      name: f.name ?? null,
      events: (f.events ?? []).map((e) => e?.eventType).filter(Boolean),
      url: f.notification?.url ?? null,
      version: f.notification?.version ?? null,
      created_at: webhook.createdAt ?? null,
      updated_at: webhook.updatedAt ?? null,
    };
  }

  private extractCursor(nextUrl: string): string | undefined {
    try {
      return new URL(nextUrl).searchParams.get('pageCursor') ?? undefined;
    } catch {
      const match = nextUrl.match(/[?&]pageCursor=([^&]+)/);
      return match ? decodeURIComponent(match[1]) : undefined;
    }
  }
}
