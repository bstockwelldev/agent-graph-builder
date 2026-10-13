"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getSupabasePublicEnv } from "@/lib/supabase/public-env";

export type StudioAccount = {
  /** False when Supabase auth isn't set up: there is no account to show. */
  configured: boolean;
  /** `undefined` while it loads, `null` when signed out. */
  user: User | null | undefined;
  /** Email, else full name, else "Signed in". Empty while signed out. */
  label: string;
  signInHref: string;
  signOut: () => void;
};

/** Where sign-out lands: `/` reopens the last graph, or shows the picker. */
function signOut() {
  void createSupabaseBrowserClient()
    .auth.signOut()
    .then(() => {
      window.location.href = "/";
    });
}

/**
 * The signed-in user, for the places that show an account now that the rail
 * is gone (canvas-first landing plan §5): the graph header's App menu and the
 * empty canvas. Ported from the old StudioAuthSection.
 */
export function useStudioAccount(): StudioAccount {
  const pathname = usePathname() ?? "/";
  const configured = getSupabasePublicEnv() !== null;
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

  const label = user
    ? (user.email ?? (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null) ?? "Signed in")
    : "";
  return { configured, user, label, signInHref: `/login?next=${encodeURIComponent(pathname)}`, signOut };
}
