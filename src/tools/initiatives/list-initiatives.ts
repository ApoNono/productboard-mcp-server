import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface ListInitiativesParams {
  status?: string;
  owner_email?: string;
  archived?: boolean;
  limit?: number;
}

export class ListInitiativesTool extends BaseTool<ListInitiativesParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_initiative_list',
      'List initiatives in the workspace',
      {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: 'Filter by initiative status name (e.g., "In Progress", "Completed")',
          },
          owner_email: {
            type: 'string',
            format: 'email',
            description: 'Filter by owner email',
          },
          archived: {
            type: 'boolean',
            description: 'Include archived initiatives (default: false)',
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            default: 20,
            description: 'Maximum number of results',
          },
        },
      },
      {
        requiredPermissions: [Permission.INITIATIVES_READ],
        minimumAccessLevel: AccessLevel.READ,
        description: 'Requires read access to initiatives',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(params: ListInitiativesParams = {}): Promise<ToolExecutionResult> {
    try {
      this.logger.info('Listing initiatives');

      // Productboard's /initiatives endpoint uses camelCase query params and
      // `pageLimit` (not `limit`) for the page size.
      const queryParams: Record<string, any> = {
        pageLimit: params.limit ?? 20,
      };
      if (params.archived !== undefined) queryParams.archived = params.archived;

      const response = await this.apiClient.makeRequest({
        method: 'GET',
        endpoint: '/initiatives',
        params: queryParams,
      });

      let initiatives: any[] = Array.isArray((response as any)?.data)
        ? (response as any).data
        : [];

      // Client-side filtering for fields Productboard doesn't accept as
      // query params (status name, owner email).
      if (params.status) {
        initiatives = initiatives.filter(
          i => i?.status?.name?.toLowerCase() === params.status!.toLowerCase()
        );
      }
      if (params.owner_email) {
        const target = params.owner_email.toLowerCase();
        initiatives = initiatives.filter(
          i => i?.owner?.email?.toLowerCase() === target
        );
      }

      return {
        success: true,
        data: {
          initiatives: initiatives.map((i: any) => ({
            id: i.id,
            name: i.name,
            description: i.description,
            status: i.status?.name,
            owner: i.owner?.email,
            timeframe: i.timeframe,
            archived: i.archived,
            createdAt: i.createdAt,
            updatedAt: i.updatedAt,
            html: i.links?.html,
          })),
          total: initiatives.length,
        },
      };
    } catch (error) {
      this.logger.error('Failed to list initiatives', error);
      return {
        success: false,
        error: `Failed to list initiatives: ${(error as Error).message}`,
      };
    }
  }
}
