import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface UpdateObjectiveParams {
  id: string;
  name?: string;
  description?: string;
  status?: 'active' | 'completed' | 'cancelled';
  owner_email?: string;
  due_date?: string;
  period?: 'quarter' | 'year';
}

export class UpdateObjectiveTool extends BaseTool<UpdateObjectiveParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_objective_update',
      'Update an existing objective',
      {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'Objective ID to update',
          },
          name: {
            type: 'string',
            description: 'Objective name',
          },
          description: {
            type: 'string',
            description: 'Objective description',
          },
          status: {
            type: 'string',
            enum: ['active', 'completed', 'cancelled'],
            description:
              'Objective status. Passed through to the v2 field status.name; note that v2 uses named workflow statuses (e.g. "Upcoming", "In Progress"), so these legacy values will only take effect if a matching workflow status exists.',
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
              'Target completion date. NOTE: no scalar due-date field on the v2 objective entity; reported as ignored.',
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

  protected async executeInternal(params: UpdateObjectiveParams): Promise<ToolExecutionResult> {
    try {
      this.logger.info('Updating objective', { id: params.id });

      const fields: Record<string, unknown> = {};
      if (params.name !== undefined) fields.name = params.name;
      if (params.description !== undefined) {
        fields.description = params.description.startsWith('<')
          ? params.description
          : `<p>${params.description.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`;
      }
      if (params.status !== undefined) fields.status = { name: params.status };
      if (params.owner_email !== undefined) fields.owner = { email: params.owner_email };

      const ignoredParams: string[] = [];
      if (params.due_date) ignoredParams.push('due_date');
      if (params.period) ignoredParams.push('period');

      if (Object.keys(fields).length === 0) {
        return {
          success: false,
          error:
            'No update fields provided (name, description, status, or owner_email). ' +
            (ignoredParams.length
              ? `The following params have no v2 equivalent and were ignored: ${ignoredParams.join(', ')}.`
              : ''),
        };
      }

      const response = await this.apiClient.patch(`/v2/entities/${params.id}`, {
        data: { fields },
      });
      const updated = (response as any).data || response;

      return {
        success: true,
        data: {
          objective: updated,
          ...(ignoredParams.length
            ? {
                ignoredParams,
                note: 'due_date and period are not supported by the v2 objective entity and were ignored.',
              }
            : {}),
        },
      };
    } catch (error) {
      this.logger.error('Failed to update objective', error);
      const detail = (error as any)?.details ? JSON.stringify((error as any).details) : '';
      return {
        success: false,
        error: `Failed to update objective: ${(error as Error).message}${detail ? ` — API detail: ${detail}` : ''}`,
      };
    }
  }
}
