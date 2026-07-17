import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface CreateNoteParams {
  content: string;
  title?: string;
  customer_email?: string;
  company_name?: string;
  source?: 'email' | 'call' | 'meeting' | 'survey' | 'support' | 'social';
  tags?: string[];
  feature_ids?: string[];
}

export class CreateNoteTool extends BaseTool<CreateNoteParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_note_create',
      'Create a customer feedback note (Productboard v2 /notes)',
      {
        type: 'object',
        required: ['content'],
        properties: {
          content: {
            type: 'string',
            description: 'Note content (customer feedback). Plain text is wrapped in HTML automatically.',
          },
          title: {
            type: 'string',
            description: 'Note title. Required by the v2 API; if omitted, a title is derived from the content.',
          },
          customer_email: {
            type: 'string',
            format: 'email',
            description: 'NOTE: the v2 /notes create schema does not expose a customer field; this value is not persisted and is reported back as ignored.',
          },
          company_name: {
            type: 'string',
            description: 'NOTE: not persisted by the v2 /notes create schema; reported as ignored.',
          },
          source: {
            type: 'string',
            enum: ['email', 'call', 'meeting', 'survey', 'support', 'social'],
            description: 'NOTE: not persisted by the v2 /notes create schema; reported as ignored.',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags for categorization.',
          },
          feature_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Feature IDs to link this note to (linked after creation via note relationships).',
          },
        },
      },
      {
        requiredPermissions: [Permission.NOTES_WRITE],
        minimumAccessLevel: AccessLevel.WRITE,
        description: 'Requires write access to notes',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(params: CreateNoteParams): Promise<ToolExecutionResult> {
    this.logger.info('Creating note (v2 /notes)');

    try {
      const name = (params.title && params.title.trim()) || this.deriveTitle(params.content);
      const content = params.content.startsWith('<')
        ? params.content
        : `<p>${params.content.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`;

      const fields: Record<string, unknown> = { name, content };
      if (params.tags?.length) {
        fields.tags = params.tags.map((tag) => ({ name: tag }));
      }

      const body = { data: { type: 'textNote', fields } };
      const response = await this.apiClient.post<{ data?: { id?: string } }>('/v2/notes', body);
      const created = (response as any)?.data ?? response;
      const noteId: string | undefined = created?.id;

      // Link features via note relationships (v2 has no create-time feature link).
      const linked: string[] = [];
      const linkFailures: Array<{ feature_id: string; error: string }> = [];
      if (noteId && params.feature_ids?.length) {
        for (const featureId of params.feature_ids) {
          try {
            await this.apiClient.post(`/v2/notes/${noteId}/relationships`, {
              data: {
                type: 'link',
                target: { type: 'link', id: featureId, entity: { type: 'feature' } },
              },
            });
            linked.push(featureId);
          } catch (error) {
            linkFailures.push({ feature_id: featureId, error: (error as Error).message });
          }
        }
      }

      const ignoredParams: string[] = [];
      if (params.customer_email) ignoredParams.push('customer_email');
      if (params.company_name) ignoredParams.push('company_name');
      if (params.source) ignoredParams.push('source');

      return {
        success: linkFailures.length === 0,
        data: {
          note: created,
          linked_features: linked,
          link_failures: linkFailures.length ? linkFailures : undefined,
          ignoredParams: ignoredParams.length ? ignoredParams : undefined,
        },
      };
    } catch (error) {
      this.logger.error('Failed to create note', error);
      return {
        success: false,
        error: `Failed to create note: ${(error as Error).message}`,
      };
    }
  }

  private deriveTitle(content: string): string {
    const text = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) return 'Untitled Note';
    return text.length > 80 ? `${text.slice(0, 77)}...` : text;
  }
}
