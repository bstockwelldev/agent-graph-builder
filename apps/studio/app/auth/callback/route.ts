import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getSupabasePublicEnv, safeAuthNextPath } from "@/lib/supabase/public-env";

// Ported from micro-ui-agent-builder's app/auth/callback/route.ts as-is
// (studio-consolidation Phase 5).
export async function GET(request: Request) {
  const env = getSupabasePublicEnv();
  const origin = new URL(request.url).origin;

  if (!env) {
    return NextResponse.redirect(`${origin}/login?error=not_configured`);
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeAuthNextPath(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const cookieStore = await cookies();
  const redirectResponse = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
          redirectResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  return redirectResponse;
}
