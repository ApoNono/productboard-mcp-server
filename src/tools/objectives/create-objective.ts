import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface CreateObjectiveParams {
  name: string;
  description: string;
  owner_email?: string;
  due_date?: string;
  period?: 'quarter' | 'year';
}

export class CreateObjectiveTool extends BaseTool<CreateObjectiveParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_objective_create',
      'Create a new objective',
      {
        type: 'object',
        required: ['name', 'description'],
        properties: {
          name: {
            type: 'string',
            description: 'Objective name',
          },
          description: {
            type: 'string',
            description: 'Objective description',
          },
          owner_email: {
            type: 'string',
            format: 'email',
            description: 'Objective owner',
          },
          due_date: {
            type: 'string',
            format: 'date',
            description:
              'Target completion date. NOTE: the v2 entities API has no scalar due-date field on objectives (dates live in the structured "timeframe"), so this value is reported as ignored rather than silently dropped.',
          },
          period: {
            type: 'string',
            enum: ['quarter', 'year'],
            description:
              'Objective period. NOTE: not a field on the v2 objective entity; reported as ignored.',
          },
        },
      },
      {
        requiredPermissions: [Permission.OBJECTIVES_WRITE],
        minimumAccessLevel: AccessLevel.WRITE,
        description: 'Requires write access to objectives',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(params: CreateObjectiveParams): Promise<ToolExecutionResult> {
    try {
      this.logger.info('Creating objective', { name: params.name });

      // Convert plain text description to HTML if needed (mirrors create-feature.ts).
      const description = params.description.startsWith('<')
        ? params.description
        : `<p>${params.description.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`;

      const fields: Record<string, unknown> = {
        name: params.name,
        description,
      };

      if (params.owner_email) {
        fields['owner'] = { email: params.owner_email };
      }

      const body: Record<string, unknown> = {
        data: {
          type: 'objective',
          fields,
        },
      };

      const response = await this.apiClient.post('/v2/entities', body);
      const created = (response as any).data || response;

      // due_date/period have no v2 objective field equivalent; surface them as ignored.
      const ignoredParams: string[] = [];
      if (params.due_date) ignoredParams.push('due_date');
      if (params.period) ignoredParams.push('period');

      return {
        success: true,
        data: {
          objective: created,
          ...(ignoredParams.length
            ? {
                ignoredParams,
                note: 'due_date and period are not supported by the v2 objective entity and were ignored.',
              }
            : {}),
        },
      };
    } catch (error) {
      this.logger.error('Failed to create objective', error);
      const detail = (error as any)?.details ? JSON.stringify((error as any).details) : '';
      return {
        success: false,
        error: `Failed to create objective: ${(error as Error).message}${detail ? ` — API detail: ${detail}` : ''}`,
      };
    }
  }
}
