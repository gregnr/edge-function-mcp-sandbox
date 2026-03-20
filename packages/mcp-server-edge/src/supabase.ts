import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Creates a Supabase client authenticated with the given user token.
 * RLS policies apply based on the user's JWT.
 */
export function createSupabaseClient(token: string): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variable",
    );
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
