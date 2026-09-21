// Static workbench panel registry (studio-consolidation Phase 8) — the
// single source of truth for a panel's id/title/hotkey, read by both the
// global keydown handler and the command palette. Declaring a panel here is
// what gives it its "two doors" (hotkey + palette entry); a right-click menu
// entry, where one makes sense, is added at the call site (e.g.
// NodeContextMenu's "Add node" actions already open the "palette" panel).
export type WorkbenchPanelId =
  | "palette"
  | "run"
  | "releases"
  | "routingLab"
  | "chat"
  | "agents"
  | "prompts"
  | "tools"
  | "mcp"
  | "llmProfiles"
  | "analytics"
  | "help";

// Hotkey format: "mod+shift+<key>" ("mod" = Cmd on macOS, Ctrl elsewhere).
// Bare letters are deliberately avoided — they'd fire while a user is doing
// perfectly normal canvas/keyboard interaction outside a form field.
//
// `scope: "graph"` panels are rendered by GraphEditor.tsx and only make
// sense on /graphs/[id] (they already have a dedicated HUD button there);
// the command palette (part B) excludes them for that reason, rather than
// listing a command that does nothing on every other route.
export const WORKBENCH_PANELS: Record<
  WorkbenchPanelId,
  { title: string; hotkey: string | null; scope: "graph" | "global" }
> = {
  palette: { title: "Add node", hotkey: null, scope: "graph" },
  run: { title: "Run", hotkey: null, scope: "graph" },
  // P0 graph foundation, Slice C/D Studio UI: publish immutable releases
  // and browse release history for the current graph.
  releases: { title: "Releases", hotkey: null, scope: "graph" },
  // P1 rollout plan, Slice D Studio UI: run a fixture dataset against the
  // current graph (or a comparison graph) and see the resulting
  // route-decision distribution.
  routingLab: { title: "Routing lab", hotkey: null, scope: "graph" },
  // App-wide panels (rendered by StudioShell, available on every route).
  chat: { title: "Chat", hotkey: "mod+shift+c", scope: "global" },
  agents: { title: "Agents", hotkey: null, scope: "global" },
  prompts: { title: "Prompts", hotkey: null, scope: "global" },
  tools: { title: "Tools", hotkey: null, scope: "global" },
  mcp: { title: "MCP", hotkey: null, scope: "global" },
  llmProfiles: { title: "LLM Profiles", hotkey: null, scope: "global" },
  // Phase 10 Slice A (docs/planning/features/studio-shell-ux-gap-analysis.md):
  // workspace-wide run totals/daily-trend/per-graph spend — spans every
  // graph, so global scope, same as the resource registries. Closes the
  // gap analysis's Tier 1 finding that /analytics had no HUD door at all.
  analytics: { title: "Analytics", hotkey: null, scope: "global" },
  // Real hotkey is bare "?" — HelpOverlay.tsx manages that listener itself
  // rather than going through matchesHotkey below (its shiftKey-must-match
  // check doesn't fit a symbol that inherently requires Shift to type), so
  // `hotkey` stays null here to avoid the generic loop silently no-op'ing
  // on every "?" press. Still `scope: "global"` for the command palette entry.
  help: { title: "Shortcuts & gestures", hotkey: null, scope: "global" },
};

/** Matches a KeyboardEvent against a "mod+shift+<key>"-style hotkey string. */
export function matchesHotkey(event: KeyboardEvent, hotkey: string): boolean {
  const parts = hotkey.split("+");
  const key = parts.at(-1);
  const needsMod = parts.includes("mod");
  const needsShift = parts.includes("shift");
  const hasMod = event.metaKey || event.ctrlKey;
  return (
    event.key.toLowerCase() === key &&
    hasMod === needsMod &&
    event.shiftKey === needsShift
  );
}
