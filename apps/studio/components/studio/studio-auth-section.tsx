"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import type { User } from "@supabase/supabase-js";

import { Button, buttonVariants } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getSupabasePublicEnv } from "@/lib/supabase/public-env";
import { cn } from "@/lib/utils";

// Ported from micro-ui-agent-builder's components/studio/studio-auth-section.tsx
// (studio-consolidation Phase 5 — see
// docs/planning/features/studio-consolidation-plan.md). Dropped from the
// studio shell in Phase 4c specifically because auth was Phase 5 scope; this
// is that deferred piece landing, wired into StudioShell's sidebar below.
// Only change from the MUI source: the signed-out redirect and default
// `usePathname` fallback point at AGB's /graphs landing route instead of
// MUI's /dashboard (AGB has no dashboard route — see studio-shell.tsx).
export function StudioAuthSection() {
  const pathname = usePathname() ?? "/graphs";
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    if (!getSupabasePublicEnv()) {
      setUser(null);
      return;
    }

    const supabase = createSupabaseBrowserClient();

    void supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (!getSupabasePublicEnv()) {
    return null;
  }

  if (user === undefined) {
    return (
      <div
        className="border-sidebar-border text-muted-foreground mt-auto border-t pt-4 text-[10px]"
        aria-hidden
      >
        …
      </div>
    );
  }

  if (user) {
    const label =
      user.email ??
      (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null) ??
      "Signed in";

    return (
      <div className="border-sidebar-border mt-auto space-y-2 border-t pt-4">
        <p className="text-muted-foreground truncate px-2 text-xs" title={label}>
          {label}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-sidebar-foreground h-8 w-full justify-start px-2 text-xs"
          onClick={() => {
            void createSupabaseBrowserClient()
              .auth.signOut()
              .then(() => {
                window.location.href = "/graphs";
              });
          }}
        >
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <div className="border-sidebar-border mt-auto border-t pt-4">
      <Link
        href={`/login?next=${encodeURIComponent(pathname)}`}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "border-sidebar-border h-8 w-full text-xs",
        )}
      >
        Sign in
      </Link>
    </div>
  );
}
