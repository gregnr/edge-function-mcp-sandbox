import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { authenticate, oauthMetadata, unauthorizedResponse } from './auth.js';
import { createSupabaseClient } from './supabase.js';
import { inferFunctionName } from './url.js';
import type { McpFactory, McpHandler } from './types.js';

/**
 * Creates an MCP handler for Supabase Edge Functions.
 *
 * Returns a `.fetch` handler that you pass to `Deno.serve()`.
 * Handles HTTP routing, JWT validation via supabase.auth.getClaims(), OAuth Protected
 * Resource Metadata (RFC 9728), and per-request MCP server+transport lifecycle.
 *
 * The factory function is called per request with a request-scoped context containing
 * a pre-authed Supabase client.
 *
 * @example
 * ```typescript
 * import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
 * import { createMcpHandler } from "@supabase/mcp-server-edge";
 *
 * const mcp = createMcpHandler(({ supabase }) => {
 *   const server = new McpServer({ name: "my-mcp", version: "0.1.0" });
 *   server.registerTool("list_items", { ... }, async () => {
 *     const { data } = await supabase.from("items").select("*");
 *     return { content: [{ type: "text", text: JSON.stringify(data) }] };
 *   });
 *   return server;
 * });
 *
 * Deno.serve(mcp.fetch);
 * ```
 */
export function createMcpHandler(factory: McpFactory): McpHandler {
  console.log('Creating MCP handler');
  async function fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const basePath = `/${inferFunctionName(req)}`;

    console.log(`Received request: ${req.method} ${url.pathname}`);
    console.log('Base path:', basePath);

    // OAuth Protected Resource Metadata (RFC 9728)
    if (
      req.method === 'GET' &&
      url.pathname === `${basePath}/oauth-protected-resource`
    ) {
      return oauthMetadata(req, {
        authorizationServers: ['http://127.0.0.1:54321/auth/v1'],
      });
    }

    // Main MCP endpoint
    if (url.pathname === basePath) {
      return handleMcpRequest(req, factory);
    }

    return new Response('Not Found', { status: 404 });
  }

  return { fetch };
}

async function handleMcpRequest(
  req: Request,
  factory: McpFactory,
): Promise<Response> {
  console.log('Handling MCP request:', req.method, req.url);
  // Validate auth
  const authResult = await authenticate(req);
  if (!authResult) {
    return unauthorizedResponse(req);
  }
  const { token, claims } = authResult;

  // Stateless transport: no SSE stream (GET) or session management (DELETE).
  // Per MCP spec 2025-03-26, GET MUST return 405 if SSE is not supported.
  if (req.method === 'GET' || req.method === 'DELETE') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'POST' },
    });
  }

  try {
    // Create request-scoped Supabase client
    const supabase = createSupabaseClient(token);

    // Call user's factory with request-scoped context
    const server = factory({ supabase, request: req });

    // Create transport and handle request
    const transport = new WebStandardStreamableHTTPServerTransport();
    await server.connect(transport);

    return transport.handleRequest(req, {
      authInfo: {
        token,
        clientId: (claims.sub as string) ?? '',
        scopes: typeof claims.scope === 'string' ? claims.scope.split(' ') : [],
      },
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('MCP request error:', err.message);
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}
