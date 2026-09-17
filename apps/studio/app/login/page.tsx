import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginOAuthButtons } from "./login-oauth-buttons";

import { isSupabaseAuthConfigured, safeAuthNextPath } from "@/lib/supabase/public-env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Ported from micro-ui-agent-builder's app/(auth)/login/page.tsx, dropping
// the (auth) route group (no URL effect, and AGB's app/ tree has no other
// grouped routes to be consistent with) — studio-consolidation Phase 5.
type PageProps = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const nextPath = safeAuthNextPath(sp.next);
  const configured = isSupabaseAuthConfigured();

  if (configured) {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        redirect(nextPath);
      }
    }
  }

  return (
    <div className="bg-background flex min-h-[100dvh] flex-col items-center justify-center p-6">
      <div className="border-border bg-card w-full max-w-md rounded-xl border p-8 shadow-sm">
        <h1 className="text-foreground mb-1 text-center text-xl font-semibold tracking-tight">
          Sign in
        </h1>
        <p className="text-muted-foreground mb-6 text-center text-sm">
          Use Google or GitHub. Configure providers in the Supabase dashboard.
        </p>

        {!configured ? (
          <div className="text-muted-foreground space-y-3 text-sm">
            <p>
              Supabase OAuth is not configured. Add to{" "}
              <code className="bg-muted rounded px-1 py-0.5 text-xs">apps/studio/.env.local</code>:
            </p>
            <ul className="bg-muted/50 list-inside list-disc rounded-lg p-3 text-xs">
              <li>NEXT_PUBLIC_SUPABASE_URL</li>
              <li>NEXT_PUBLIC_SUPABASE_ANON_KEY</li>
            </ul>
            <p className="text-xs">
              In Supabase: Authentication → URL configuration → set redirect URL to{" "}
              <code className="bg-muted rounded px-1">…/auth/callback</code> and enable Google /
              GitHub providers.
            </p>
          </div>
        ) : (
          <LoginOAuthButtons nextPath={nextPath} />
        )}

        <p className="text-muted-foreground mt-6 text-center text-xs">
          <Link href={nextPath} className="underline-offset-2 hover:underline">
            Back to app
          </Link>
        </p>
      </div>
    </div>
  );
}
