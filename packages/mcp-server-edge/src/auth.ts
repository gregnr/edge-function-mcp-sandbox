import { createSupabaseClient } from './supabase.js';
import {
  getAuthUrl,
  getMcpEndpointUrl,
  getResourceMetadataUrl,
} from './url.js';
import type {
  AuthResult,
  OAuthMetadataOptions,
  UnauthorizedResponseOptions,
} from './types.js';

/**
 * Extract Bearer token from request, validate via supabase.auth.getClaims().
 * Returns authed context with pre-built Supabase client, or null.
 */
export async function authenticate(req: Request): Promise<AuthResult | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);

  const anonClient = createSupabaseClient(token);
  const { data, error } = await anonClient.auth.getClaims(token);

  if (error || !data) {
    console.error(
      'Token validation error:',
      error?.message ?? 'No claims data',
    );
    return null;
  }

  const supabase = createSupabaseClient(token);

  return {
    token,
    claims: data.claims as Record<string, unknown>,
    supabase,
  };
}

/**
 * 401 response with WWW-Authenticate: Bearer resource_metadata="..." (RFC 9728).
 *
 * Default: auto-constructs the metadata URL by detecting the function name from
 * the request path (first segment) and reconstructing the external URL:
 *   {X-Forwarded origin}/functions/v1/{function-name}/oauth-protected-resource
 *
 * Pass resourceMetadataUrl as an absolute URL to override for custom setups.
 */
export function unauthorizedResponse(
  req: Request,
  options?: UnauthorizedResponseOptions,
): Response {
  const metadataUrl =
    options?.resourceMetadataUrl ?? getResourceMetadataUrl(req);

  console.log(
    'Unauthorized request. Responding with 401 and WWW-Authenticate header:',
    {
      'WWW-Authenticate': `Bearer resource_metadata="${metadataUrl}"`,
    },
  );

  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate': `Bearer resource_metadata="${metadataUrl}"`,
    },
  });
}

/**
 * OAuth Protected Resource Metadata response (RFC 9728).
 * Advertises authorization server, resource URI, bearer methods.
 */
export function oauthMetadata(
  req: Request,
  options?: OAuthMetadataOptions,
): Response {
  const resource = options?.resource ?? getMcpEndpointUrl(req);
  const authorizationServers = options?.authorizationServers ?? [
    getAuthUrl(req),
  ];

  return new Response(
    JSON.stringify({
      resource,
      authorization_servers: authorizationServers,
      bearer_methods_supported: ['header'],
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}
