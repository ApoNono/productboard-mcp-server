import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface CreateFeatureParams {
  name: string;
  description: string;
  product_id?: string;
  component_id?: string;
  owner_email?: string;
  tags?: string[];
  team_ids?: string[];
}

export class CreateFeatureTool extends BaseTool<CreateFeatureParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_feature_create',
      'Create a new feature in Productboard',
      {
        type: 'object',
        required: ['name', 'description'],
        properties: {
          name: {
            type: 'string',
            description: 'Feature name (max 255 characters)',
            maxLength: 255,
          },
          description: {
            type: 'string',
            description: 'Detailed feature description',
          },
          product_id: {
            type: 'string',
            description: 'ID of the parent product',
          },
          component_id: {
            type: 'string',
            description: 'ID of the component this feature belongs to',
          },
          owner_email: {
            type: 'string',
            format: 'email',
            description: 'Email of the feature owner',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags to categorize the feature',
          },
          team_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Team UUIDs to assign to this feature (set via v2 entities PATCH after creation). Use pb_team_list to look up team IDs.',
          },
        },
      },
      {
        requiredPermissions: [Permission.FEATURES_WRITE],
        minimumAccessLevel: AccessLevel.WRITE,
        description: 'Requires write access to create features',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(params: CreateFeatureParams): Promise<ToolExecutionResult> {
    try {
      // Convert plain text description to HTML if needed
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

      if (params.team_ids && params.team_ids.length > 0) {
        fields['teams'] = params.team_ids.map((id) => ({ id }));
      }

      if (params.tags) {
        fields['tags'] = params.tags;
      }

      const relationships: unknown[] = [];
      if (params.component_id) {
        relationships.push({
          type: 'parent',
          target: { type: 'component', id: params.component_id },
        });
      } else if (params.product_id) {
        relationships.push({
          type: 'parent',
          target: { type: 'product', id: params.product_id },
        });
      }

      const body: Record<string, unknown> = {
        data: {
          type: 'feature',
          fields,
          ...(relationships.length > 0 ? { relationships } : {}),
        },
      };

      const response = await this.apiClient.post('/v2/entities', body);
      const created = (response as any).data || response;

      return {
        success: true,
        data: created,
      };
    } catch (error) {
      this.logger.error('Failed to create feature', error);
      const detail = (error as any)?.details ? JSON.stringify((error as any).details) : '';
      return {
        success: false,
        error: `Failed to create feature: ${(error as Error).message}${detail ? ` — API detail: ${detail}` : ''}`,
      };
    }
  }
}