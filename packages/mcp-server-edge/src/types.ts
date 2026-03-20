import type { SupabaseClient } from "@supabase/supabase-js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Context passed to the factory function on each request.
 */
export interface McpContext {
  /** Supabase client pre-authed with the current user's JWT. RLS applies. */
  supabase: SupabaseClient;
  /** The original incoming request. */
  request: Request;
}

/**
 * Factory function called per request. Receives request-scoped context,
 * returns a configured McpServer.
 */
export type McpFactory = (context: McpContext) => McpServer;

/**
 * The return type of createMcpHandler.
 */
export interface McpHandler {
  /** Handle incoming requests. Pass to Deno.serve(). */
  fetch: (req: Request) => Promise<Response>;
}

/**
 * Options for unauthorizedResponse.
 */
export interface UnauthorizedResponseOptions {
  /** Absolute URL override for the resource metadata endpoint. */
  resourceMetadataUrl?: string;
}

/**
 * Options for oauthMetadata.
 */
export interface OAuthMetadataOptions {
  /** Override the resource URI. */
  resource?: string;
  /** Override the authorization servers list. */
  authorizationServers?: string[];
}

/**
 * Result of a successful authenticate() call.
 */
export interface AuthResult {
  /** The raw bearer token. */
  token: string;
  /** Validated JWT claims (sub, email, role, aal, session_id, etc.). */
  claims: Record<string, unknown>;
  /** Supabase client pre-authed with the user's token. */
  supabase: SupabaseClient;
}
