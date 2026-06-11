import { resourceMetadataResponse } from './auth.js';
import { getResourceMetadataUrl, inferFunctionName } from './url.js';

/**
 * Wraps a request handler with MCP protocol logic for Supabase Edge Functions.
 * Bring your own MCP library (e.g. `@modelcontextprotocol/sdk`) and auth middleware (e.g. `@supabase/server`).
 *
 * - Serves RFC 9728 OAuth Protected Resource Metadata at `GET /{fn}/oauth-protected-resource`
 * - Enriches any 401 from the inner handler with `WWW-Authenticate: Bearer resource_metadata="..."`
 * - Returns 405 for `GET /{fn}` and `DELETE /{fn}` after auth passes (SSE/sessions not supported in stateless functions)
 * - Returns 404 for all other paths
 *
 * @example
 * ```typescript
 * import { withMcp } from '@supabase/mcp-server-edge';
 * import { withSupabase } from '@supabase/server';
 * import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
 * import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
 *
 * Deno.serve(
 *   withMcp(
 *     withSupabase({ auth: 'user' }, async (req, { supabase }) => {
 *       const server = new McpServer({ name: 'my-mcp', version: '0.1.0' });
 *
 *       server.registerTool(
 *         'list_items',
 *         { description: 'List items for the current user', annotations: { readOnlyHint: true } },
 *         async () => {
 *           const { data, error } = await supabase.from('items').select('*');
 *           if (error) throw error;
 *           return { content: [{ type: 'text', text: JSON.stringify(data) }] };
 *         },
 *       );
 *
 *       const transport = new WebStandardStreamableHTTPServerTransport();
 *       await server.connect(transport);
 *       return transport.handleRequest(req);
 *     })
 *   )
 * );
 * ```
 */
export function withMcp(
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const fn = inferFunctionName(req);
    if (!fn) return new Response('Not Found', { status: 404 });
    const basePath = `/${fn}`;

    // RFC 9728 — OAuth Protected Resource Metadata
    if (req.method === 'GET' && url.pathname === `${basePath}/oauth-protected-resource`) {
      return resourceMetadataResponse(req);
    }

    if (url.pathname !== basePath) {
      return new Response('Not Found', { status: 404 });
    }

    const response = await handler(req);

    // Enrich any 401 with WWW-Authenticate so MCP clients can discover the auth server
    if (response.status === 401) {
      const headers = new Headers(response.headers);
      headers.set('WWW-Authenticate', `Bearer resource_metadata="${getResourceMetadataUrl(req)}"`);
      return new Response(response.body, { status: 401, statusText: response.statusText, headers });
    }

    // After auth passes, only POST is supported. OPTIONS passes through for CORS preflight.
    // Stateless edge functions can't support GET (SSE streams) or DELETE (session management),
    // and no other methods are defined by the MCP spec.
    if (req.method !== 'POST' && req.method !== 'OPTIONS') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { Allow: 'POST' },
      });
    }

    return response;
  };
}
