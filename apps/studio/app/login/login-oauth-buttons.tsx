"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseAuthConfigured } from "@/lib/supabase/public-env";

// Ported from micro-ui-agent-builder's app/(auth)/login/login-oauth-buttons.tsx
// as-is (studio-consolidation Phase 5).
type Props = {
  nextPath: string;
};

export function LoginOAuthButtons({ nextPath }: Props) {
  const [pending, setPending] = useState<"google" | "github" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!isSupabaseAuthConfigured()) {
    return null;
  }

  async function signIn(provider: "google" | "github") {
    setMessage(null);
    setPending(provider);
    try {
      const supabase = createSupabaseBrowserClient();
      const origin = window.location.origin;
      const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      if (error) setMessage(error.message);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        variant="outline"
        className="w-full justify-center"
        disabled={pending !== null}
        onClick={() => void signIn("google")}
      >
        {pending === "google" ? "Redirecting…" : "Continue with Google"}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="w-full justify-center"
        disabled={pending !== null}
        onClick={() => void signIn("github")}
      >
        {pending === "github" ? "Redirecting…" : "Continue with GitHub"}
      </Button>
      {message ? (
        <p className="text-destructive text-center text-sm" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
