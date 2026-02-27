import { describe, it, expect, beforeAll } from "vitest";
import { SignJWT, generateKeyPair } from "jose";

const MCP_URL = process.env.MCP_URL ?? "http://127.0.0.1:54321/functions/v1/mcp";

const INIT_BODY = JSON.stringify({
  jsonrpc: "2.0",
  method: "initialize",
  params: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "test-client", version: "0.1.0" },
  },
  id: 1,
});

// Shared state populated in root beforeAll
let unauthResponse: Response;
let metadataUrl: string;
let protectedResourceMeta: Record<string, unknown>;
let authServerMeta: Record<string, unknown>;

beforeAll(async () => {
  unauthResponse = await fetch(MCP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: INIT_BODY,
  });

  const wwwAuth = unauthResponse.headers.get("www-authenticate") ?? "";
  metadataUrl = wwwAuth.match(/resource_metadata="([^"]+)"/)?.[1] ?? "";

  if (metadataUrl) {
    protectedResourceMeta = await fetch(metadataUrl).then((r) => r.json());
    const asUrl = (protectedResourceMeta.authorization_servers as string[])?.[0];
    if (asUrl) {
      authServerMeta = await fetch(`${asUrl}/.well-known/oauth-authorization-server`).then((r) => r.json());
    }
  }
});

describe("unauthenticated request", () => {
  it("returns 401", () => expect(unauthResponse.status).toBe(401));

  it("WWW-Authenticate is Bearer with resource_metadata", () => {
    const header = unauthResponse.headers.get("www-authenticate") ?? "";
    expect(header).toMatch(/^Bearer /);
    expect(header).toContain("resource_metadata=");
  });

  it("resource_metadata is a valid URL", () => {
    expect(() => new URL(metadataUrl)).not.toThrow();
  });
});

it("GET /mcp without auth returns 401", async () => {
  const r = await fetch(MCP_URL, { method: "GET" });
  expect(r.status).toBe(401);
});

it("invalid token returns 401", async () => {
  const r = await fetch(MCP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer not-a-real-jwt" },
    body: INIT_BODY,
  });
  expect(r.status).toBe(401);
});

it("well-formed jwt with invalid signature returns 401", async () => {
  // Sign with a throwaway key — valid ES256 JWT structure but won't match the server's JWKS
  const { privateKey } = await generateKeyPair("ES256");
  const token = await new SignJWT({ sub: "test-user" })
    .setProtectedHeader({ alg: "ES256" })
    .setExpirationTime("1h")
    .sign(privateKey);

  const r = await fetch(MCP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: INIT_BODY,
  });
  expect(r.status).toBe(401);
});

describe("protected resource metadata (RFC 9728)", () => {
  it("resource contains 'mcp'", () =>
    expect(protectedResourceMeta.resource).toContain("mcp"));

  it("authorization_servers is a non-empty array", () => {
    expect(Array.isArray(protectedResourceMeta.authorization_servers)).toBe(true);
    expect((protectedResourceMeta.authorization_servers as unknown[]).length).toBeGreaterThan(0);
  });

  it("bearer_methods_supported includes 'header'", () =>
    expect(protectedResourceMeta.bearer_methods_supported).toContain("header"));
});

describe("authorization server metadata", () => {
  it("has authorization_endpoint", () =>
    expect(typeof authServerMeta.authorization_endpoint).toBe("string"));

  it("has token_endpoint", () =>
    expect(typeof authServerMeta.token_endpoint).toBe("string"));

  it("has jwks_uri", () =>
    expect(typeof authServerMeta.jwks_uri).toBe("string"));

  it("supports PKCE S256", () =>
    expect(authServerMeta.code_challenge_methods_supported).toContain("S256"));
});
