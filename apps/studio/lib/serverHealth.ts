import { useEffect, useState } from "react";
import { client } from "@/lib/api-client";

/** Backends every server instance shares; anything else (SQLite) is local to one server. */
const SHARED_STORAGE_BACKENDS = new Set(["supabase", "object_store", "turso"]);

export function isSharedStorage(backend: string): boolean {
  return SHARED_STORAGE_BACKENDS.has(backend);
}

/** Offline mode: the stub model with no shared store — nothing external is used. */
export function isOfflineRun(provider: string | null | undefined, storageBackend: string | null): boolean {
  return provider === "stub" && storageBackend !== null && !isSharedStorage(storageBackend);
}

export const OFFLINE_EXPLANATION =
  "Offline mode: the stub model makes no provider calls, and with no shared store configured, runs are kept on this server and in this browser only.";

let pending: Promise<string | null> | null = null;

function loadStorageBackend(): Promise<string | null> {
  pending ??= client.system
    .health()
    .then((health) => health.storage_backend)
    .catch(() => {
      pending = null;
      return null;
    });
  return pending;
}

/** The server's storage backend, fetched once per page; `null` until known or if unreachable. */
export function useStorageBackend(): string | null {
  const [backend, setBackend] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void loadStorageBackend().then((value) => {
      if (active) setBackend(value);
    });
    return () => {
      active = false;
    };
  }, []);
  return backend;
}
