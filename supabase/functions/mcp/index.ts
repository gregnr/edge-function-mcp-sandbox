// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { Hono } from "npm:hono";
import * as z from "npm:zod/v4";
import { McpServer } from "npm:@modelcontextprotocol/sdk@1.25.1/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "npm:@modelcontextprotocol/sdk@1.25.1/server/webStandardStreamableHttp.js";
import type { CallToolResult } from "npm:@modelcontextprotocol/sdk@1.25.1/types.js";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

const app = new Hono();

// Log all requests (including unmatched routes)
app.use("*", async (c, next) => {
  console.log(`[${c.req.method}] ${c.req.url}`);
  await next();
});

const server = new McpServer({
  name: "sample-mcp",
  version: "0.1.0",
});

// Register a simple greeting tool
server.registerTool(
  "greet",
  {
    title: "Greeting Tool",
    description: "A simple greeting tool",
    inputSchema: { name: z.string().describe("Name to greet") },
  },
  ({ name }): CallToolResult => {
    return {
      content: [{
        type: "text",
        text: `Hello, ${name}! (from Hono + WebStandard transport)`,
      }],
    };
  },
);

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

  const isValidToken = await validateToken(token);
  if (!isValidToken) {
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

  console.log("Token validated successfully");

  const transport = new WebStandardStreamableHTTPServerTransport();
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

// Create JWKS keyset once at module load (jose handles internal caching/refresh)
const supabaseUrl = Deno.env.get("SUPABASE_URL");
if (!supabaseUrl) {
  throw new Error("Missing SUPABASE_URL environment variable");
}
const jwks = createRemoteJWKSet(
  new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
);

// Validate token using JWKS verification
async function validateToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, jwks);

    // Check token hasn't expired (jose does this, but be explicit)
    if (payload.exp && payload.exp < Date.now() / 1000) {
      console.error("Token expired");
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "Token validation error:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

Deno.serve(app.fetch);
