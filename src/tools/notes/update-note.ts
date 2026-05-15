import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface UpdateNoteParams {
  note_id: string;
  owner_email?: string;
  name?: string;
  tags?: string[];
  archived?: boolean;
  processed?: boolean;
}

export class UpdateNoteTool extends BaseTool<UpdateNoteParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_note_update',
      'Update a Productboard note — change owner, name, tags, archived, or processed state',
      {
        type: 'object',
        required: ['note_id'],
        properties: {
          note_id: {
            type: 'string',
            description: 'UUID of the note to update',
          },
          owner_email: {
            type: 'string',
            format: 'email',
            description: 'Email of the new note owner (Productboard member)',
          },
          name: {
            type: 'string',
            description: 'New title/name for the note',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Replace all tags on the note with this list',
          },
          archived: {
            type: 'boolean',
            description: 'Set to true to archive the note',
          },
          processed: {
            type: 'boolean',
            description: 'Set to true to mark as processed, false to unprocess',
          },
        },
      },
      {
        requiredPermissions: [Permission.NOTES_WRITE],
        minimumAccessLevel: AccessLevel.WRITE,
        description: 'Requires write access to update notes',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(params: UpdateNoteParams): Promise<ToolExecutionResult> {
    try {
      const fields: Record<string, unknown> = {};

      if (params.owner_email !== undefined) {
        fields.owner = { email: params.owner_email };
      }
      if (params.name !== undefined) {
        fields.name = params.name;
      }
      if (params.tags !== undefined) {
        fields.tags = params.tags.map((name) => ({ name }));
      }
      if (params.archived !== undefined) {
        fields.archived = params.archived;
      }
      if (params.processed !== undefined) {
        fields.processed = params.processed;
      }

      if (Object.keys(fields).length === 0) {
        return {
          success: false,
          error: 'No fields provided to update',
        };
      }

      const body = { data: { fields } };
      const response = await this.apiClient.patch(`/v2/notes/${params.note_id}`, body);
      const updated = (response as any)?.data || response;

      return {
        success: true,
        data: {
          note_id: params.note_id,
          updated_fields: Object.keys(fields),
          note: updated,
        },
      };
    } catch (error) {
      this.logger.error('Failed to update note', error);
      return {
        success: false,
        error: `Failed to update note: ${(error as Error).message}`,
      };
    }
  }
}
