# MCP Auth Testing Guide

How to test the edge function MCP server across different harnesses.

## Prerequisites

Start local Supabase and serve the function:

```bash
pnpm supabase start
pnpm supabase functions serve
```

---

## 1. Protocol Compliance (automated)

Tests the 401/WWW-Authenticate/discovery chain without any OAuth flow.

```bash
# Local
pnpm test:protocol

# Remote
MCP_URL=https://xxx.supabase.co/functions/v1/mcp pnpm test:protocol
```

---

## 2. Tool Tests (automated, needs a token)

Tests all MCP tools (create/get/update/delete notes) using a real JWT.

**Get a token (local):**

```bash
# Create a test user first if needed:
# curl -X POST http://127.0.0.1:54321/auth/v1/signup ...

TOKEN=$(curl -s -X POST "http://127.0.0.1:54321/auth/v1/token?grant_type=password" \
  -H "apikey: $(pnpm supabase status | grep 'anon key' | awk '{print $NF}')" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpassword"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

SUPABASE_ACCESS_TOKEN=$TOKEN pnpm test:tools
```

**Get a token (remote, after OAuth):**

```bash
# After completing an OAuth flow in any harness, you can pull the token from
# the browser's network tab or from the harness's stored credentials.
SUPABASE_ACCESS_TOKEN=<jwt> MCP_URL=https://xxx.supabase.co/functions/v1/mcp pnpm test:tools
```

---

## 3. Claude Code CLI

Claude Code supports OAuth for HTTP MCP servers natively. The `.mcp.json` is already
configured in this repo - it just needs the auth to kick in.

**To test locally:**

1. Make sure `supabase start` and `supabase functions serve` are running
2. Open a new Claude Code session in this repo directory
3. Claude Code will attempt to connect to the `test` MCP server
4. It should receive the 401 and trigger the browser OAuth flow
5. After auth, Claude Code can call notes tools - ask it to "list my notes"

**To verify it worked:**

- Claude Code should show the `notes-mcp` server as connected
- Asking "list my notes" should return real data from the DB

**Troubleshooting:**

- If Claude Code doesn't trigger OAuth: check that the `WWW-Authenticate` header is
  present by running `pnpm test:protocol`
- If the OAuth flow fails mid-way: check the Supabase Auth logs (`pnpm supabase logs auth`)
- If the function isn't running: `pnpm supabase functions serve mcp` (not just `start`)

---

## 4. Cursor

Cursor supports MCP via its settings panel with OAuth.

**Setup:**

1. Open Cursor Settings → Features → MCP
2. Add server:
   - Name: `notes-mcp-local` (or `notes-mcp-remote`)
   - Type: `http`
   - URL: `http://127.0.0.1:54321/functions/v1/mcp`
3. Cursor will try to connect and should trigger an OAuth browser window
4. Sign in with a Supabase user account
5. After consent, Cursor will store the token and connect

Alternatively, add to `~/.cursor/mcp.json` or the project `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "notes-mcp": {
      "type": "http",
      "url": "http://127.0.0.1:54321/functions/v1/mcp"
    }
  }
}
```

**To verify:** In a Cursor chat, ask "what MCP tools do you have?" - it should list
the 5 notes tools. Then ask it to "create a note titled Hello".

---

## 5. Direct curl (manual protocol inspection)

```bash
BASE=http://127.0.0.1:54321/functions/v1/mcp

# Step 1: Should 401 with WWW-Authenticate
curl -i -X POST "$BASE" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"0.0.1"}},"id":1}'

# Step 2: Fetch the metadata URL from the header above
curl -s "$BASE/oauth-protected-resource" | python3 -m json.tool

# Step 3: Fetch auth server metadata
curl -s "http://127.0.0.1:54321/auth/v1/.well-known/oauth-authorization-server" | python3 -m json.tool

# Step 4: Authenticated call (replace TOKEN)
curl -i -X POST "$BASE" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"0.0.1"}},"id":1}'
```

---

## 6. Remote (deployed) testing

Everything above works against the deployed function - just set `MCP_URL`:

```bash
export MCP_URL=https://paalprwvwswzlcvytsfn.supabase.co/functions/v1/mcp
pnpm test:protocol
SUPABASE_ACCESS_TOKEN=<jwt> pnpm test:tools
```

The `.mcp.json` also has the `remote` server entry - Claude Code can connect to it
by uncommenting or by running from a directory where it's configured.
