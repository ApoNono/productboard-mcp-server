import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '@api/index.js';
import { Logger } from '@utils/logger.js';
import { Permission, AccessLevel } from '@auth/permissions.js';
import { ToolExecutionResult } from '../../core/types.js';

interface CurrentUserParams {}

export class CurrentUserTool extends BaseTool<CurrentUserParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_user_current',
      'Get the current user (NOTE: the Productboard v2 API has no current-user/current-member endpoint)',
      {
        type: 'object',
        properties: {},
      },
      {
        requiredPermissions: [Permission.USERS_READ],
        minimumAccessLevel: AccessLevel.READ,
        description: 'Requires read access to user information',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(_params: CurrentUserParams): Promise<ToolExecutionResult> {
    this.logger.info('pb_user_current called — no current-user endpoint exists in Productboard v2');

    // The v1 REST API (which this tool previously probed via /features) is retired
    // (HTTP 410 Gone), and the v2 API has no current-user / current-member endpoint.
    // Rather than hit a dead endpoint, return a clear explanation. Identity is tied to
    // the API token itself and cannot be resolved to a specific member via the API.
    return {
      success: false,
      error:
        'The Productboard v2 API has no current-user (current-member) endpoint, and the v1 API is retired. ' +
        'The authenticated identity is determined by the API token and cannot be resolved to a specific ' +
        'member through the API. To list all workspace members, use pb_user_list (GET /v2/members).',
    };
  }
}
