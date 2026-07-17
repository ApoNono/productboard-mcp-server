import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface CreateCustomFieldParams {
  name: string;
  type: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean';
  description?: string;
  required?: boolean;
  options?: string[];
  entity_type: 'feature' | 'note' | 'objective';
}

export class CreateCustomFieldTool extends BaseTool<CreateCustomFieldParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_customfield_create',
      'Create a new custom field',
      {
        type: 'object',
        required: ['name', 'type', 'entity_type'],
        properties: {
          name: {
            type: 'string',
            description: 'Custom field name',
          },
          type: {
            type: 'string',
            enum: ['text', 'number', 'date', 'select', 'multiselect', 'boolean'],
            description: 'Field data type',
          },
          description: {
            type: 'string',
            description: 'Field description',
          },
          required: {
            type: 'boolean',
            default: false,
            description: 'Whether the field is required',
          },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: 'Options for select/multiselect fields',
          },
          entity_type: {
            type: 'string',
            enum: ['feature', 'note', 'objective'],
            description: 'Entity type this field applies to',
          },
        },
      },
      {
        requiredPermissions: [Permission.CUSTOM_FIELDS_WRITE],
        minimumAccessLevel: AccessLevel.WRITE,
        description: 'Requires write access to custom fields',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(_params: CreateCustomFieldParams): Promise<ToolExecutionResult> {
    // The v1 /customfields endpoint was retired (HTTP 410 Gone). Creating a custom
    // field DEFINITION is not exposed by the public Productboard v2 API — v2 only
    // lets you read field definitions (GET /v2/entities/configurations) and create
    // additional options on an existing select-type field
    // (POST /v2/entities/fields/{id}/values). New custom fields must be created in
    // the Productboard UI. No networked call is made here.
    this.logger.info('Custom field creation requested, but v2 has no field-definition create endpoint');

    return {
      success: false,
      error:
        'Creating custom field definitions is not supported by the Productboard v2 API. ' +
        'v2 exposes field definitions read-only via GET /v2/entities/configurations; ' +
        'new custom fields must be created in the Productboard UI.',
    };
  }
}