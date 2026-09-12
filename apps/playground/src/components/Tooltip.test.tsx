import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { shell } from "../theme";
import { TaxonomyTooltip } from "./Tooltip";

afterEach(() => {
  cleanup();
});

function renderTooltip(layout?: "block" | "inline" | "corner") {
  const { container } = render(
    <TaxonomyTooltip title="Orientation" summary="Rank direction" details="Auto, H, or V." layout={layout}>
      <span>Label</span>
    </TaxonomyTooltip>,
  );
  return container.firstElementChild as HTMLElement;
}

describe("TaxonomyTooltip layouts", () => {
  it("uses a full-width flex row for block (default)", () => {
    const root = renderTooltip();
    expect(root.style.width).toBe("100%");
    expect(root.style.display).toBe("flex");
  });

  it("does not stretch inline layout to 100% width", () => {
    const root = renderTooltip("inline");
    expect(root.style.width).toBe("auto");
    expect(root.style.display).toBe("inline-flex");
  });

  it("keeps corner layout from acting as a stretching flex row", () => {
    const root = renderTooltip("corner");
    expect(root.style.display).toBe("block");
    expect(root.style.display).not.toBe("flex");
    expect(screen.getByRole("button", { name: "Help: Orientation" })).toBeTruthy();
  });

  it("uses a 44px help button", () => {
    renderTooltip("inline");
    const help = screen.getByRole("button", { name: "Help: Orientation" });
    expect(help.style.minWidth).toBe(`${shell.touchTarget.min}px`);
    expect(help.style.minHeight).toBe(`${shell.touchTarget.min}px`);
  });
});
