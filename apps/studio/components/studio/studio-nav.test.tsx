import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StudioNav } from "./studio-nav";

afterEach(() => cleanup());

describe("StudioNav", () => {
  it("renders the Agent Graphs, Agent Anatomy Management, and Observability & Analytics nav groups", () => {
    render(<StudioNav pathname="/graphs" />);

    for (const label of ["Graphs", "Agents", "Prompts", "Tools", "MCP", "LLM Profiles", "GenUI"]) {
      expect(screen.getByRole("link", { name: label })).toBeTruthy();
    }
    for (const label of ["Runs", "Analytics"]) {
      expect(screen.getByRole("link", { name: label })).toBeTruthy();
    }
  });

  it("marks the active route with aria-current", () => {
    render(<StudioNav pathname="/graphs/some-id" />);

    expect(screen.getByRole("link", { name: "Graphs" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("link", { name: "Agents" }).getAttribute("aria-current")).toBeNull();
  });

  it("does not render a Dashboard, Deployments, or History item", () => {
    render(<StudioNav pathname="/graphs" />);

    for (const label of ["Dashboard", "Deployments", "History", "Evaluations"]) {
      expect(screen.queryByRole("link", { name: label })).toBeNull();
    }
  });
});
