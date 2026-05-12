// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import * as z from "npm:zod/v4";
import { McpServer } from "npm:@modelcontextprotocol/sdk@1.27.1/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "npm:@modelcontextprotocol/sdk@1.27.1/server/webStandardStreamableHttp.js";
import type { CallToolResult } from "npm:@modelcontextprotocol/sdk@1.27.1/types.js";
import type { RequestHandlerExtra } from "npm:@modelcontextprotocol/sdk@1.27.1/shared/protocol.js";
import { createContextClient, verifyAuth } from "npm:@supabase/server@1.0.0/core";

// The edge runtime injects SUPABASE_URL and SUPABASE_ANON_KEY but not the
// SUPABASE_PUBLISHABLE_KEY / SUPABASE_JWKS vars that @supabase/server expects.
// We bridge both gaps with explicit env overrides passed to verifyAuth/createContextClient.
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const publishableKeys = { default: anonKey };

// Both JWKS and the canonical issuer are fetched from the auth server's
// well-known metadata at cold start and cached in memory. Fetching the issuer
// from metadata (not from SUPABASE_URL directly) ensures we get the externally-
// visible URL, which matches the iss claim in JWTs even in local Docker setups
// where SUPABASE_URL is an internal hostname (http://kong:8000).
let jwksCache: { keys: JsonWebKey[] } | null = null;
let issuerCache: string | null = null;

async function warmAuthCache(): Promise<void> {
  if (jwksCache && issuerCache) return;
  try {
    const [jwksRes, metaRes] = await Promise.all([
      fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
      fetch(`${supabaseUrl}/auth/v1/.well-known/oauth-authorization-server`),
    ]);
    jwksCache = await jwksRes.json() as { keys: JsonWebKey[] };
    issuerCache = ((await metaRes.json()) as { issuer?: string }).issuer ?? null;
  } catch (err) {
    console.error("Failed to fetch auth server metadata:", err);
  }
}

// Helper to create a user-scoped Supabase client from a token
function createUserClient(token: string) {
  return createContextClient({ auth: { token }, env: { publishableKeys } });
}

// Helper to get token from MCP request extra
function getToken(extra: RequestHandlerExtra<never, never>): string {
  const token = extra.authInfo?.token;
  if (!token) {
    throw new Error("No auth token available");
  }
  return token;
}

function createMcpServer() {
  const server = new McpServer({
    name: "notes-mcp",
    version: "0.1.0",
  });

  // ============ Notes Tools ============

  server.registerTool(
    "list_notes",
    {
      title: "List Notes",
      description: "List all notes for the authenticated user",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
      },
    },
    async (_, extra): Promise<CallToolResult> => {
      const supabase = createUserClient(getToken(extra));
      const { data, error } = await supabase
        .from("notes")
        .select("id, title, content, created_at, updated_at")
        .order("updated_at", { ascending: false });

      if (error) {
        return {
          content: [{
            type: "text",
            text: `Error listing notes: ${error.message}`,
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text",
          text: data.length === 0
            ? "No notes found."
            : JSON.stringify(data, null, 2),
        }],
      };
    },
  );

  server.registerTool(
    "create_note",
    {
      title: "Create Note",
      description: "Create a new note",
      inputSchema: {
        title: z.string().describe("Title of the note"),
        content: z.string().optional().describe("Content of the note"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ title, content }, extra): Promise<CallToolResult> => {
      const supabase = createUserClient(getToken(extra));

      const { data: { user }, error: userError } = await supabase.auth
        .getUser();
      if (userError ?? !user) {
        return {
          content: [{
            type: "text",
            text: `Error getting user: ${userError?.message ?? "No user"}`,
          }],
          isError: true,
        };
      }

      const { data, error } = await supabase
        .from("notes")
        .insert({ title, content, user_id: user.id })
        .select()
        .single();

      if (error) {
        return {
          content: [{
            type: "text",
            text: `Error creating note: ${error.message}`,
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text",
          text: `Created note: ${JSON.stringify(data, null, 2)}`,
        }],
      };
    },
  );

  server.registerTool(
    "get_note",
    {
      title: "Get Note",
      description: "Get a specific note by ID",
      inputSchema: {
        id: z.number().int().describe("ID of the note to retrieve"),
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ id }, extra): Promise<CallToolResult> => {
      const supabase = createUserClient(getToken(extra));
      const { data, error } = await supabase
        .from("notes")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        return {
          content: [{
            type: "text",
            text: `Error getting note: ${error.message}`,
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify(data, null, 2),
        }],
      };
    },
  );

  server.registerTool(
    "update_note",
    {
      title: "Update Note",
      description: "Update an existing note",
      inputSchema: {
        id: z.number().int().describe("ID of the note to update"),
        title: z.string().optional().describe("New title for the note"),
        content: z.string().optional().describe("New content for the note"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ id, title, content }, extra): Promise<CallToolResult> => {
      const supabase = createUserClient(getToken(extra));

      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (title !== undefined) updates.title = title;
      if (content !== undefined) updates.content = content;

      const { data, error } = await supabase
        .from("notes")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return {
          content: [{
            type: "text",
            text: `Error updating note: ${error.message}`,
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text",
          text: `Updated note: ${JSON.stringify(data, null, 2)}`,
        }],
      };
    },
  );

  server.registerTool(
    "delete_note",
    {
      title: "Delete Note",
      description: "Delete a note by ID",
      inputSchema: {
        id: z.number().int().describe("ID of the note to delete"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
      },
    },
    async ({ id }, extra): Promise<CallToolResult> => {
      const supabase = createUserClient(getToken(extra));
      const { error } = await supabase
        .from("notes")
        .delete()
        .eq("id", id);

      if (error) {
        return {
          content: [{
            type: "text",
            text: `Error deleting note: ${error.message}`,
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text",
          text: `Deleted note ${id}`,
        }],
      };
    },
  );

  return server;
}

// ============ URL Helpers ============

function getBaseUrl(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get("X-Forwarded-Host") ?? url.host;
  const proto = req.headers.get("X-Forwarded-Proto") ?? url.protocol.replace(":", "");
  const port = req.headers.get("X-Forwarded-Port") ?? url.port;

  const isStandardPort = (proto === "https" && port === "443") ||
    (proto === "http" && port === "80");
  const portSuffix = port && !isStandardPort ? `:${port}` : "";

  return `${proto}://${host}${portSuffix}`;
}

function getResourceMetadataUrl(req: Request): string {
  return `${getBaseUrl(req)}/functions/v1/mcp/oauth-protected-resource`;
}

// ============ Request Handler ============

export default {
  fetch: async (req: Request): Promise<Response> => {
    const url = new URL(req.url);

    // Debug endpoint to inspect request URL and headers
    if (url.pathname === "/mcp/debug") {
      return Response.json({
        url: req.url,
        pathname: url.pathname,
        env: { supabaseUrl },
        computed: {
          baseUrl: getBaseUrl(req),
          resourceMetadataUrl: getResourceMetadataUrl(req),
        },
        xForwardedHeaders: {
          "X-Forwarded-Host": req.headers.get("X-Forwarded-Host"),
          "X-Forwarded-Proto": req.headers.get("X-Forwarded-Proto"),
          "X-Forwarded-Port": req.headers.get("X-Forwarded-Port"),
          "X-Forwarded-Prefix": req.headers.get("X-Forwarded-Prefix"),
          "X-Forwarded-For": req.headers.get("X-Forwarded-For"),
        },
      });
    }

    // OAuth 2.0 Protected Resource Metadata (RFC 9728)
    if (url.pathname === "/mcp/oauth-protected-resource") {
      return Response.json({
        resource: `${getBaseUrl(req)}/functions/v1/mcp`,
        authorization_servers: [`${getBaseUrl(req)}/auth/v1`],
        bearer_methods_supported: ["header"],
      });
    }

    if (url.pathname === "/mcp") {
      await warmAuthCache();
      const { data: auth, error } = await verifyAuth(req, { auth: "user", env: { jwks: jwksCache, publishableKeys } });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: error.status,
          headers: {
            "Content-Type": "application/json",
            ...(error.status === 401 && {
              "WWW-Authenticate": `Bearer resource_metadata="${getResourceMetadataUrl(req)}"`,
            }),
          },
        });
      }

      // Validate issuer: ensures the token was issued by this project's auth server.
      // Supabase Auth doesn't support RFC 8707 resource indicators, so aud is always
      // "authenticated" — we can't validate audience against the MCP server URL.
      // Issuer validation is the strongest check available without changes to @supabase/server.
      const expectedIssuer = issuerCache;
      if (expectedIssuer && auth.jwtClaims?.iss !== expectedIssuer) {
        return new Response(JSON.stringify({ error: "Invalid token issuer" }), {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            "WWW-Authenticate": `Bearer resource_metadata="${getResourceMetadataUrl(req)}"`,
          },
        });
      }

      console.log("Authenticated MCP request for user:", auth.userClaims?.id);

      const server = createMcpServer();
      const transport = new WebStandardStreamableHTTPServerTransport();
      await server.connect(transport);

      return transport.handleRequest(req, {
        authInfo: {
          token: auth.token!,
          clientId: auth.userClaims?.id ?? "",
          scopes: [],
        },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};
