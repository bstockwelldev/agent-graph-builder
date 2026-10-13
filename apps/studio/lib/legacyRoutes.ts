/**
 * Routes the canvas-first landing plan retired (canvas-first-landing-plan.md
 * §2). Each one redirects to the workbench panel that replaced it, on `/`,
 * which reopens the last graph (keeping the query) or shows the empty canvas
 * with the panel floating. They stay in place permanently: old KB articles,
 * chat transcripts and bookmarks still link to them.
 *
 * Wired through `redirects()` in next.config.ts, so the query string of the
 * old URL (`?id=`, `?tab=`, `?graph=`) is carried to the new one.
 */
export type LegacyRedirect = {
  source: string;
  destination: string;
  has?: { type: "query"; key: string; value?: string }[];
  permanent: false;
};

/** Old page → the panel that now holds it. */
export const LEGACY_PANEL_ROUTES: Record<string, string> = {
  "/agents": "agents",
  "/prompts": "prompts",
  "/tools": "tools",
  "/mcp": "mcp",
  "/llm-profiles": "llmProfiles",
  "/transforms": "transforms",
  "/datasets": "datasets",
  "/eval-suites": "evalSuites",
  "/policies": "workspacePolicies",
  "/genui": "genui",
};

export const LEGACY_REDIRECTS: LegacyRedirect[] = [
  ...Object.entries(LEGACY_PANEL_ROUTES).map(([source, panel]): LegacyRedirect => ({
    source,
    destination: `/?panel=${panel}`,
    permanent: false,
  })),
  // A graph-scoped Analytics link opens that graph's own analytics. Listed
  // before the general rule, which Next applies in order.
  {
    source: "/analytics",
    has: [{ type: "query", key: "graph", value: "(?<graph>.+)" }],
    destination: "/graphs/:graph?panel=analytics&scope=graph",
    permanent: false,
  },
  { source: "/analytics", destination: "/?panel=analytics&scope=workspace", permanent: false },
  // The Resources hub: the resource panel's kind switcher replaced it.
  { source: "/resources", destination: "/?panel=prompts", permanent: false },
  // The graph list: the picker's Recent section replaced it.
  { source: "/graphs", destination: "/?open=picker", permanent: false },
  { source: "/runs", destination: "/", permanent: false },
];
