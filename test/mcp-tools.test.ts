import { execSync } from "node:child_process";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

type SupabaseStatus = { API_URL?: string; SERVICE_ROLE_KEY?: string };

function resolveLocalConfig(): { apiUrl: string; serviceRoleKey: string } {
  const apiUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (apiUrl && serviceRoleKey) return { apiUrl, serviceRoleKey };
  try {
    const out = execSync("pnpm supabase status -o json", { encoding: "utf8" });
    const status = JSON.parse(out) as SupabaseStatus;
    if (status.API_URL && status.SERVICE_ROLE_KEY) {
      return { apiUrl: status.API_URL, serviceRoleKey: status.SERVICE_ROLE_KEY };
    }
  } catch {
    // fall through
  }
  throw new Error("Could not resolve Supabase config. Is supabase running?");
}

function firstText(content: unknown): string {
  return (content as Array<{ text: string }>)[0].text;
}

const { apiUrl, serviceRoleKey } = resolveLocalConfig();
const MCP_URL = process.env.MCP_URL ?? `${apiUrl}/functions/v1/mcp`;

const adminClient = createClient(apiUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---- Test user lifecycle ----

const testEmail = `test-mcp-${Date.now()}@example.com`;
const testPassword = crypto.randomUUID();
let testUserId: string;
let token: string;

async function mintUser() {
  const { data, error } = await adminClient.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
  });
  if (error) throw new Error(`Failed to create user: ${error.message}`);
  testUserId = data.user.id;

  const { data: session, error: signInError } = await adminClient.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });
  if (signInError) throw new Error(`Failed to sign in: ${signInError.message}`);
  token = session.session.access_token;
}

async function deleteUser() {
  await adminClient.auth.admin.deleteUser(testUserId);
}

// ---- MCP client ----

let client: Client;
let createdNoteId: number;

beforeAll(async () => {
  await mintUser();

  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  client = new Client({ name: "test-client", version: "0.1.0" });
  await client.connect(transport);
});

afterAll(async () => {
  await client.close();
  await deleteUser();
});

// ---- Tests ----

it("connects and returns server info", () => {
  expect(client.getServerVersion()?.name).toBeTruthy();
});

describe("tools", () => {
  it("lists expected tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("list_notes");
    expect(names).toContain("create_note");
    expect(names).toContain("get_note");
    expect(names).toContain("update_note");
    expect(names).toContain("delete_note");
  });
});

describe("notes CRUD", () => {
  const testTitle = `Test note ${Date.now()}`;

  it("list_notes succeeds", async () => {
    const result = await client.callTool({ name: "list_notes", arguments: {} });
    expect(result.isError).toBeFalsy();
  });

  it("create_note creates a note", async () => {
    const result = await client.callTool({
      name: "create_note",
      arguments: { title: testTitle, content: "Created by automated test" },
    });
    expect(result.isError).toBeFalsy();
    const text = firstText(result.content);
    const created = JSON.parse(text.replace("Created note: ", ""));
    expect(typeof created.id).toBe("number");
    expect(created.title).toBe(testTitle);
    createdNoteId = created.id;
  });

  it("get_note fetches the created note", async () => {
    const result = await client.callTool({ name: "get_note", arguments: { id: createdNoteId } });
    expect(result.isError).toBeFalsy();
    const fetched = JSON.parse(firstText(result.content));
    expect(fetched.id).toBe(createdNoteId);
    expect(fetched.title).toBe(testTitle);
  });

  it("update_note changes the title", async () => {
    const newTitle = `Updated ${testTitle}`;
    const result = await client.callTool({
      name: "update_note",
      arguments: { id: createdNoteId, title: newTitle },
    });
    expect(result.isError).toBeFalsy();
    const updated = JSON.parse(firstText(result.content).replace("Updated note: ", ""));
    expect(updated.title).toBe(newTitle);
  });

  it("delete_note removes the note", async () => {
    const result = await client.callTool({ name: "delete_note", arguments: { id: createdNoteId } });
    expect(result.isError).toBeFalsy();
    expect(firstText(result.content)).toContain(String(createdNoteId));
  });

  it("get_note after delete returns error", async () => {
    const result = await client.callTool({ name: "get_note", arguments: { id: createdNoteId } });
    expect(result.isError).toBe(true);
  });
});
