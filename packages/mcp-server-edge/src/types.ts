/**
 * Options for unauthorizedResponse.
 */
export interface UnauthorizedResponseOptions {
  /** Absolute URL override for the resource metadata endpoint. */
  resourceMetadataUrl?: string;
}

/**
 * Options for resourceMetadataResponse.
 */
export interface ResourceMetadataOptions {
  /** Override the resource URI. */
  resource?: string;
  /** Override the authorization servers list. */
  authorizationServers?: string[];
}
