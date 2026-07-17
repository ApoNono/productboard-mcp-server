import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface GetInitiativeParams {
  initiative_id: string;
}

export class GetInitiativeTool extends BaseTool<GetInitiativeParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_initiative_get',
      'Get a single initiative by ID, including its current status, owner, timeframe, and links',
      {
        type: 'object',
        required: ['initiative_id'],
        properties: {
          initiative_id: {
            type: 'string',
            description: 'Initiative ID (UUID)',
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

  protected async executeInternal(params: GetInitiativeParams): Promise<ToolExecutionResult> {
    try {
      this.logger.info('Getting initiative', { initiative_id: params.initiative_id });

      // v2 entities: GET /v2/entities/{id}?fields[]=all returns { data: {...} }.
      const response = await this.apiClient.get(`/v2/entities/${params.initiative_id}`, {
        'fields[]': 'all',
      });

      const initiative = (response as any)?.data ?? response;

      return {
        success: true,
        data: initiative,
      };
    } catch (error) {
      this.logger.error('Failed to get initiative', error);
      return {
        success: false,
        error: `Failed to get initiative: ${(error as Error).message}`,
      };
    }
  }
}
