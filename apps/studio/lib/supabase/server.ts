import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabasePublicEnv } from "./public-env";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server Components, Server Actions, and Route Handlers. Relies on root
 * middleware.ts to refresh the session cookie. Ported from
 * micro-ui-agent-builder's lib/supabase/server.ts as-is
 * (studio-consolidation Phase 5).
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  const env = getSupabasePublicEnv();
  if (!env) return null;

  const cookieStore = await cookies();

  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component — cookies may be read-only; middleware refreshes session.
        }
      },
    },
  });
}
