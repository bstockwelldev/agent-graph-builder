"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import type { User } from "@supabase/supabase-js";

import { LogIn, UserRound } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
function signOut() {
  void createSupabaseBrowserClient()
    .auth.signOut()
    .then(() => {
      window.location.href = "/graphs";
    });
}

/** `compact`: the 72px desktop rail's account control (Wave 2) -- an icon
 * with a menu (account label + Sign out) instead of a full-width block. */
export function StudioAuthSection({ compact = false }: { compact?: boolean } = {}) {
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

  if (compact) {
    if (user === undefined) return <div className="mt-auto size-10" aria-hidden />;
    if (!user) {
      return (
        <Link
          href={`/login?next=${encodeURIComponent(pathname)}`}
          aria-label="Sign in"
          title="Sign in"
          className="text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground mt-auto flex size-10 items-center justify-center rounded-lg"
        >
          <LogIn className="size-5" aria-hidden />
        </Link>
      );
    }
    const label =
      user.email ??
      (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null) ??
      "Signed in";
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Account: ${label}`}
          title={label}
          className="text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground mt-auto flex size-10 items-center justify-center rounded-lg"
        >
          <UserRound className="size-5" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" className="w-56">
          <DropdownMenuLabel className="truncate">{label}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut}>Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
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
          onClick={signOut}
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
