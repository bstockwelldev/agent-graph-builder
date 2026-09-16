import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

// Ported from micro-ui-agent-builder's root middleware.ts as-is
// (studio-consolidation Phase 5).
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all paths except static assets and images.
     * API routes still run middleware so session cookies refresh on API calls.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
