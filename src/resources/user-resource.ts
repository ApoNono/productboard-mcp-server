import { Resource, ResourceContent } from '@core/types.js';
import { ProductboardAPIClient } from '@api/index.js';
import { Logger } from '@utils/logger.js';

export class UserResource implements Resource {
  public readonly name = 'pb_users';
  public readonly description = 'Provides access to Productboard users and team information as a structured resource';
  public readonly uri = 'productboard://users';
  public readonly mimeType = 'application/json';

  constructor(
    private apiClient: ProductboardAPIClient,
    private logger: Logger,
  ) {}

  async retrieve(): Promise<ResourceContent> {
    try {
      this.logger.debug('Retrieving users resource data');
      
      // v2 has no current-user/current-member endpoint (the v1 /me route is gone),
      // so there is no "current user" context available here.
      const currentUser: any = null;

      // Get workspace members from the v2 members API (v1 /users now returns 410 Gone).
      let teamUsers = [];
      try {
        const usersResponse = await this.apiClient.get('/v2/members') as any;
        teamUsers = usersResponse.data || [];
      } catch (error) {
        this.logger.debug('Members not available or access restricted');
      }

      // Format the data for resource consumption
      const resourceData = {
        meta: {
          type: 'users',
          currentUser: currentUser ? true : false,
          teamCount: teamUsers.length,
          timestamp: new Date().toISOString(),
        },
        currentUser: currentUser,
        teamUsers: teamUsers,
        schema: {
          properties: {
            id: { type: 'string', description: 'User unique identifier' },
            email: { type: 'string', description: 'User email address' },
            name: { type: 'string', description: 'User display name' },
            role: { type: 'string', description: 'User role in organization' },
            permissions: { type: 'array', description: 'User permissions list' },
            status: { type: 'string', description: 'User account status' },
          },
        },
      };

      return {
        uri: this.uri,
        mimeType: this.mimeType,
        text: JSON.stringify(resourceData, null, 2),
      };
    } catch (error) {
      this.logger.error('Failed to retrieve users resource', error);
      
      // Return error information as resource content
      return {
        uri: this.uri,
        mimeType: 'application/json',
        text: JSON.stringify({
          error: 'Failed to retrieve users data',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        }, null, 2),
      };
    }
  }
}