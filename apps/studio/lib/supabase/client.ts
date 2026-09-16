"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicEnv } from "./public-env";

import type { SupabaseClient } from "@supabase/supabase-js";

// Ported from micro-ui-agent-builder's lib/supabase/client.ts as-is
// (studio-consolidation Phase 5).
export function createSupabaseBrowserClient(): SupabaseClient {
  const env = getSupabasePublicEnv();
  if (!env) {
    throw new Error(
      "Supabase browser client: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  return createBrowserClient(env.url, env.anonKey);
}
