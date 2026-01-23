// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { Hono } from "npm:hono";
import * as z from "npm:zod/v4";
import { McpServer } from "npm:@modelcontextprotocol/sdk@1.25.1/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "npm:@modelcontextprotocol/sdk@1.25.1/server/webStandardStreamableHttp.js";
import type { CallToolResult } from "npm:@modelcontextprotocol/sdk@1.25.1/types.js";
import type { RequestHandlerExtra } from "npm:@modelcontextprotocol/sdk@1.25.1/shared/protocol.js";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "npm:jose@5";
import { createClient } from "npm:@supabase/supabase-js@2";

const app = new Hono();

// Log all requests (including unmatched routes)
app.use("*", async (c, next) => {
  console.log(`[${c.req.method}] ${c.req.url}`);
  await next();
});

// Environment
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variable");
}

// Create JWKS keyset once at module load (jose handles internal caching/refresh)
const jwks = createRemoteJWKSet(
  new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
);

// Helper to create a Supabase client with user's token
function createUserClient(token: string) {
  return createClient(supabaseUrl!, supabaseAnonKey!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

// Helper to get token from extra
function getToken(extra: RequestHandlerExtra<never, never>): string {
  const token = extra.authInfo?.token;
  if (!token) {
    throw new Error("No auth token available");
  }
  return token;
}

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
  },
  async (_args, extra): Promise<CallToolResult> => {
    const supabase = createUserClient(getToken(extra));
    const { data, error } = await supabase
      .from("notes")
      .select("id, title, content, created_at, updated_at")
      .order("updated_at", { ascending: false });

    if (error) {
      return {
        content: [{ type: "text", text: `Error listing notes: ${error.message}` }],
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
  },
  async ({ title, content }, extra): Promise<CallToolResult> => {
    const supabase = createUserClient(getToken(extra));

    // Get user ID from token
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError ?? !user) {
      return {
        content: [{ type: "text", text: `Error getting user: ${userError?.message ?? "No user"}` }],
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
        content: [{ type: "text", text: `Error creating note: ${error.message}` }],
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
        content: [{ type: "text", text: `Error getting note: ${error.message}` }],
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
  },
  async ({ id, title, content }, extra): Promise<CallToolResult> => {
    const supabase = createUserClient(getToken(extra));

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
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
        content: [{ type: "text", text: `Error updating note: ${error.message}` }],
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
  },
  async ({ id }, extra): Promise<CallToolResult> => {
    const supabase = createUserClient(getToken(extra));
    const { error } = await supabase
      .from("notes")
      .delete()
      .eq("id", id);

    if (error) {
      return {
        content: [{ type: "text", text: `Error deleting note: ${error.message}` }],
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

// ============ URL Helpers ============

/**
 * Constructs the base URL from the request, considering X-Forwarded headers if present
 */
function getBaseUrl(
  c: { req: { url: string; header: (name: string) => string | undefined } },
): string {
  const url = new URL(c.req.url);
  const host = c.req.header("X-Forwarded-Host") ?? url.host;
  const proto = c.req.header("X-Forwarded-Proto") ??
    url.protocol.replace(":", "");
  const port = c.req.header("X-Forwarded-Port") ?? url.port;

  // Only include port if non-standard (not 80 for http, not 443 for https)
  const isStandardPort = (proto === "https" && port === "443") ||
    (proto === "http" && port === "80");

  const portSuffix = port && !isStandardPort ? `:${port}` : "";

  return `${proto}://${host}${portSuffix}`;
}

/**
 * Builds the full URL to the OAuth 2.0 Protected Resource Metadata endpoint
 */
function getResourceMetadataUrl(
  c: { req: { url: string; header: (name: string) => string | undefined } },
): string {
  return `${getBaseUrl(c)}/functions/v1/mcp/oauth-protected-resource`;
}

// ============ Routes ============

// Debug endpoint to inspect request URL and headers
app.get("/mcp/debug", (c) => {
  const xForwardedHeaders: Record<string, string | undefined> = {
    "X-Forwarded-Host": c.req.header("X-Forwarded-Host"),
    "X-Forwarded-Proto": c.req.header("X-Forwarded-Proto"),
    "X-Forwarded-Port": c.req.header("X-Forwarded-Port"),
    "X-Forwarded-Prefix": c.req.header("X-Forwarded-Prefix"),
    "X-Forwarded-For": c.req.header("X-Forwarded-For"),
  };

  return c.json({
    url: c.req.url,
    path: c.req.path,
    computed: {
      baseUrl: getBaseUrl(c),
      resourceMetadataUrl: getResourceMetadataUrl(c),
    },
    xForwardedHeaders,
  });
});

// OAuth 2.0 Protected Resource Metadata (RFC 9728)
// This endpoint advertises authorization server info to clients
app.get("/mcp/oauth-protected-resource", (c) => {
  console.log(
    "Received request for OAuth 2.0 Protected Resource Metadata",
    c.req.header("User-Agent"),
  );

  return c.json({
    resource: `${getBaseUrl(c)}/functions/v1/mcp`, // This must match the MCP endpoint according to the spec
    authorization_servers: [`${getBaseUrl(c)}/auth/v1`],
    bearer_methods_supported: ["header"],
  });
});

// Handle MCP requests at the root path
app.all("/mcp", async (c) => {
  console.log("Received MCP request", c.req.path);
  const authHeader = c.req.header("Authorization");

  // Validate authorization - return 401 with WWW-Authenticate if missing/invalid
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer resource_metadata="${
          getResourceMetadataUrl(c)
        }"`,
      },
    });
  }

  const token = authHeader.replace("Bearer ", "");

  const payload = await validateToken(token);
  if (!payload) {
    console.error("Invalid token provided");
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer resource_metadata="${
          getResourceMetadataUrl(c)
        }"`,
      },
    });
  }

  console.log("Token validated successfully for user:", payload.email);

  const transport = new WebStandardStreamableHTTPServerTransport();
  await server.connect(transport);

  // Pass authInfo to transport so tools can access the token
  return transport.handleRequest(c.req.raw, {
    authInfo: {
      token,
      clientId: payload.sub ?? "",
      scopes: [],
    },
  });
});

// ============ Token Validation ============

// Validate token using JWKS verification, returns payload if valid
async function validateToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwks);

    // Check token hasn't expired (jose does this, but be explicit)
    if (payload.exp && payload.exp < Date.now() / 1000) {
      console.error("Token expired");
      return null;
    }

    return payload;
  } catch (error) {
    console.error(
      "Token validation error:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

Deno.serve(app.fetch);
