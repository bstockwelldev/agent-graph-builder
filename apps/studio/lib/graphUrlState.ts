/**
 * Graph-route URL state (studio-graph-workbench-redesign-plan.md, Wave 2 /
 * STO-603; review section 64 "Interaction state model" and the section 83
 * guardrail "Can the user return to the exact graph context?").
 *
 * The graph editor mirrors its selection into the query string --
 * `?node=…&tab=…` or `?edge=…`, plus `?run=…` for an inspected run and
 * `?panel=…` for the open workbench panel -- so a reload, a shared link, or
 * browser history lands on the same node/run/panel. `section` is read-only
 * (a one-shot "open this Run panel section" used by the retired /runs
 * redirect) and is dropped on the next write. Unknown params are preserved.
 */
export type GraphUrlState = {
  node: string | null;
  edge: string | null;
  run: string | null;
  panel: string | null;
  tab: string | null;
  section: string | null;
};

const KEYS = ["node", "edge", "run", "panel", "tab", "section"] as const;

export const EMPTY_GRAPH_URL_STATE: GraphUrlState = {
  node: null,
  edge: null,
  run: null,
  panel: null,
  tab: null,
  section: null,
};

export function parseGraphUrlState(search: string): GraphUrlState {
  const params = new URLSearchParams(search);
  const state = { ...EMPTY_GRAPH_URL_STATE };
  for (const key of KEYS) {
    const value = params.get(key)?.trim();
    state[key] = value ? value : null;
  }
  // A node and an edge can't both be selected; the node wins.
  if (state.node) state.edge = null;
  // A tab only means something alongside a node.
  if (!state.node) state.tab = null;
  return state;
}

/** Returns the new query string (with leading "?", or "" when empty). */
export function serializeGraphUrlState(state: Partial<GraphUrlState>, currentSearch = ""): string {
  const params = new URLSearchParams(currentSearch);
  for (const key of KEYS) params.delete(key);
  const node = state.node ?? null;
  const ordered: [string, string | null | undefined][] = [
    ["node", node],
    ["edge", node ? null : state.edge],
    // "configure" is the inspector's default tab -- omit it to keep URLs short.
    ["tab", node && state.tab && state.tab !== "configure" ? state.tab : null],
    ["run", state.run],
    ["panel", state.panel],
  ];
  for (const [key, value] of ordered) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}
