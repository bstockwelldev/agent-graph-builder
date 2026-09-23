import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { isResourceRoute, ResourceTabs, StudioNav, StudioRail } from "./studio-nav";

afterEach(() => cleanup());

// studio-graph-workbench-redesign-plan.md, Wave 2: a compact rail with one
// Resources entry replaces the nine-item sidebar; Runs is retired.
describe("StudioRail", () => {
  it("shows only Graphs, Resources, Analytics, and Policies as primary destinations", () => {
    render(<StudioRail pathname="/graphs" />);
    const nav = screen.getByRole("navigation", { name: "Studio" });
    const labels = within(nav).getAllByRole("link").map((link) => link.textContent);
    expect(labels).toEqual(["Graphs", "Resources", "Analytics", "Policies"]);
  });

  it("marks Resources active on any resource page", () => {
    render(<StudioRail pathname="/prompts" />);
    expect(screen.getByRole("link", { name: "Resources" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Graphs" }).getAttribute("aria-current")).toBeNull();
  });

  it("marks Graphs active on a graph canvas route", () => {
    render(<StudioRail pathname="/graphs/some-id" />);
    expect(screen.getByRole("link", { name: "Graphs" }).getAttribute("aria-current")).toBe("page");
  });
});

describe("StudioNav (mobile sheet)", () => {
  it("lists resource types under Resources and no Runs page", () => {
    render(<StudioNav pathname="/graphs" />);
    for (const label of ["Graphs", "Resources", "Analytics", "Agents", "Prompts", "Tools", "MCP", "LLM Profiles", "GenUI"]) {
      expect(screen.getByRole("link", { name: label })).toBeTruthy();
    }
    for (const label of ["Runs", "Dashboard", "Deployments", "History", "Evaluations"]) {
      expect(screen.queryByRole("link", { name: label })).toBeNull();
    }
  });
});

describe("ResourceTabs", () => {
  it("highlights the current resource type", () => {
    render(<ResourceTabs pathname="/tools" />);
    expect(screen.getByRole("link", { name: "Tools" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Agents" }).getAttribute("aria-current")).toBeNull();
  });

  it("only applies to resource routes", () => {
    expect(isResourceRoute("/llm-profiles")).toBe(true);
    expect(isResourceRoute("/graphs/x")).toBe(false);
    expect(isResourceRoute("/resources")).toBe(false);
  });
});
