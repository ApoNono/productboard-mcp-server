import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface CreateKeyResultParams {
  objective_id: string;
  name: string;
  metric_type?: 'number' | 'percentage' | 'currency';
  current_value?: number;
  target_value: number;
  unit?: string;
}

export class CreateKeyResultTool extends BaseTool<CreateKeyResultParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_keyresult_create',
      'Create a key result for an objective',
      {
        type: 'object',
        required: ['objective_id', 'name', 'target_value'],
        properties: {
          objective_id: {
            type: 'string',
            description: 'Parent objective ID',
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

  protected async executeInternal(params: CreateKeyResultParams): Promise<ToolExecutionResult> {
    try {
      this.logger.info('Creating key result', {
        name: params.name,
        objective_id: params.objective_id,
      });

      // keyResult is a v2 entity type. The name and the parent link to the
      // owning objective use the verified entity/relationship shapes. The
      // metric fields (metric_type/current_value/target_value/unit) are sent
      // under best-effort camelCase names: the workspace had no existing
      // keyResult entities to introspect the exact field keys, and Productboard
      // silently ignores unknown fields rather than erroring. They are echoed
      // back under submittedMetricFields so the caller can confirm what landed.
      const fields: Record<string, unknown> = {
        name: params.name,
      };
      if (params.metric_type !== undefined) fields.metricType = params.metric_type;
      if (params.current_value !== undefined) fields.currentValue = params.current_value;
      if (params.target_value !== undefined) fields.targetValue = params.target_value;
      if (params.unit !== undefined) fields.unit = params.unit;

      const body: Record<string, unknown> = {
        data: {
          type: 'keyResult',
          fields,
          relationships: [
            {
              type: 'parent',
              target: { id: params.objective_id },
            },
          ],
        },
      };

      const response = await this.apiClient.post('/v2/entities', body);
      const created = (response as any).data || response;

      return {
        success: true,
        data: {
          keyResult: created,
          submittedMetricFields: {
            metricType: params.metric_type,
            currentValue: params.current_value,
            targetValue: params.target_value,
            unit: params.unit,
          },
          note: 'Metric field keys are unverified (no existing keyResult entities were available to introspect). Confirm the created entity reflects the target/current values; unknown keys are silently ignored by the v2 API.',
        },
      };
    } catch (error) {
      this.logger.error('Failed to create key result', error);
      const detail = (error as any)?.details ? JSON.stringify((error as any).details) : '';
      return {
        success: false,
        error: `Failed to create key result: ${(error as Error).message}${detail ? ` — API detail: ${detail}` : ''}`,
      };
    }
  }
}
