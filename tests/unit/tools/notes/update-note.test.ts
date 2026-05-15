import { UpdateNoteTool } from '@tools/notes/update-note';
import { ProductboardAPIClient } from '@api/index';
import { Logger } from '@utils/logger';

describe('UpdateNoteTool', () => {
  let tool: UpdateNoteTool;
  let mockApiClient: jest.Mocked<ProductboardAPIClient>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockApiClient = {
      makeRequest: jest.fn(),
      post: jest.fn(),
      get: jest.fn(),
      put: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
    } as any;

    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    } as any;

    tool = new UpdateNoteTool(mockApiClient, mockLogger);
  });

  describe('constructor', () => {
    it('should initialize with correct name and description', () => {
      expect(tool.name).toBe('pb_note_update');
      expect(tool.description).toBe(
        'Update a Productboard note — change owner, name, tags, archived, or processed state'
      );
    });

    it('should define correct parameters schema', () => {
      expect(tool.parameters).toMatchObject({
        type: 'object',
        required: ['note_id'],
        properties: {
          note_id: { type: 'string' },
          owner_email: { type: 'string', format: 'email' },
          name: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          archived: { type: 'boolean' },
          processed: { type: 'boolean' },
        },
      });
    });
  });

  describe('execute', () => {
    const NOTE_ID = 'note-abc-123';

    const mockPatchResponse = {
      data: {
        id: NOTE_ID,
        type: 'textNote',
        links: { self: `https://api.productboard.com/v2/notes/${NOTE_ID}` },
      },
    };

    const parseResult = (result: any) => JSON.parse(result.content[0].text);

    it('should update owner using flat email format (not set wrapper)', async () => {
      mockApiClient.patch.mockResolvedValue(mockPatchResponse);

      const result = await tool.execute({
        note_id: NOTE_ID,
        owner_email: 'leemoman@unifyr.com',
      });

      expect(mockApiClient.patch).toHaveBeenCalledWith(`/v2/notes/${NOTE_ID}`, {
        data: {
          fields: {
            owner: { email: 'leemoman@unifyr.com' },
          },
        },
      });

      expect(parseResult(result)).toEqual({
        success: true,
        data: {
          note_id: NOTE_ID,
          updated_fields: ['owner'],
          note: mockPatchResponse.data,
        },
      });
    });

    it('should update name as a plain string (not set wrapper)', async () => {
      mockApiClient.patch.mockResolvedValue(mockPatchResponse);

      await tool.execute({ note_id: NOTE_ID, name: 'New title' });

      expect(mockApiClient.patch).toHaveBeenCalledWith(`/v2/notes/${NOTE_ID}`, {
        data: { fields: { name: 'New title' } },
      });
    });

    it('should map tags from string array to [{name}] objects', async () => {
      mockApiClient.patch.mockResolvedValue(mockPatchResponse);

      await tool.execute({ note_id: NOTE_ID, tags: ['auto-assigned', 'bug'] });

      expect(mockApiClient.patch).toHaveBeenCalledWith(`/v2/notes/${NOTE_ID}`, {
        data: {
          fields: {
            tags: [{ name: 'auto-assigned' }, { name: 'bug' }],
          },
        },
      });
    });

    it('should update archived as a plain boolean (not set wrapper)', async () => {
      mockApiClient.patch.mockResolvedValue(mockPatchResponse);

      await tool.execute({ note_id: NOTE_ID, archived: true });

      expect(mockApiClient.patch).toHaveBeenCalledWith(`/v2/notes/${NOTE_ID}`, {
        data: { fields: { archived: true } },
      });
    });

    it('should update processed as a plain boolean (not set wrapper)', async () => {
      mockApiClient.patch.mockResolvedValue(mockPatchResponse);

      await tool.execute({ note_id: NOTE_ID, processed: false });

      expect(mockApiClient.patch).toHaveBeenCalledWith(`/v2/notes/${NOTE_ID}`, {
        data: { fields: { processed: false } },
      });
    });

    it('should send only the fields that were provided', async () => {
      mockApiClient.patch.mockResolvedValue(mockPatchResponse);

      await tool.execute({ note_id: NOTE_ID, name: 'Title only' });

      const call = mockApiClient.patch.mock.calls[0][1] as any;
      expect(Object.keys(call.data.fields)).toEqual(['name']);
    });

    it('should update multiple fields in a single call', async () => {
      mockApiClient.patch.mockResolvedValue(mockPatchResponse);

      const result = await tool.execute({
        note_id: NOTE_ID,
        owner_email: 'leemoman@unifyr.com',
        name: 'Updated title',
        processed: true,
      });

      expect(mockApiClient.patch).toHaveBeenCalledWith(`/v2/notes/${NOTE_ID}`, {
        data: {
          fields: {
            owner: { email: 'leemoman@unifyr.com' },
            name: 'Updated title',
            processed: true,
          },
        },
      });

      expect(parseResult(result).data.updated_fields).toEqual(
        expect.arrayContaining(['owner', 'name', 'processed'])
      );
    });

    it('should use response.data as the note when present', async () => {
      const noteData = { id: NOTE_ID, type: 'textNote' };
      mockApiClient.patch.mockResolvedValue({ data: noteData });

      const result = await tool.execute({ note_id: NOTE_ID, processed: true });

      expect(parseResult(result).data.note).toEqual(noteData);
    });

    it('should fall back to the raw response when data property is absent', async () => {
      const rawResponse = { id: NOTE_ID };
      mockApiClient.patch.mockResolvedValue(rawResponse);

      const result = await tool.execute({ note_id: NOTE_ID, processed: true });

      expect(parseResult(result).data.note).toEqual(rawResponse);
    });

    it('should return an error when no update fields are provided', async () => {
      const result = await tool.execute({ note_id: NOTE_ID });

      expect(parseResult(result)).toEqual({
        success: false,
        error: 'No fields provided to update',
      });

      expect(mockApiClient.patch).not.toHaveBeenCalled();
    });

    it('should validate that note_id is required', async () => {
      await expect(tool.execute({} as any)).rejects.toThrow('Invalid parameters');
    });

    it('should validate email format for owner_email', async () => {
      await expect(
        tool.execute({ note_id: NOTE_ID, owner_email: 'not-an-email' })
      ).rejects.toThrow('Invalid parameters');
    });

    it('should handle API errors gracefully', async () => {
      mockApiClient.patch.mockRejectedValue(new Error('Note not found'));

      const result = await tool.execute({ note_id: NOTE_ID, archived: true });

      expect(parseResult(result)).toEqual({
        success: false,
        error: 'Failed to update note: Note not found',
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to update note',
        expect.any(Error)
      );
    });
  });
});
