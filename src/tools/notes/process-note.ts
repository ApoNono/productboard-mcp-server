import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface ProcessNoteParams {
  note_id: string;
  processed?: boolean;
}

export class ProcessNoteTool extends BaseTool<ProcessNoteParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_note_process',
      'Mark a Productboard note/insight as processed (or unprocessed)',
      {
        type: 'object',
        required: ['note_id'],
        properties: {
          note_id: {
            type: 'string',
            description: 'UUID of the note to update',
          },
          processed: {
            type: 'boolean',
            default: true,
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

  protected async executeInternal(params: ProcessNoteParams): Promise<ToolExecutionResult> {
    try {
      const processed = params.processed !== false;
      const body = {
        data: {
          fields: {
            processed,
          },
        },
      };

      const response = await this.apiClient.patch(`/v2/notes/${params.note_id}`, body);
      const updated = (response as any)?.data || response;

      return {
        success: true,
        data: {
          note_id: params.note_id,
          processed,
          note: updated,
        },
      };
    } catch (error) {
      this.logger.error('Failed to process note', error);
      return {
        success: false,
        error: `Failed to process note: ${(error as Error).message}`,
      };
    }
  }
}
