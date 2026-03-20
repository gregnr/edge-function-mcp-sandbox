import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import { createMcpHandler } from '@supabase/mcp-server-edge';

console.log('got here');

const mcp = createMcpHandler(({ supabase }) => {
  console.log('Creating MCP handler with authenticated Supabase client');
  const server = new McpServer({ name: 'notes-mcp', version: '0.1.0' });

  server.registerTool(
    'list_notes',
    {
      title: 'List Notes',
      description: 'List all notes for the authenticated user',
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { data, error } = await supabase
        .from('notes')
        .select('id, title, content, created_at, updated_at')
        .order('updated_at', { ascending: false });

      if (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error listing notes: ${error.message}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text:
              data.length === 0
                ? 'No notes found.'
                : JSON.stringify(data, null, 2),
          },
        ],
      };
    },
  );

  server.registerTool(
    'create_note',
    {
      title: 'Create Note',
      description: 'Create a new note',
      inputSchema: {
        title: z.string().describe('Title of the note'),
        content: z.string().optional().describe('Content of the note'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ title, content }) => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError ?? !user) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error getting user: ${userError?.message ?? 'No user'}`,
            },
          ],
          isError: true,
        };
      }

      const { data, error } = await supabase
        .from('notes')
        .insert({ title, content, user_id: user.id })
        .select()
        .single();

      if (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error creating note: ${error.message}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: `Created note: ${JSON.stringify(data, null, 2)}`,
          },
        ],
      };
    },
  );

  server.registerTool(
    'get_note',
    {
      title: 'Get Note',
      description: 'Get a specific note by ID',
      inputSchema: {
        id: z.number().int().describe('ID of the note to retrieve'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error getting note: ${error.message}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    },
  );

  server.registerTool(
    'update_note',
    {
      title: 'Update Note',
      description: 'Update an existing note',
      inputSchema: {
        id: z.number().int().describe('ID of the note to update'),
        title: z.string().optional().describe('New title for the note'),
        content: z.string().optional().describe('New content for the note'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ id, title, content }) => {
      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (title !== undefined) updates.title = title;
      if (content !== undefined) updates.content = content;

      const { data, error } = await supabase
        .from('notes')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error updating note: ${error.message}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: `Updated note: ${JSON.stringify(data, null, 2)}`,
          },
        ],
      };
    },
  );

  server.registerTool(
    'delete_note',
    {
      title: 'Delete Note',
      description: 'Delete a note by ID',
      inputSchema: {
        id: z.number().int().describe('ID of the note to delete'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ id }) => {
      const { error } = await supabase.from('notes').delete().eq('id', id);

      if (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error deleting note: ${error.message}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [{ type: 'text' as const, text: `Deleted note ${id}` }],
      };
    },
  );

  return server;
});

Deno.serve(mcp.fetch);
