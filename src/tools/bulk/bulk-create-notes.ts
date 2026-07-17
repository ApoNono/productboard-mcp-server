import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface BulkNote {
  content: string;
  title?: string;
  customer_email?: string;
  company_name?: string;
  source?: 'email' | 'call' | 'meeting' | 'survey' | 'support' | 'social';
  tags?: string[];
  feature_ids?: string[];
}

interface BulkCreateNotesParams {
  notes: BulkNote[];
  batch_size?: number;
}

export class BulkCreateNotesTool extends BaseTool<BulkCreateNotesParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_note_bulk_create',
      'Bulk create multiple customer notes',
      {
        type: 'object',
        required: ['notes'],
        properties: {
          notes: {
            type: 'array',
            items: {
              type: 'object',
              required: ['content'],
              properties: {
                content: {
                  type: 'string',
                  description: 'Note content',
                },
                title: {
                  type: 'string',
                  description: 'Note title',
                },
                customer_email: {
                  type: 'string',
                  format: 'email',
                  description: 'Customer email',
                },
                company_name: {
                  type: 'string',
                  description: 'Company name',
                },
                source: {
                  type: 'string',
                  enum: ['email', 'call', 'meeting', 'survey', 'support', 'social'],
                  description: 'Feedback source',
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Note tags',
                },
                feature_ids: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Features to link',
                },
              },
            },
            minItems: 1,
            maxItems: 100,
            description: 'Notes to create',
          },
          batch_size: {
            type: 'number',
            minimum: 1,
            maximum: 50,
            default: 10,
            description: 'Number of notes to create per batch',
          },
        },
      },
      {
        requiredPermissions: [Permission.BULK_OPERATIONS],
        minimumAccessLevel: AccessLevel.WRITE,
        description: 'Requires write access for bulk operations',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(params: BulkCreateNotesParams): Promise<ToolExecutionResult> {
    try {
      this.logger.info('Bulk creating notes', { count: params.notes.length });

      // The v2 API has no bulk-create endpoint (the v1 /notes/bulk route now
      // returns 410 Gone), so we create notes individually via POST /v2/notes.
      // batch_size is retained for schema compatibility but no longer changes
      // the request shape — notes are created sequentially.
      const results: unknown[] = [];
      const errors: Array<{ index: number; title?: string; error: string }> = [];

      for (let i = 0; i < params.notes.length; i++) {
        const note = params.notes[i];
        try {
          const name = (note.title && note.title.trim()) || this.deriveTitle(note.content);
          const content = note.content.startsWith('<')
            ? note.content
            : `<p>${note.content.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`;

          const fields: Record<string, unknown> = { name, content };
          if (note.tags?.length) {
            fields.tags = note.tags.map((tag) => ({ name: tag }));
          }

          const response = await this.apiClient.post<{ data?: { id?: string } }>('/v2/notes', {
            data: { type: 'textNote', fields },
          });
          const created = (response as any)?.data ?? response;
          const noteId: string | undefined = created?.id;

          if (noteId && note.feature_ids?.length) {
            for (const featureId of note.feature_ids) {
              await this.apiClient.post(`/v2/notes/${noteId}/relationships`, {
                data: {
                  type: 'link',
                  target: { type: 'link', id: featureId, entity: { type: 'feature' } },
                },
              });
            }
          }

          results.push(created);
        } catch (error) {
          this.logger.error(`Failed to create note at index ${i}`, error);
          errors.push({ index: i, title: note.title, error: (error as Error).message });
        }
      }

      return {
        success: errors.length === 0,
        data: {
          created: results,
          total_created: results.length,
          total_requested: params.notes.length,
          errors: errors.length > 0 ? errors : undefined,
        },
      };
    } catch (error) {
      this.logger.error('Failed to bulk create notes', error);

      return {
        success: false,
        error: `Failed to bulk create notes: ${(error as Error).message}`,
      };
    }
  }

  private deriveTitle(content: string): string {
    const text = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) return 'Untitled Note';
    return text.length > 80 ? `${text.slice(0, 77)}...` : text;
  }
}