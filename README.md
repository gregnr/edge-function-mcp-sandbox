# Supabase MCP OAuth Server

A Supabase Edge Function implementing an MCP (Model Context Protocol) server with OAuth 2.1 authentication, plus a Next.js consent UI.

## Setup

```bash
# Install dependencies
pnpm install

# Generate JWT signing key (required for JWKS verification)
pnpm setup:signing-key

# Start Supabase
npx supabase start

# Create .env.local for Next.js
npx supabase status -o env \
  --override-name api.url=NEXT_PUBLIC_SUPABASE_URL \
  --override-name auth.publishable_key=NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
  2>/dev/null | grep NEXT_PUBLIC > .env.local

# Start Next.js dev server (for consent UI)
pnpm dev
```

## Architecture

- **Edge Function** (`supabase/functions/mcp/`) - MCP server with OAuth token validation via JWKS
- **Next.js App** (`src/`) - OAuth consent UI at `/oauth/consent`
- **Supabase Auth** - OAuth 2.1 server with dynamic client registration

## Key Files

| Path                              | Description                                            |
| --------------------------------- | ------------------------------------------------------ |
| `supabase/functions/mcp/index.ts` | MCP server with JWKS token validation                  |
| `supabase/config.toml`            | Supabase config (OAuth server, signing keys)           |
| `src/app/oauth/consent/`          | OAuth consent page                                     |
| `src/app/api/oauth/decision/`     | Approve/deny API route                                 |
| `src/app/auth/`                   | Login/signup pages (via @supabase/password-based-auth) |

## OAuth Flow

1. Client initiates OAuth at `http://127.0.0.1:54321/auth/v1/authorize`
2. User redirected to consent UI at `http://127.0.0.1:3000/oauth/consent`
3. User logs in (if needed) and approves/denies
4. Client receives authorization code, exchanges for access token
5. Client calls MCP endpoint with Bearer token
6. Edge function validates token via JWKS

