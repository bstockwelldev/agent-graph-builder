import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabasePublicEnv, isAuthProtectStudioEnabled, safeAuthNextPath } from "./public-env";

// Ported from micro-ui-agent-builder's lib/supabase/middleware.ts as-is
// (studio-consolidation Phase 5, see
// docs/planning/features/studio-consolidation-plan.md). `/api` here is the
// studio's own proxied route to the FastAPI backend (see next.config.ts's
// rewrite) — same reasoning as MUI's: the backend has no session concept of
// its own, so gating it client-side would just break API calls without
// adding real protection.
function isPublicPath(pathname: string): boolean {
  if (pathname.startsWith("/login")) return true;
  if (pathname.startsWith("/auth/")) return true;
  if (pathname.startsWith("/api")) return true;
  return false;
}

export async function updateSession(request: NextRequest) {
  const env = getSupabasePublicEnv();

  if (!env) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isAuthProtectStudioEnabled()) {
    const pathname = request.nextUrl.pathname;
    if (!isPublicPath(pathname) && !user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", safeAuthNextPath(pathname));
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
