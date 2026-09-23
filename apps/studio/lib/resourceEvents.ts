import { useEffect, useRef } from "react";

/**
 * Wave 4a (studio-graph-workbench-redesign-plan.md): bound nodes show a
 * resource's live content, so anything that saves or deletes a registry
 * resource announces it, and binding pickers / node-card names refetch.
 * A window event rather than context: the resource panels render in the
 * studio shell, outside the GraphEditor tree.
 */
export const RESOURCE_CHANGED_EVENT = "agb:resource-changed";

export function emitResourceChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(RESOURCE_CHANGED_EVENT));
}

export function useResourceChanged(callback: () => void): void {
  const ref = useRef(callback);
  ref.current = callback;
  useEffect(() => {
    const handler = () => ref.current();
    window.addEventListener(RESOURCE_CHANGED_EVENT, handler);
    return () => window.removeEventListener(RESOURCE_CHANGED_EVENT, handler);
  }, []);
}
