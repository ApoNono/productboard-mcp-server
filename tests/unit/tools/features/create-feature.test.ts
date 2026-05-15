import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { CreateFeatureTool } from '@tools/features/create-feature';
import { ProductboardAPIClient } from '@api/client';
import { Logger } from '@utils/logger';
// Error types are checked by message rather than type

describe('CreateFeatureTool', () => {
  let tool: CreateFeatureTool;
  let mockClient: jest.Mocked<ProductboardAPIClient>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockClient = {
      post: jest.fn(),
      get: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      patch: jest.fn(),
    } as unknown as jest.Mocked<ProductboardAPIClient>;
    
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    } as any;
    
    tool = new CreateFeatureTool(mockClient, mockLogger);
  });

  describe('metadata', () => {
    it('should have correct name and description', () => {
      expect(tool.name).toBe('pb_feature_create');
      expect(tool.description).toBe('Create a new feature in Productboard');
    });

    it('should have correct parameter schema', () => {
      const metadata = tool.getMetadata();
      expect(metadata.inputSchema).toMatchObject({
        type: 'object',
        required: ['name', 'description'],
        properties: {
          name: {
            type: 'string',
            description: expect.stringContaining('Feature name'),
          },
          description: {
            type: 'string',
          },
          status: {
            type: 'string',
            enum: ['new', 'in_progress', 'validation', 'done', 'archived'],
            default: 'new',
          },
          priority: {
            type: 'string',
            enum: ['critical', 'high', 'medium', 'low'],
          },
        },
      });
    });
  });

  describe('parameter validation', () => {
    it('should validate required fields', async () => {
      await expect(tool.execute({} as any)).rejects.toThrow('Invalid parameters');
      await expect(tool.execute({ name: 'Test' } as any)).rejects.toThrow('Invalid parameters');
      await expect(tool.execute({ description: 'Test' } as any)).rejects.toThrow('Invalid parameters');
    });

    it('should validate email format', async () => {
      const input = {
        name: 'Test Feature',
        description: 'Test description',
        owner_email: 'invalid-email',
      } as any;
      await expect(tool.execute(input)).rejects.toThrow('Invalid parameters');
    });

    it('should validate status enum', async () => {
      const input = {
        name: 'Test Feature',
        description: 'Test description',
        status: 'invalid_status',
      } as any;
      await expect(tool.execute(input)).rejects.toThrow('Invalid parameters');
    });

    it('should validate priority enum', async () => {
      const input = {
        name: 'Test Feature',
        description: 'Test description',
        priority: 'invalid_priority',
      } as any;
      await expect(tool.execute(input)).rejects.toThrow('Invalid parameters');
    });

    it('should validate name length', async () => {
      const input = {
        name: 'A'.repeat(256),
        description: 'Test description',
      } as any;
      await expect(tool.execute(input)).rejects.toThrow('Invalid parameters');
    });

    it('should accept valid input', () => {
      const validInput = {
        name: 'User Authentication Feature',
        description: 'Implement OAuth2 authentication for mobile app',
        status: 'new' as const,
        product_id: 'prod_789',
        component_id: 'comp_456',
        owner_email: 'john.doe@example.com',
        tags: ['authentication', 'mobile', 'security'],
        priority: 'high' as const,
      };
      const validation = tool.validateParams(validInput);
      expect(validation.valid).toBe(true);
    });
  });

  describe('execute', () => {
    const parseResult = (result: any) => JSON.parse(result.content[0].text);

    it('should return an error when neither component_id nor product_id is provided', async () => {
      const result = await tool.execute({
        name: 'My Feature',
        description: 'A description',
      });

      expect(parseResult(result)).toEqual({
        success: false,
        error:
          'Feature creation requires a parent. Provide either component_id or product_id. ' +
          'To find the right component, search for an existing feature in the same product area and use its parent.component.id.',
      });

      expect(mockClient.post).not.toHaveBeenCalled();
    });

    it('should proceed when component_id is provided', async () => {
      mockClient.post.mockResolvedValueOnce({ data: { id: 'feat-1' } });

      const result = await tool.execute({
        name: 'My Feature',
        description: 'A description',
        component_id: 'comp-123',
      });

      expect(mockClient.post).toHaveBeenCalled();
      expect(parseResult(result).success).toBe(true);
    });

    it('should proceed when product_id is provided', async () => {
      mockClient.post.mockResolvedValueOnce({ data: { id: 'feat-2' } });

      const result = await tool.execute({
        name: 'My Feature',
        description: 'A description',
        product_id: 'prod-456',
      });

      expect(mockClient.post).toHaveBeenCalled();
      expect(parseResult(result).success).toBe(true);
    });

    it('should create feature with valid input', async () => {
      const validInput = {
        name: 'User Authentication Feature',
        description: 'Implement OAuth2 authentication for mobile app',
        status: 'new' as const,
        product_id: 'prod_789',
        component_id: 'comp_456',
        owner_email: 'john.doe@example.com',
        tags: ['authentication', 'mobile', 'security'],
        priority: 'high' as const,
      };
      const expectedResponse = {
        id: 'feat_123456',
        name: 'User Authentication Feature',
        description: 'Implement OAuth2 authentication for mobile app',
        status: 'new',
        product_id: 'prod_789',
        component_id: 'comp_456',
        owner_email: 'john.doe@example.com',
        tags: ['authentication', 'mobile', 'security'],
        priority: 'high',
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-20T14:30:00Z',
      };
      
      mockClient.post.mockResolvedValueOnce(expectedResponse);

      const result = await tool.execute(validInput);

      expect(mockClient.post).toHaveBeenCalledWith('/features', validInput);
      expect(result).toEqual({
        success: true,
        data: expectedResponse,
      });
    });

    it('should handle API errors gracefully', async () => {
      const validInput = {
        name: 'User Authentication Feature',
        description: 'Implement OAuth2 authentication for mobile app',
      };
      
      mockClient.post.mockRejectedValueOnce(new Error('API Error'));

      const result = await tool.execute(validInput);
      
      expect(result).toEqual({
        success: false,
        error: 'Failed to create feature: API Error',
      });
    });

    it('should handle authentication errors', async () => {
      const validInput = {
        name: 'User Authentication Feature',
        description: 'Implement OAuth2 authentication for mobile app',
      };
      
      const error = new Error('Authentication failed');
      (error as any).response = {
        status: 401,
        data: {
          error: true,
          code: 'AUTH_FAILED',
          message: 'Authentication failed',
          details: {},
        },
      };
      mockClient.post.mockRejectedValueOnce(error);

      const result = await tool.execute(validInput);
      
      expect(result).toEqual({
        success: false,
        error: 'Failed to create feature: Authentication failed',
      });
    });

    it('should handle validation errors from API', async () => {
      const validInput = {
        name: 'User Authentication Feature',
        description: 'Implement OAuth2 authentication for mobile app',
      };
      
      const error = new Error('Validation error');
      (error as any).response = {
        status: 400,
        data: {
          error: true,
          code: 'VALIDATION_ERROR',
          message: 'Invalid input parameters',
          details: {
            fields: {
              name: 'Name is required',
              owner_email: 'Invalid email format',
            },
          },
        },
      };
      mockClient.post.mockRejectedValueOnce(error);

      const result = await tool.execute(validInput);
      
      expect(result).toEqual({
        success: false,
        error: 'Failed to create feature: Validation error',
      });
    });

    it('should throw error if client not initialized', async () => {
      const uninitializedTool = new CreateFeatureTool(null as any, mockLogger);
      const validInput = {
        name: 'User Authentication Feature',
        description: 'Implement OAuth2 authentication for mobile app',
      };
      const result = await uninitializedTool.execute(validInput);
      
      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('Failed to create feature:'),
      });
    });

    it('should set default status to "new" if not provided', async () => {
      const inputWithoutStatus = {
        name: 'User Authentication Feature',
        description: 'Implement OAuth2 authentication for mobile app',
      };
      
      const expectedResponse = {
        id: 'feat_123456',
        name: 'User Authentication Feature',
        description: 'Implement OAuth2 authentication for mobile app',
        status: 'new',
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-20T14:30:00Z',
      };

      mockClient.post.mockResolvedValueOnce(expectedResponse);

      await tool.execute(inputWithoutStatus);

      expect(mockClient.post).toHaveBeenCalledWith('/features', {
        ...inputWithoutStatus,
        status: 'new',
      });
    });
  });

  describe('response transformation', () => {
    it('should transform API response correctly', async () => {
      const apiResponse = {
        id: 'feat_123',
        name: 'Test Feature',
        description: 'Test Description',
        status: 'new',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockClient.post.mockResolvedValueOnce(apiResponse);

      const result = await tool.execute({
        name: 'Test Feature',
        description: 'Test Description',
      });

      expect(result).toEqual({
        success: true,
        data: apiResponse,
      });
      expect((result as any).data).toHaveProperty('id', 'feat_123');
      expect((result as any).data).toHaveProperty('name', 'Test Feature');
      expect((result as any).data).toHaveProperty('created_at');
    });
  });
});