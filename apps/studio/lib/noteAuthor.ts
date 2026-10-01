"use client";

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getSupabasePublicEnv } from "@/lib/supabase/public-env";

// Who writes a sticky note or comment: the signed-in user's email when
// Studio sign-in is configured, else a name saved in this browser.

const NAME_KEY = "agb.notes.author";

function readStoredName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function useNoteAuthor(): { name: string | null; signedIn: boolean; setName: (name: string) => void } {
  const [stored, setStored] = useState("");
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    setStored(readStoredName());
    if (!getSupabasePublicEnv()) return;
    let cancelled = false;
    void createSupabaseBrowserClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!cancelled) setEmail(data.user?.email ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const setName = useCallback((name: string) => {
    setStored(name);
    try {
      window.localStorage.setItem(NAME_KEY, name);
    } catch {
      // Storage blocked: the name lasts for this session only.
    }
  }, []);

  return { name: email ?? (stored.trim() || null), signedIn: Boolean(email), setName };
}
