import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface ListCustomFieldsParams {
  entity_type?: 'feature' | 'note' | 'objective';
  type?: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean';
  required?: boolean;
}

export class ListCustomFieldsTool extends BaseTool<ListCustomFieldsParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_customfield_list',
      'List custom fields with optional filtering',
      {
        type: 'object',
        properties: {
          entity_type: {
            type: 'string',
            enum: ['feature', 'note', 'objective'],
            description: 'Filter by entity type',
          },
          type: {
            type: 'string',
            enum: ['text', 'number', 'date', 'select', 'multiselect', 'boolean'],
            description: 'Filter by field type',
          },
          required: {
            type: 'boolean',
            description: 'Filter by required status',
          },
        },
      },
      {
        requiredPermissions: [Permission.CUSTOM_FIELDS_READ],
        minimumAccessLevel: AccessLevel.READ,
        description: 'Requires read access to custom fields',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(params: ListCustomFieldsParams = {}): Promise<ToolExecutionResult> {
    try {
      this.logger.info('Listing custom field definitions via v2 entity configurations');

      // v1 /customfields was retired. In v2, field DEFINITIONS (both built-in and
      // custom) are exposed per entity type via GET /v2/entities/configurations.
      // Each configuration lists the entity's fields with id, name, schema,
      // lifecycle, constraints and (for select/status fields) allowed values.
      const queryParams: Record<string, string> = {};
      if (params.entity_type) queryParams['type[]'] = params.entity_type;

      const response = await this.apiClient.get<any>('/v2/entities/configurations', queryParams);

      // The `type` (field data-type) and `required` filters have no server-side
      // equivalent on this endpoint. Keep them in the schema but report as ignored.
      const ignoredFilters: string[] = [];
      if (params.type) ignoredFilters.push('type');
      if (params.required !== undefined) ignoredFilters.push('required');

      return {
        success: true,
        data: {
          configurations: response?.data ?? response,
          links: response?.links,
          ...(ignoredFilters.length
            ? {
                note:
                  `Filters not supported by the v2 entity configurations endpoint and ignored: ` +
                  `${ignoredFilters.join(', ')}. Field definitions are returned per entity type; ` +
                  `inspect each field's schema/constraints to filter client-side.`,
              }
            : {}),
        },
      };
    } catch (error) {
      this.logger.error('Failed to list custom fields', error);

      return {
        success: false,
        error: `Failed to list custom fields: ${(error as Error).message}`,
      };
    }
  }
}