import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface UpdateInitiativeParams {
  initiative_id: string;
  name?: string;
  description?: string;
  owner_email?: string;
  start_date?: string;
  end_date?: string;
  granularity?: 'day' | 'month' | 'quarter' | 'year';
  status_name?: string;
  archived?: boolean;
}

export class UpdateInitiativeTool extends BaseTool<UpdateInitiativeParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_initiative_update',
      'Update an existing initiative (name, description, owner, timeframe, status, archived)',
      {
        type: 'object',
        required: ['initiative_id'],
        properties: {
          initiative_id: {
            type: 'string',
            description: 'Initiative ID to update (UUID)',
          },
          name: { type: 'string', description: 'New name' },
          description: { type: 'string', description: 'New description (HTML or plain text)' },
          owner_email: {
            type: 'string',
            format: 'email',
            description: 'New owner email',
          },
          start_date: {
            type: 'string',
            format: 'date',
            description: 'Timeframe start date (YYYY-MM-DD)',
          },
          end_date: {
            type: 'string',
            format: 'date',
            description: 'Timeframe end date (YYYY-MM-DD)',
          },
          granularity: {
            type: 'string',
            enum: ['day', 'month', 'quarter', 'year'],
            description: 'Timeframe granularity',
          },
          status_name: {
            type: 'string',
            description: 'Status name (must match an existing status in your workspace)',
          },
          archived: { type: 'boolean', description: 'Archive or un-archive the initiative' },
        },
      },
      {
        requiredPermissions: [Permission.INITIATIVES_WRITE],
        minimumAccessLevel: AccessLevel.WRITE,
        description: 'Requires write access to initiatives',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(params: UpdateInitiativeParams): Promise<ToolExecutionResult> {
    try {
      this.logger.info('Updating initiative', { initiative_id: params.initiative_id });

      const data: Record<string, any> = {};
      if (params.name !== undefined) data.name = params.name;
      if (params.description !== undefined) data.description = params.description;
      if (params.owner_email !== undefined) data.owner = { email: params.owner_email };
      if (params.status_name !== undefined) data.status = { name: params.status_name };
      if (params.archived !== undefined) data.archived = params.archived;
      if (
        params.start_date !== undefined ||
        params.end_date !== undefined ||
        params.granularity !== undefined
      ) {
        data.timeframe = {
          ...(params.start_date !== undefined && { startDate: params.start_date }),
          ...(params.end_date !== undefined && { endDate: params.end_date }),
          ...(params.granularity !== undefined && { granularity: params.granularity }),
        };
      }

      const response = await this.apiClient.makeRequest({
        method: 'PATCH',
        endpoint: `/initiatives/${params.initiative_id}`,
        data: { data },
      });

      return {
        success: true,
        data: (response as any)?.data ?? response,
      };
    } catch (error) {
      this.logger.error('Failed to update initiative', error);
      return {
        success: false,
        error: `Failed to update initiative: ${(error as Error).message}`,
      };
    }
  }
}
