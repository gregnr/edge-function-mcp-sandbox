import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { withMcp } from '@supabase/mcp-server-edge';
import { withSupabase } from '@supabase/server';
import { z } from 'zod/v4';
import type { Database } from './database.types.ts';

Deno.serve(
  withMcp(
    withSupabase<Database>({ auth: 'user' }, async (req, { supabase }) => {
      const wrapError = (error: { code?: string; message: string }, id?: number): Error => {
        switch (error.code) {
          case 'PGRST116': return new Error(id !== undefined ? `Note ${id} not found` : 'Not found');
          default: return new Error(error.message);
        }
      };

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

          if (error) throw wrapError(error);
          return {
            content: [{ type: 'text' as const, text: data.length === 0 ? 'No notes found.' : JSON.stringify(data, null, 2) }],
          };
        },
      );

      server.registerTool(
        'create_note',
        {
          title: 'Create Note',
          description: 'Create a new note',
          inputSchema: z.object({
            title: z.string().describe('Title of the note'),
            content: z.string().optional().describe('Content of the note'),
          }),
          annotations: { readOnlyHint: false, destructiveHint: false },
        },
        async ({ title, content }) => {
          const { data: { user }, error: userError } = await supabase.auth.getUser();
          if (userError ?? !user) throw new Error(userError?.message ?? 'No user');

          const { data, error } = await supabase
            .from('notes')
            .insert({ title, content, user_id: user.id })
            .select()
            .single();

          if (error) throw wrapError(error);
          return {
            content: [{ type: 'text' as const, text: `Created note: ${JSON.stringify(data, null, 2)}` }],
          };
        },
      );

      server.registerTool(
        'get_note',
        {
          title: 'Get Note',
          description: 'Get a specific note by ID',
          inputSchema: z.object({ id: z.int().describe('ID of the note to retrieve') }),
          annotations: { readOnlyHint: true },
        },
        async ({ id }) => {
          const { data, error } = await supabase.from('notes').select('*').eq('id', id).single();
          if (error) throw wrapError(error, id);
          return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
        },
      );

      server.registerTool(
        'update_note',
        {
          title: 'Update Note',
          description: 'Update an existing note',
          inputSchema: z.object({
            id: z.number().int().describe('ID of the note to update'),
            title: z.string().optional().describe('New title for the note'),
            content: z.string().optional().describe('New content for the note'),
          }),
          annotations: { readOnlyHint: false, destructiveHint: false },
        },
        async ({ id, title, content }) => {
          const updates: Database['public']['Tables']['notes']['Update'] = {
            updated_at: new Date().toISOString(),
            ...(title !== undefined && { title }),
            ...(content !== undefined && { content }),
          };

          const { data, error } = await supabase
            .from('notes')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

          if (error) throw wrapError(error, id);
          return {
            content: [{ type: 'text' as const, text: `Updated note: ${JSON.stringify(data, null, 2)}` }],
          };
        },
      );

      server.registerTool(
        'delete_note',
        {
          title: 'Delete Note',
          description: 'Delete a note by ID',
          inputSchema: z.object({ id: z.number().int().describe('ID of the note to delete') }),
          annotations: { readOnlyHint: false, destructiveHint: true },
        },
        async ({ id }) => {
          const { error } = await supabase.from('notes').delete().eq('id', id).select('id').single();
          if (error) throw wrapError(error, id);
          return { content: [{ type: 'text' as const, text: `Deleted note ${id}` }] };
        },
      );

      const transport = new WebStandardStreamableHTTPServerTransport();
      await server.connect(transport);
      return transport.handleRequest(req);
    }),
  ),
);
