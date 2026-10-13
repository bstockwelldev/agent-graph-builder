"use client";

import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { WorkbenchDrawer } from "@/components/workbench/WorkbenchDrawer";
import { ResourceBrowserPanel } from "@/components/workbench/ResourceBrowserPanel";
import { RESOURCE_KINDS } from "@/components/studio/resource-kinds";
import { ChatPanel } from "@/components/workbench/panels/ChatPanel";
import { AnalyticsPanel } from "@/components/workbench/panels/AnalyticsPanel";
import { ConsolePanel } from "@/components/workbench/panels/ConsolePanel";
import { GenuiPanel } from "@/components/workbench/panels/GenuiPanel";
import { WorkspacePoliciesPanel } from "@/components/workbench/panels/WorkspacePoliciesPanel";
import { GraphPicker } from "@/components/graph/GraphPicker";
import { CommandPalette } from "@/components/workbench/CommandPalette";
import { HelpOverlay } from "@/components/workbench/HelpOverlay";

/**
 * Single-segment graph canvas route: /graphs/:id (not /graphs, not
 * .../edit). Ported from MUI's isFlowCanvasRoute, renamed to match AGB's
 * "graph" noun. It decides where the app-wide panels render: the canvas
 * docks its own columns (GraphEditor.tsx), everywhere else they float.
 */
export function isGraphCanvasRoute(pathname: string) {
  return /^\/graphs\/[^/]+$/.test(pathname);
}

/**
 * The app shell. Since the canvas-first landing plan (Phase 3) the studio is
 * the canvas: no rail, no page layouts, no mobile tab bar. `/` (the empty
 * canvas) and `/graphs/:id` fill the viewport; `/login` brings its own layout.
 * Navigation lives in the graph header's menu (GraphEditor.tsx), the command
 * palette and the graph picker.
 */
export function StudioShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const safePathname = pathname ?? "";
  const graphCanvas = isGraphCanvasRoute(safePathname);
  // `/` is the empty canvas: full-bleed like a graph, but with no
  // GraphEditor, so the app-wide panels still float there.
  const fullBleed = graphCanvas || safePathname === "/";

  return (
    <>
      <div
        className={cn(
          "bg-background text-foreground flex min-h-dvh",
          // `min-h-dvh` alone is a floor, not a ceiling: the shell root can
          // grow taller than the viewport to fit content, which defeats every
          // `h-full`/`flex-1`/`min-h-0`/`overflow-y-auto` pairing downstream
          // (they all resolve against a height that's already grown past the
          // viewport) and produces page-level scroll instead of the intended
          // panel-internal scroll. The canvas's docked run/palette panels and
          // node/edge inspector all depend on a genuinely bounded ancestor.
          fullBleed && "h-dvh max-h-dvh min-h-0 overflow-hidden",
          className,
        )}
      >
        <div className="bg-background flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
          </main>
        </div>
      </div>

      {/* App-wide workbench panels (studio-consolidation Phase 8) — mounted
          once here so they're reachable from every route, not just the
          graph canvas. The resource panels use the config-driven editor
          (resource-kinds.tsx, Wave 4b). */}
      {/* `h-[70vh]`, not `max-h-*` — ChatPanel's inner `h-full` flex column
          needs a definite ancestor height to resolve against for its own
          internal scroll region to work (the exact ambiguity flagged in the
          Phase 8 run-panel scrolling bug fix notes). */}
      {/* The graph canvas docks its own chat column (GraphEditor.tsx). */}
      {!graphCanvas && (
        <WorkbenchDrawer panelId="chat" side="right" dockedClassName="right-4 top-20 flex h-[70vh] w-96 flex-col overflow-hidden">
          <ChatPanel />
        </WorkbenchDrawer>
      )}
      {/* The graph canvas docks the resource panels and workspace policies
          in its own column (GraphEditor.tsx), like chat. */}
      {!graphCanvas &&
        RESOURCE_KINDS.map((kind) => (
          <WorkbenchDrawer key={kind.id} panelId={kind.panelId} side="right" dockedClassName="right-4 top-20 max-h-[70vh] w-80 overflow-y-auto">
            <ResourceBrowserPanel kind={kind} />
          </WorkbenchDrawer>
        ))}
      {!graphCanvas && (
        <WorkbenchDrawer panelId="workspacePolicies" side="right" titleBar dockedClassName="right-4 top-20 max-h-[70vh] w-[28rem] overflow-y-auto">
          <WorkspacePoliciesPanel />
        </WorkbenchDrawer>
      )}
      <WorkbenchDrawer panelId="genui" side="right" titleBar dockedClassName="right-4 top-20 max-h-[70vh] w-[32rem] overflow-y-auto">
        <GenuiPanel />
      </WorkbenchDrawer>
      <WorkbenchDrawer panelId="analytics" side="right" titleBar dockedClassName="right-4 top-20 max-h-[70vh] w-[32rem] overflow-y-auto">
        <AnalyticsPanel />
      </WorkbenchDrawer>
      <WorkbenchDrawer panelId="console" side="right" dockedClassName="right-4 bottom-4 flex h-96 w-[32rem] flex-col overflow-hidden">
        <ConsolePanel />
      </WorkbenchDrawer>
      <GraphPicker />
      <CommandPalette />
      <HelpOverlay />
    </>
  );
}
