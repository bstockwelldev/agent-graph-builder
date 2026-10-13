"use client";

import { GenuiLibrary } from "@/components/studio/genui-library";

/**
 * The /genui catalog as a global workbench panel (canvas-first landing plan,
 * Phase 2): the same read-only library of GenUI surfaces, titled by the
 * drawer's title bar. Previews use the Run panel checkpoint's renderer.
 */
export function GenuiPanel() {
  return (
    <div className="space-y-4 p-3">
      <p className="text-muted-foreground text-xs">
        What a <code>human_gate</code> node&apos;s <code>genuiCheckpointSurfaceJson</code> can show while a run waits for approval, bound to the
        run&apos;s data with <code>$ref</code>.
      </p>
      <GenuiLibrary />
    </div>
  );
}
