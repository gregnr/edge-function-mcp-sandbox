const pathPrefix = '';
// const pathPrefix = '/functions/v1';

/**
 * Constructs the external-facing base URL from the request,
 * considering X-Forwarded headers set by the Supabase proxy.
 */
export function getBaseUrl(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get('X-Forwarded-Host') ?? url.hostname;
  const proto =
    req.headers.get('X-Forwarded-Proto') ?? url.protocol.replace(':', '');
  const port = req.headers.get('X-Forwarded-Port') ?? url.port;

  console.log('Host:', host);
  console.log('Protocol:', proto);
  console.log('Port:', port);

  const isStandardPort =
    (proto === 'https' && port === '443') ||
    (proto === 'http' && port === '80');

  const portSuffix = port && !isStandardPort ? `:${port}` : '';

  return `${proto}://${host}${portSuffix}`;
}

/**
 * Detects the edge function name from the request path.
 * The Supabase proxy strips /functions/v1 but keeps the function name
 * as the first path segment (e.g. /mcp/... -> function name is "mcp").
 */
export function inferFunctionName(req: Request): string {
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  return segments[0] ?? 'mcp';
}

/**
 * Constructs the external-facing URL for the OAuth Protected Resource
 * Metadata endpoint (RFC 9728).
 */
export function getResourceMetadataUrl(req: Request): string {
  const baseUrl = getBaseUrl(req);
  const functionName = inferFunctionName(req);
  return `${baseUrl}${pathPrefix}/${functionName}/oauth-protected-resource`;
}

/**
 * Constructs the external-facing MCP endpoint URL.
 */
export function getMcpEndpointUrl(req: Request): string {
  const baseUrl = getBaseUrl(req);
  const functionName = inferFunctionName(req);
  return `${baseUrl}${pathPrefix}/${functionName}`;
}

/**
 * Constructs the external-facing Supabase Auth URL.
 */
export function getAuthUrl(req: Request): string {
  const baseUrl = getBaseUrl(req);
  return `${baseUrl}/auth/v1`;
}
