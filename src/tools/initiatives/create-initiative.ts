import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface CreateInitiativeParams {
  name: string;
  description?: string;
  owner_email?: string;
  start_date?: string;
  end_date?: string;
  granularity?: 'day' | 'month' | 'quarter' | 'year';
  status_name?: string;
}

export class CreateInitiativeTool extends BaseTool<CreateInitiativeParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_initiative_create',
      'Create a new initiative',
      {
        type: 'object',
        required: ['name'],
        properties: {
          name: {
            type: 'string',
            description: 'Initiative name',
          },
          description: {
            type: 'string',
            description: 'Initiative description (HTML or plain text supported)',
          },
          owner_email: {
            type: 'string',
            format: 'email',
            description: 'Email of the initiative owner',
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
            description: 'Timeframe granularity (default: month)',
          },
          status_name: {
            type: 'string',
            description: 'Status name (must match an existing status in your workspace)',
          },
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

  protected async executeInternal(params: CreateInitiativeParams): Promise<ToolExecutionResult> {
    try {
      this.logger.info('Creating initiative', { name: params.name });

      // v2 entities: POST /v2/entities with type "initiative" and a fields
      // object (same envelope as create-feature.ts).
      const fields: Record<string, any> = {
        name: params.name,
      };
      if (params.description) fields.description = params.description;
      if (params.owner_email) fields.owner = { email: params.owner_email };
      if (params.status_name) fields.status = { name: params.status_name };
      if (params.start_date || params.end_date || params.granularity) {
        fields.timeframe = {
          ...(params.start_date && { startDate: params.start_date }),
          ...(params.end_date && { endDate: params.end_date }),
          ...(params.granularity && { granularity: params.granularity }),
        };
      }

      const body: Record<string, any> = {
        data: {
          type: 'initiative',
          fields,
        },
      };

      const response = await this.apiClient.post('/v2/entities', body);

      return {
        success: true,
        data: (response as any)?.data ?? response,
      };
    } catch (error) {
      this.logger.error('Failed to create initiative', error);
      return {
        success: false,
        error: `Failed to create initiative: ${(error as Error).message}`,
      };
    }
  }
}
