import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({
  client: {
    prompts: {
      list: vi.fn(async () => [
        { id: "p1", name: "Classifier", body: "Classify {question}" },
      ]),
    },
    llmProfiles: { list: vi.fn(async () => []) },
    tools: {
      list: vi.fn(async () => [
        { id: "web_search", description: "Search the web" },
      ]),
    },
    transforms: { list: vi.fn(async () => []) },
    graphs: {
      summaries: {
        list: vi.fn(async () => [
          { id: "g1", name: "This graph" },
          { id: "g2", name: "Billing flow" },
        ]),
      },
    },
  },
}));

import { NodePalette } from "./NodePalette";
import { filterPaletteItems, nodeTypeItems } from "./paletteSections";

afterEach(() => cleanup());

// canvas-workbench-ergonomics-plan.md §4: the registry-driven palette.
describe("NodePalette", () => {
  it("lists node types, library items as bound nodes, and other graphs as subgraphs", async () => {
    const onAdd = vi.fn();
    render(<NodePalette onAdd={onAdd} graphId="g1" />);
    fireEvent.click(screen.getByRole("button", { name: /^Transform/ }));
    expect(onAdd).toHaveBeenLastCalledWith("transform", undefined);

    const library = screen.getByRole("region", { name: "Library" });
    await waitFor(() => expect(library.textContent).toContain("Classifier"));
    fireEvent.click(screen.getByRole("button", { name: /^Classifier/ }));
    expect(onAdd).toHaveBeenLastCalledWith("prompt", { promptId: "p1" });
    fireEvent.click(screen.getByRole("button", { name: /^web_search/ }));
    expect(onAdd).toHaveBeenLastCalledWith("tool", { toolName: "web_search" });

    const subgraphs = screen.getByRole("region", { name: "Subgraphs" });
    await waitFor(() =>
      expect(subgraphs.textContent).toContain("Billing flow"),
    );
    // Not the graph being edited.
    expect(subgraphs.textContent).not.toContain("This graph");
    fireEvent.click(screen.getByRole("button", { name: /^Billing flow/ }));
    expect(onAdd).toHaveBeenLastCalledWith("subgraph", {
      graphId: "g2",
      version: "latest",
    });
  });

  it("searches across every section", async () => {
    render(<NodePalette onAdd={vi.fn()} graphId="g1" />);
    await waitFor(() =>
      expect(
        screen.getByRole("region", { name: "Library" }).textContent,
      ).toContain("Classifier"),
    );
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search the palette" }),
      { target: { value: "classif" } },
    );
    expect(screen.queryByRole("button", { name: /^Transform/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^Classifier/ })).toBeTruthy();
    // The decision node's summary ("Classify and route…") matches too.
    expect(
      screen.getByRole("region", { name: "Nodes" }).textContent,
    ).toContain("Decision");
  });

  it("sets the kind for new edges, and folds to an icon strip", () => {
    const onDefaultEdgeKindChange = vi.fn();
    const onCollapsedChange = vi.fn();
    const { rerender } = render(
      <NodePalette
        onAdd={vi.fn()}
        defaultEdgeKind="sequence"
        onDefaultEdgeKindChange={onDefaultEdgeKindChange}
        onCollapsedChange={onCollapsedChange}
      />,
    );
    expect(
      screen
        .getByRole("button", { name: "Always" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Fallback" }));
    expect(onDefaultEdgeKindChange).toHaveBeenCalledWith("default");
    fireEvent.click(screen.getByRole("button", { name: "Collapse palette" }));
    expect(onCollapsedChange).toHaveBeenCalledWith(true);

    const onAdd = vi.fn();
    rerender(
      <NodePalette
        onAdd={onAdd}
        collapsed
        onCollapsedChange={onCollapsedChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add Transform node" }));
    expect(onAdd).toHaveBeenCalledWith("transform");
    fireEvent.click(screen.getByRole("button", { name: "Expand palette" }));
    expect(onCollapsedChange).toHaveBeenLastCalledWith(false);
  });
});

describe("filterPaletteItems", () => {
  it("matches every word against label, summary and type, dropping group captions", () => {
    const found = filterPaletteItems(nodeTypeItems(), "chat model");
    expect(found.map((item) => item.nodeType)).toEqual(["llm"]);
    expect(found[0].group).toBeUndefined();
    expect(filterPaletteItems(nodeTypeItems(), "")).toHaveLength(16);
  });
});
