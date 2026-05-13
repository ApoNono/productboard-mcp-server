import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface ListTeamsParams {
  name?: string;
}

export class ListTeamsTool extends BaseTool<ListTeamsParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_team_list',
      'List teams in the Productboard workspace (used to look up team IDs for feature assignment)',
      {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Filter to teams whose name contains this string (case-insensitive)',
          },
        },
      },
      {
        requiredPermissions: [Permission.USERS_READ],
        minimumAccessLevel: AccessLevel.READ,
        description: 'Requires read access',
      },
      apiClient,
      logger,
    );
  }

  protected async executeInternal(params: ListTeamsParams = {}): Promise<unknown> {
    try {
      const response = await this.apiClient.get<any>('/v2/teams');
      const teams = (response?.data || []).map((t: any) => ({
        id: t.id,
        name: t.fields?.name,
        handle: t.fields?.handle,
        description: t.fields?.description,
      }));

      const filtered = params.name
        ? teams.filter((t: any) =>
            (t.name || '').toLowerCase().includes(params.name!.toLowerCase()),
          )
        : teams;

      return {
        success: true,
        data: { teams: filtered, total: filtered.length },
      };
    } catch (error) {
      this.logger.error('Failed to list teams', error);
      return {
        success: false,
        error: `Failed to list teams: ${(error as Error).message}`,
      };
    }
  }
}
