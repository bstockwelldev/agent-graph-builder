"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { EmptyCanvas } from "@/components/graph/EmptyCanvas";
import { useGraphPicker } from "@/components/graph/GraphPicker";
import { client } from "@/lib/api-client";
import { WORKBENCH_PANELS, type WorkbenchPanelId } from "@/components/workbench/panels";
import { useOptionalWorkbench } from "@/components/workbench/WorkbenchProvider";
import { panelContextFromUrl } from "@/lib/graphUrlState";
import { clearLastGraph, readLastGraph } from "@/lib/lastGraph";

/**
 * The landing page (canvas-first-landing-plan.md §3). `/` opens a graph, not a
 * list: the last one you had open if it still exists (keeping any `?panel=`
 * and related params), otherwise an empty canvas with the picker open.
 * `?open=picker` skips the reopen, which is how "no graph open" is asked for.
 *
 * The retired resource, analytics, policies and GenUI pages redirect here
 * with `?panel=` (lib/legacyRoutes.ts). With a graph to reopen the editor
 * opens that panel; on the empty canvas this page opens it instead, floating,
 * and leaves the picker closed since the panel is what was asked for.
 */
export default function HomePage() {
  const router = useRouter();
  const picker = useGraphPicker();
  const workbench = useOptionalWorkbench();
  // Nothing renders while the last graph is being checked, so a returning
  // visitor never sees an intermediate list.
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const url = new URL(window.location.href);
    const forced = url.searchParams.get("open") === "picker";
    const lastGraph = forced ? null : readLastGraph();

    const requestedPanel = url.searchParams.get("panel");
    const panel =
      requestedPanel && requestedPanel in WORKBENCH_PANELS && WORKBENCH_PANELS[requestedPanel as WorkbenchPanelId].scope === "global"
        ? (requestedPanel as WorkbenchPanelId)
        : null;

    const showEmptyCanvas = () => {
      if (cancelled) return;
      setChecking(false);
      if (panel && workbench) workbench.open(panel, panelContextFromUrl(url.search));
      else picker.open();
    };
    if (!lastGraph) {
      showEmptyCanvas();
      return;
    }
    client.graphs.summaries.list().then(
      (graphs) => {
        if (cancelled) return;
        if (graphs.some((graph) => graph.id === lastGraph)) {
          router.replace(`/graphs/${encodeURIComponent(lastGraph)}${url.search}${url.hash}`);
          return;
        }
        // Deleted since: forget it, and fall back to the picker.
        clearLastGraph();
        showEmptyCanvas();
      },
      // The API is unreachable: the picker shows the load error with a retry.
      showEmptyCanvas,
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  if (checking) return <div className="flex-1" aria-busy="true" />;
  return <EmptyCanvas onOpenPicker={picker.open} />;
}
