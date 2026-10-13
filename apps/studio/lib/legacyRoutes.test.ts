import { describe, expect, it } from "vitest";

import { RESOURCE_KINDS } from "@/components/studio/resource-kinds";
import { WORKBENCH_PANELS, type WorkbenchPanelId } from "@/components/workbench/panels";

import { LEGACY_PANEL_ROUTES, LEGACY_REDIRECTS } from "./legacyRoutes";

// canvas-first-landing-plan.md §2: every retired route redirects, and to something that exists.
describe("legacy route redirects", () => {
  const sources = LEGACY_REDIRECTS.map((redirect) => redirect.source);

  it("covers every route the plan retires", () => {
    for (const source of [
      "/agents", "/prompts", "/tools", "/mcp", "/llm-profiles", "/transforms", "/datasets", "/eval-suites",
      "/resources", "/analytics", "/policies", "/genui", "/graphs", "/runs",
    ]) {
      expect(sources, source).toContain(source);
    }
  });

  it("sends each resource page to its own panel", () => {
    expect(Object.keys(LEGACY_PANEL_ROUTES)).toHaveLength(RESOURCE_KINDS.length + 2);
    for (const kind of RESOURCE_KINDS) {
      expect(Object.values(LEGACY_PANEL_ROUTES)).toContain(kind.panelId);
    }
  });

  it("only ever targets a real global panel (or / and the picker)", () => {
    for (const redirect of LEGACY_REDIRECTS) {
      const url = new URL(redirect.destination, "http://studio.test");
      const panel = url.searchParams.get("panel");
      if (panel) {
        expect(panel in WORKBENCH_PANELS, redirect.destination).toBe(true);
        expect(WORKBENCH_PANELS[panel as WorkbenchPanelId].scope, redirect.destination).toBe("global");
      } else if (url.pathname === "/") {
        expect(["", "?open=picker"]).toContain(url.search);
      }
    }
  });

  it("is temporary, so a panel can move later without cached redirects", () => {
    expect(LEGACY_REDIRECTS.every((redirect) => redirect.permanent === false)).toBe(true);
  });

  it("lists the graph-scoped Analytics link before the general one, since Next applies them in order", () => {
    const analytics = LEGACY_REDIRECTS.filter((redirect) => redirect.source === "/analytics");
    expect(analytics).toHaveLength(2);
    expect(analytics[0].has?.[0]?.key).toBe("graph");
    expect(analytics[0].destination).toBe("/graphs/:graph?panel=analytics&scope=graph");
    expect(analytics[1].has).toBeUndefined();
    expect(analytics[1].destination).toBe("/?panel=analytics&scope=workspace");
  });
});
