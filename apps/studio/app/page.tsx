"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Workflow } from "lucide-react";

import { useGraphPicker } from "@/components/studio/graph-picker";
import { Button } from "@/components/ui/button";
import { client } from "@/lib/api-client";
import { clearLastGraph, readLastGraph } from "@/lib/lastGraph";

/**
 * The landing page (canvas-first-landing-plan.md §3). `/` opens a graph, not a
 * list: the last one you had open if it still exists (keeping any `?panel=`
 * and related params), otherwise an empty canvas with the picker open.
 * `?open=picker` skips the reopen, which is how "no graph open" is asked for.
 */
export default function HomePage() {
  const router = useRouter();
  const picker = useGraphPicker();
  // Nothing renders while the last graph is being checked, so a returning
  // visitor never sees an intermediate list.
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const url = new URL(window.location.href);
    const forced = url.searchParams.get("open") === "picker";
    const lastGraph = forced ? null : readLastGraph();

    const showPicker = () => {
      if (cancelled) return;
      setChecking(false);
      picker.open();
    };
    if (!lastGraph) {
      showPicker();
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
        showPicker();
      },
      // The API is unreachable: the picker shows the load error with a retry.
      showPicker,
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  if (checking) return <div className="flex-1" aria-busy="true" />;
  return <EmptyCanvas onOpenPicker={picker.open} />;
}

/** The canvas with no graph on it: a dotted ground and one way forward, never a blank screen. */
function EmptyCanvas({ onOpenPicker }: { onOpenPicker: () => void }) {
  return (
    <div
      data-testid="empty-canvas"
      className="flex flex-1 items-center justify-center bg-[radial-gradient(circle,var(--border)_1px,transparent_1px)] [background-size:24px_24px]"
    >
      <div className="bg-card flex max-w-sm flex-col items-center gap-3 rounded-xl p-8 text-center ring-1 ring-foreground/10">
        <Workflow className="text-muted-foreground size-8" aria-hidden />
        <h1 className="text-lg font-semibold tracking-tight">No graph open</h1>
        <p className="text-muted-foreground text-sm">Open one of your graphs or a demo, or start a blank graph.</p>
        <Button type="button" variant="synth" onClick={onOpenPicker}>
          Open or create a graph
        </Button>
        <p className="text-muted-foreground text-xs">
          or press <kbd className="font-mono">⌘O</kbd>
        </p>
      </div>
    </div>
  );
}
