import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface CreateProductParams {
  name: string;
  description?: string;
  parent_id?: string;
  owner_email?: string;
}

export class CreateProductTool extends BaseTool<CreateProductParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_product_create',
      'Create a new product or sub-product',
      {
        type: 'object',
        required: ['name'],
        properties: {
          name: {
            type: 'string',
            description: 'Product name',
          },
          description: {
            type: 'string',
            description: 'Product description',
          },
          parent_id: {
            type: 'string',
            description: 'Parent product ID (for creating sub-products). Added as a v2 parent relationship.',
          },
          owner_email: {
            type: 'string',
            format: 'email',
            description: 'Product owner email',
          },
        },
      },
      {
        requiredPermissions: [Permission.PRODUCTS_WRITE],
        minimumAccessLevel: AccessLevel.WRITE,
        description: 'Requires write access to products',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(params: CreateProductParams): Promise<ToolExecutionResult> {
    this.logger.info('Creating product', { name: params.name });

    try {
      const fields: Record<string, unknown> = {
        name: params.name,
      };

      if (params.description) {
        // v2 entity descriptions are HTML; wrap plain text like create-feature does.
        fields.description = params.description.startsWith('<')
          ? params.description
          : `<p>${params.description.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`;
      }

      if (params.owner_email) {
        fields.owner = { email: params.owner_email };
      }

      const relationships: unknown[] = [];
      if (params.parent_id) {
        relationships.push({
          type: 'parent',
          target: { id: params.parent_id },
        });
      }

      const body: Record<string, unknown> = {
        data: {
          type: 'product',
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
      this.logger.error('Failed to create product', error);
      const detail = (error as any)?.details ? JSON.stringify((error as any).details) : '';
      return {
        success: false,
        error: `Failed to create product: ${(error as Error).message}${detail ? ` — API detail: ${detail}` : ''}`,
      };
    }
  }
}
