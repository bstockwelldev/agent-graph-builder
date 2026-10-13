import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { GENUI_CATALOG } from "@/lib/genuiCatalog";

import { GenuiPanel } from "./GenuiPanel";

afterEach(cleanup);

// Canvas-first landing plan, Phase 2 (§4 item 4): the /genui catalog as a global panel.
describe("GenuiPanel", () => {
  it("lists the checkpoint pattern and a reference card per component", () => {
    render(<GenuiPanel />);
    expect(screen.getByText(/Pattern · approval checkpoint/)).toBeTruthy();
    expect(screen.getByRole("region", { name: "Component reference" })).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Components" });
    expect(nav.querySelectorAll("a")).toHaveLength(GENUI_CATALOG.length);
  });
});
