import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface SetCustomFieldValueParams {
  entity_id: string;
  entity_type: 'feature' | 'note' | 'objective';
  field_id: string;
  value: any;
}

export class SetCustomFieldValueTool extends BaseTool<SetCustomFieldValueParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_customfield_value_set',
      'Set custom field value for an entity',
      {
        type: 'object',
        required: ['entity_id', 'entity_type', 'field_id', 'value'],
        properties: {
          entity_id: {
            type: 'string',
            description: 'ID of the entity (feature, note, objective)',
          },
          entity_type: {
            type: 'string',
            enum: ['feature', 'note', 'objective'],
            description: 'Type of entity',
          },
          field_id: {
            type: 'string',
            description: 'Custom field ID',
          },
          value: {
            description: 'Value to set (type depends on field type)',
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

  protected async executeInternal(params: SetCustomFieldValueParams): Promise<ToolExecutionResult> {
    try {
      this.logger.info('Setting custom field value', {
        entity_id: params.entity_id,
        field_id: params.field_id,
      });

      // v1 /customfields/{id}/values was retired. In v2, custom field values live
      // directly on the entity: they appear in the entity's `fields` object keyed by
      // the field id (custom fields use a UUID key). Set one by PATCHing the entity
      // with { data: { fields: { <field_id>: <value> } } }.
      // entity_type is retained in the schema but not needed for the request — the
      // PATCH /v2/entities/{id} endpoint is entity-type agnostic.
      const body = {
        data: {
          fields: {
            [params.field_id]: params.value,
          },
        },
      };

      const response = await this.apiClient.patch<any>(
        `/v2/entities/${params.entity_id}`,
        body
      );

      return {
        success: true,
        data: response?.data ?? response,
      };
    } catch (error) {
      this.logger.error('Failed to set custom field value', error);

      return {
        success: false,
        error: `Failed to set custom field value: ${(error as Error).message}`,
      };
    }
  }
}