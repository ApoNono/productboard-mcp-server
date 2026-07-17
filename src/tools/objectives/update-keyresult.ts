import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface UpdateKeyResultParams {
  id: string;
  name?: string;
  metric_type?: 'number' | 'percentage' | 'currency';
  current_value?: number;
  target_value?: number;
  unit?: string;
}

export class UpdateKeyResultTool extends BaseTool<UpdateKeyResultParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_keyresult_update',
      'Update an existing key result',
      {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'Key result ID to update',
          },
          name: {
            type: 'string',
            description: 'Key result name',
          },
          metric_type: {
            type: 'string',
            enum: ['number', 'percentage', 'currency'],
            description: 'Type of metric',
          },
          current_value: {
            type: 'number',
            description: 'Current metric value',
          },
          target_value: {
            type: 'number',
            description: 'Target metric value',
          },
          unit: {
            type: 'string',
            description: 'Measurement unit (e.g., "users", "dollars")',
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

  protected async executeInternal(params: UpdateKeyResultParams): Promise<ToolExecutionResult> {
    try {
      this.logger.info('Updating key result', { id: params.id });

      // Metric field keys are best-effort camelCase (see create-keyresult.ts):
      // no existing keyResult entities were available to confirm exact keys,
      // and the v2 API silently ignores unknown field names.
      const fields: Record<string, unknown> = {};
      if (params.name !== undefined) fields.name = params.name;
      if (params.metric_type !== undefined) fields.metricType = params.metric_type;
      if (params.current_value !== undefined) fields.currentValue = params.current_value;
      if (params.target_value !== undefined) fields.targetValue = params.target_value;
      if (params.unit !== undefined) fields.unit = params.unit;

      if (Object.keys(fields).length === 0) {
        return {
          success: false,
          error: 'No update fields provided',
        };
      }

      const response = await this.apiClient.patch(`/v2/entities/${params.id}`, {
        data: { fields },
      });
      const updated = (response as any).data || response;

      return {
        success: true,
        data: {
          keyResult: updated,
          note: 'Metric field keys (metricType/currentValue/targetValue/unit) are unverified; confirm the updated entity reflects the intended values, as unknown keys are silently ignored by the v2 API.',
        },
      };
    } catch (error) {
      this.logger.error('Failed to update key result', error);
      const detail = (error as any)?.details ? JSON.stringify((error as any).details) : '';
      return {
        success: false,
        error: `Failed to update key result: ${(error as Error).message}${detail ? ` — API detail: ${detail}` : ''}`,
      };
    }
  }
}
