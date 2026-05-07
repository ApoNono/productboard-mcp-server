import { BaseTool } from '../base.js';
import { ProductboardAPIClient } from '../../api/client.js';
import { Logger } from '../../utils/logger.js';
import { ToolExecutionResult } from '../../core/types.js';
import { Permission, AccessLevel } from '../../auth/permissions.js';

interface SearchNotesParams {
  query: string;
  filters?: {
    customer_emails?: string[];
    company_names?: string[];
    tags?: string[];
    source?: string[];
    created_after?: string;
    created_before?: string;
    feature_ids?: string[];
  };
  sort?: 'relevance' | 'created_at' | 'sentiment';
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export class SearchNotesTool extends BaseTool<SearchNotesParams> {
  constructor(apiClient: ProductboardAPIClient, logger: Logger) {
    super(
      'pb_search_notes',
      'Advanced search for customer notes',
      {
        type: 'object',
        required: ['query'],
        properties: {
          query: {
            type: 'string',
            description: 'Search query text',
          },
          filters: {
            type: 'object',
            properties: {
              customer_emails: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter by customer emails',
              },
              company_names: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter by company names',
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter by tags',
              },
              source: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter by source',
              },
              created_after: {
                type: 'string',
                format: 'date',
                description: 'Filter notes created after date',
              },
              created_before: {
                type: 'string',
                format: 'date',
                description: 'Filter notes created before date',
              },
              feature_ids: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter by attached feature IDs',
              },
            },
          },
          sort: {
            type: 'string',
            enum: ['relevance', 'created_at', 'sentiment'],
            default: 'relevance',
            description: 'Sort results by',
          },
          order: {
            type: 'string',
            enum: ['asc', 'desc'],
            default: 'desc',
            description: 'Sort order',
          },
          limit: {
            type: 'number',
            minimum: 1,
            maximum: 100,
            default: 20,
            description: 'Maximum number of results',
          },
          offset: {
            type: 'number',
            minimum: 0,
            default: 0,
            description: 'Number of results to skip',
          },
        },
      },
      {
        requiredPermissions: [Permission.SEARCH],
        minimumAccessLevel: AccessLevel.READ,
        description: 'Requires search access',
      },
      apiClient,
      logger
    );
  }

  protected async executeInternal(params: SearchNotesParams): Promise<ToolExecutionResult> {
    try {
      this.logger.info('Searching notes', { query: params.query });

      // Productboard does not expose a `/search/notes` endpoint — it returned
      // a 404 ("no Route matched with those values"). Note search is the same
      // /notes endpoint with the `term` query parameter, which performs a
      // full-text match across note title and content.
      //
      // Productboard's /notes endpoint also uses camelCase query parameters
      // and accepts a single value (not arrays) for most filters; only `allTags`
      // accepts a comma-separated list. The `sort` and `order` parameters are
      // not supported by /notes and are silently ignored — they remain in the
      // tool's input schema for backwards compatibility but have no effect.
      const queryParams: Record<string, any> = {
        term: params.query,
        pageLimit: params.limit ?? 20,
      };

      if (params.filters) {
        if (params.filters.customer_emails?.length) queryParams.customerEmail = params.filters.customer_emails[0];
        if (params.filters.company_names?.length) queryParams.companyName = params.filters.company_names[0];
        if (params.filters.tags?.length) queryParams.allTags = params.filters.tags.join(',');
        if (params.filters.source?.length) queryParams.source = params.filters.source[0];
        if (params.filters.created_after) queryParams.createdFrom = params.filters.created_after;
        if (params.filters.created_before) queryParams.createdTo = params.filters.created_before;
        if (params.filters.feature_ids?.length) queryParams.featureId = params.filters.feature_ids[0];
      }

      const response = await this.apiClient.makeRequest({
        method: 'GET',
        endpoint: '/notes',
        params: queryParams,
      });

      return {
        success: true,
        data: response,
      };
    } catch (error) {
      this.logger.error('Failed to search notes', error);
      
      return {
        success: false,
        error: `Failed to search notes: ${(error as Error).message}`,
      };
    }
  }
}