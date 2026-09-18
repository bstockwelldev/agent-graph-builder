// Static workbench panel registry (studio-consolidation Phase 8) — the
// single source of truth for a panel's id/title/hotkey, read by both the
// global keydown handler and the command palette. Declaring a panel here is
// what gives it its "two doors" (hotkey + palette entry); a right-click menu
// entry, where one makes sense, is added at the call site (e.g.
// NodeContextMenu's "Add node" actions already open the "palette" panel).
export type WorkbenchPanelId =
  | "library"
  | "palette"
  | "run"
  | "chat"
  | "agents"
  | "prompts"
  | "tools"
  | "mcp"
  | "llmProfiles";

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
  library: { title: "Switch graph", hotkey: null, scope: "graph" },
  palette: { title: "Add node", hotkey: null, scope: "graph" },
  run: { title: "Run", hotkey: null, scope: "graph" },
  // App-wide panels (rendered by StudioShell, available on every route).
  chat: { title: "Chat", hotkey: "mod+shift+c", scope: "global" },
  agents: { title: "Agents", hotkey: null, scope: "global" },
  prompts: { title: "Prompts", hotkey: null, scope: "global" },
  tools: { title: "Tools", hotkey: null, scope: "global" },
  mcp: { title: "MCP", hotkey: null, scope: "global" },
  llmProfiles: { title: "LLM Profiles", hotkey: null, scope: "global" },
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
