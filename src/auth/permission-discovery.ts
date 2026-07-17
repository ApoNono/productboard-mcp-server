import { ProductboardAPIClient } from '@api/client.js';
import { Logger } from '@utils/logger.js';
import {
  UserPermissions,
  AccessLevel,
  Permission,
  PermissionTestResult,
} from './permissions.js';
import {
  APIAuthorizationError,
  APINotFoundError,
  APIValidationError,
} from '@api/errors.js';

export class PermissionDiscoveryService {
  private apiClient: ProductboardAPIClient;
  private logger: Logger;

  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    this.apiClient = apiClient;
    this.logger = logger;
  }

  /**
   * Grant full admin permissions for Bearer token authentication
   * Bearer tokens provide unrestricted access according to Productboard API docs
   */
  grantFullPermissions(): UserPermissions {
    this.logger.info('Granting full permissions for Bearer token authentication');

    // Create set of all available permissions
    const permissions = new Set<Permission>([
      Permission.USERS_READ,
      Permission.USERS_WRITE,
      Permission.USERS_ADMIN,
      Permission.FEATURES_READ,
      Permission.FEATURES_WRITE,
      Permission.FEATURES_DELETE,
      Permission.PRODUCTS_READ,
      Permission.PRODUCTS_WRITE,
      Permission.PRODUCTS_DELETE,
      Permission.NOTES_READ,
      Permission.NOTES_WRITE,
      Permission.NOTES_DELETE,
      Permission.COMPANIES_READ,
      Permission.COMPANIES_WRITE,
      Permission.OBJECTIVES_READ,
      Permission.OBJECTIVES_WRITE,
      Permission.OBJECTIVES_DELETE,
      Permission.INITIATIVES_READ,
      Permission.INITIATIVES_WRITE,
      Permission.INITIATIVES_DELETE,
      Permission.RELEASES_READ,
      Permission.RELEASES_WRITE,
      Permission.RELEASES_DELETE,
      Permission.CUSTOM_FIELDS_READ,
      Permission.CUSTOM_FIELDS_WRITE,
      Permission.CUSTOM_FIELDS_DELETE,
      Permission.WEBHOOKS_READ,
      Permission.WEBHOOKS_WRITE,
      Permission.WEBHOOKS_DELETE,
      Permission.ANALYTICS_READ,
      Permission.INTEGRATIONS_READ,
      Permission.INTEGRATIONS_WRITE,
      Permission.EXPORT_DATA,
      Permission.BULK_OPERATIONS,
      Permission.SEARCH,
    ]);

    return {
      accessLevel: AccessLevel.ADMIN,
      isReadOnly: false,
      canWrite: true,
      canDelete: true,
      isAdmin: true,
      permissions,
      capabilities: {
        users: { read: true, write: true, admin: true },
        features: { read: true, write: true, delete: true },
        products: { read: true, write: true, delete: true },
        notes: { read: true, write: true, delete: true },
        companies: { read: true, write: true },
        objectives: { read: true, write: true, delete: true },
        releases: { read: true, write: true, delete: true },
        customFields: { read: true, write: true, delete: true },
        webhooks: { read: true, write: true, delete: true },
        analytics: { read: true },
        integrations: { read: true, write: true },
        export: { data: true },
        bulk: { operations: true },
        search: { enabled: true },
      },
    };
  }

  async discoverUserPermissions(): Promise<UserPermissions> {
    this.logger.info('Starting permission discovery...');

    const testResults = await this.runPermissionTests();
    const permissions = this.analyzeTestResults(testResults);

    this.logger.info('Permission discovery completed', {
      accessLevel: permissions.accessLevel,
      permissionCount: permissions.permissions.size,
      capabilities: permissions.capabilities,
    });

    return permissions;
  }

  private async runPermissionTests(): Promise<PermissionTestResult[]> {
    const tests: Array<{
      endpoint: string;
      method: 'GET' | 'POST' | 'PUT' | 'DELETE';
      testData?: unknown;
      headers?: Record<string, string>;
      description: string;
    }> = [
      // Member endpoint tests (v2 — the old v1 /users route now returns 410 Gone;
      // Productboard makers/users are exposed via /v2/members).
      { endpoint: '/v2/members', method: 'GET', description: 'List members (makers/users)' },

      // Feature endpoint tests (v2 — /v1 /features now 410 Gone; entities are the
      // v2 model). The POST intentionally omits the required { data: { type, fields } }
      // wrapper so it returns a 400 validation error (proving write access) without
      // creating a real entity.
      { endpoint: '/v2/entities?type[]=feature', method: 'GET', description: 'Read features' },
      {
        endpoint: '/v2/entities',
        method: 'POST',
        testData: { name: 'Permission Test Feature', description: 'Test' },
        description: 'Create features',
      },

      // Product endpoint tests (v2 entities)
      { endpoint: '/v2/entities?type[]=product', method: 'GET', description: 'Read products' },
      {
        endpoint: '/v2/entities',
        method: 'POST',
        testData: { name: 'Permission Test Product', type: 'product' },
        description: 'Create products',
      },

      // Note endpoint tests (v2 — the v1 /notes route now returns 410 Gone).
      // The POST test intentionally omits the required { data: { ... } }
      // wrapper so it returns a 400 validation error (proving write access)
      // without creating a real note.
      { endpoint: '/v2/notes', method: 'GET', description: 'Read notes' },
      {
        endpoint: '/v2/notes',
        method: 'POST',
        testData: {
          title: 'Permission Test',
          content: 'Permission test note'
        },
        description: 'Create notes',
      },

      // Company endpoint tests (v2 entities)
      { endpoint: '/v2/entities?type[]=company', method: 'GET', description: 'Read companies' },

      // Objective endpoint tests (v2 entities)
      { endpoint: '/v2/entities?type[]=objective', method: 'GET', description: 'Read objectives' },
      {
        endpoint: '/v2/entities',
        method: 'POST',
        testData: { name: 'Test Objective', type: 'company' },
        description: 'Create objectives',
      },

      // Release endpoint tests (v2 entities). Malformed body (no data.type/fields
      // wrapper) 400s without creating anything.
      { endpoint: '/v2/entities?type[]=release', method: 'GET', description: 'Read releases' },
      {
        endpoint: '/v2/entities',
        method: 'POST',
        testData: {
          data: {
            name: 'Test Release',
            description: 'Permission test release',
            releaseGroup: { id: '12345678-1234-1234-1234-123456789012' }
          }
        },
        description: 'Create releases',
      },

      // Custom field tests - skipped: v2 has no per-token custom-field permission
      // probe (definitions are read via /v2/entities/configurations).

      // Webhook tests (v2)
      { endpoint: '/v2/webhooks', method: 'GET', description: 'Read webhooks' },
      {
        endpoint: '/v2/webhooks',
        method: 'POST',
        testData: { url: 'https://example.com/webhook', events: ['feature.created'] },
        description: 'Create webhooks',
      },

      // Search test (v2 — the v1 /search route now returns 410 Gone; entity search
      // is POST /v2/entities/search). A successful search returns a data array (no
      // top-level id), so it does not trigger the POST-cleanup delete below.
      {
        endpoint: '/v2/entities/search',
        method: 'POST',
        testData: { data: { filter: { type: ['feature'], fields: { name: 'test' } }, return: { fields: ['name'] } } },
        description: 'Search functionality',
      },

      // Analytics tests - skip these as endpoints don't exist
      // { endpoint: '/analytics/features', method: 'GET', description: 'Feature analytics' },
      // { endpoint: '/analytics/users', method: 'GET', description: 'User analytics' },
    ];

    const results: PermissionTestResult[] = [];

    for (const test of tests) {
      try {
        this.logger.debug(`Testing ${test.method} ${test.endpoint}...`);

        let response;
        const config = test.headers ? { headers: test.headers } : undefined;
        switch (test.method) {
          case 'GET':
            response = await this.apiClient.get(test.endpoint, undefined, config);
            break;
          case 'POST':
            response = await this.apiClient.post(test.endpoint, test.testData || {}, config);
            break;
          case 'PUT':
            response = await this.apiClient.put(test.endpoint, test.testData || {}, config);
            break;
          case 'DELETE':
            await this.apiClient.delete(test.endpoint, config);
            break;
        }

        results.push({
          endpoint: test.endpoint,
          method: test.method,
          success: true,
          statusCode: 200,
        });

        this.logger.debug(`✓ ${test.description} - Success`);

        // If we created a test resource, try to clean it up
        if (test.method === 'POST' && response && (response as any).data?.id) {
          try {
            const resourceId = (response as any).data.id;
            const baseEndpoint = test.endpoint.split('?')[0];
            await this.apiClient.delete(`${baseEndpoint}/${resourceId}`);
            this.logger.debug(`Cleaned up test resource: ${resourceId}`);
          } catch (cleanupError) {
            // Ignore cleanup errors
            this.logger.debug('Could not clean up test resource (non-critical)');
          }
        }
      } catch (error) {
        let statusCode = 500;
        let errorMessage = 'Unknown error';

        if (error instanceof APIAuthorizationError) {
          statusCode = 403;
          errorMessage = 'Forbidden - insufficient permissions';
        } else if (error instanceof APINotFoundError) {
          statusCode = 404;
          errorMessage = 'Not found - endpoint may not exist';
        } else if (error instanceof APIValidationError) {
          statusCode = 400;
          errorMessage = 'Validation error - invalid test data';
        } else if (error instanceof Error) {
          errorMessage = error.message;
        }

        results.push({
          endpoint: test.endpoint,
          method: test.method,
          success: false,
          statusCode,
          error: errorMessage,
        });

        this.logger.debug(`✗ ${test.description} - ${errorMessage}`);
      }

      // Add small delay between tests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
  }

  private analyzeTestResults(testResults: PermissionTestResult[]): UserPermissions {
    const permissions = new Set<Permission>();
    
    // Helper function to check if an endpoint test succeeded or failed with validation (not permissions)
    const canAccess = (endpoint: string, method: string): boolean => {
      return testResults.some(
        result => 
          result.endpoint.includes(endpoint) && 
          result.method === method && 
          (result.success || result.statusCode === 400) // 400 = validation error, means we have permission
      );
    };

    // Analyze user/member permissions (v2 /v2/members). There is no members POST
    // probe, so usersWrite stays false — the same as under the old v1 /users probe.
    const usersRead = canAccess('/v2/members', 'GET');
    const usersWrite = canAccess('/v2/members', 'POST');
    if (usersRead) permissions.add(Permission.USERS_READ);
    if (usersWrite) permissions.add(Permission.USERS_WRITE);

    // Analyze feature permissions. In v2 features/products/companies/objectives/
    // releases are all served by the single /v2/entities endpoint, so they share one
    // read permission and one write permission — canAccess('/v2/entities', …) resolves
    // them together, which is semantically correct for v2.
    const featuresRead = canAccess('/v2/entities', 'GET');
    const featuresWrite = canAccess('/v2/entities', 'POST');
    if (featuresRead) permissions.add(Permission.FEATURES_READ);
    if (featuresWrite) permissions.add(Permission.FEATURES_WRITE);

    // Analyze product permissions (v2 entities)
    const productsRead = canAccess('/v2/entities', 'GET');
    const productsWrite = canAccess('/v2/entities', 'POST');
    if (productsRead) permissions.add(Permission.PRODUCTS_READ);
    if (productsWrite) permissions.add(Permission.PRODUCTS_WRITE);

    // Analyze note permissions ('/notes' still matches the '/v2/notes' probe via
    // substring include).
    const notesRead = canAccess('/notes', 'GET');
    const notesWrite = canAccess('/notes', 'POST');
    if (notesRead) permissions.add(Permission.NOTES_READ);
    if (notesWrite) permissions.add(Permission.NOTES_WRITE);

    // Analyze company permissions (v2 entities)
    const companiesRead = canAccess('/v2/entities', 'GET');
    if (companiesRead) permissions.add(Permission.COMPANIES_READ);

    // Analyze objective permissions (v2 entities)
    const objectivesRead = canAccess('/v2/entities', 'GET');
    const objectivesWrite = canAccess('/v2/entities', 'POST');
    if (objectivesRead) permissions.add(Permission.OBJECTIVES_READ);
    if (objectivesWrite) permissions.add(Permission.OBJECTIVES_WRITE);

    // Analyze release permissions (v2 entities)
    const releasesRead = canAccess('/v2/entities', 'GET');
    const releasesWrite = canAccess('/v2/entities', 'POST');
    if (releasesRead) permissions.add(Permission.RELEASES_READ);
    if (releasesWrite) permissions.add(Permission.RELEASES_WRITE);

    // Analyze custom field permissions - assume available since we can't test the endpoint
    const customFieldsRead = true; // Most admin tokens have this access
    const customFieldsWrite = true; // Most admin tokens have this access
    if (customFieldsRead) permissions.add(Permission.CUSTOM_FIELDS_READ);
    if (customFieldsWrite) permissions.add(Permission.CUSTOM_FIELDS_WRITE);

    // Analyze webhook permissions (v2)
    const webhooksRead = canAccess('/v2/webhooks', 'GET');
    const webhooksWrite = canAccess('/v2/webhooks', 'POST');
    if (webhooksRead) permissions.add(Permission.WEBHOOKS_READ);
    if (webhooksWrite) permissions.add(Permission.WEBHOOKS_WRITE);

    // Analyze search permissions (v2 POST /v2/entities/search)
    const searchEnabled = canAccess('/v2/entities/search', 'POST');
    if (searchEnabled) permissions.add(Permission.SEARCH);

    // Analyze analytics permissions - assume available for admin tokens
    const analyticsRead = true; // Admin tokens typically have analytics access
    if (analyticsRead) permissions.add(Permission.ANALYTICS_READ);

    // Determine access level
    const canWrite = featuresWrite || productsWrite || notesWrite || objectivesWrite || releasesWrite;
    const canDelete = false; // We didn't test delete operations to avoid data loss
    const isAdmin = analyticsRead || (usersRead && usersWrite); // Admin indicators

    let accessLevel: AccessLevel;
    if (isAdmin) {
      accessLevel = AccessLevel.ADMIN;
    } else if (canDelete) {
      accessLevel = AccessLevel.DELETE;
    } else if (canWrite) {
      accessLevel = AccessLevel.WRITE;
    } else {
      accessLevel = AccessLevel.READ;
    }

    // Build comprehensive capabilities object
    const capabilities = {
      users: {
        read: usersRead,
        write: usersWrite,
        admin: isAdmin,
      },
      features: {
        read: featuresRead,
        write: featuresWrite,
        delete: canDelete,
      },
      products: {
        read: productsRead,
        write: productsWrite,
        delete: canDelete,
      },
      notes: {
        read: notesRead,
        write: notesWrite,
        delete: canDelete,
      },
      companies: {
        read: companiesRead,
        write: false, // Usually read-only
      },
      objectives: {
        read: objectivesRead,
        write: objectivesWrite,
        delete: canDelete,
      },
      releases: {
        read: releasesRead,
        write: releasesWrite,
        delete: canDelete,
      },
      customFields: {
        read: customFieldsRead,
        write: customFieldsWrite,
        delete: canDelete,
      },
      webhooks: {
        read: webhooksRead,
        write: webhooksWrite,
        delete: canDelete,
      },
      analytics: {
        read: analyticsRead,
      },
      integrations: {
        read: true, // Usually available if other permissions exist
        write: canWrite,
      },
      export: {
        data: featuresRead, // Can export if can read features
      },
      bulk: {
        operations: canWrite, // Bulk operations require write access
      },
      search: {
        enabled: searchEnabled,
      },
    };

    return {
      accessLevel,
      isReadOnly: !canWrite,
      canWrite,
      canDelete,
      isAdmin,
      permissions,
      capabilities,
    };
  }
}