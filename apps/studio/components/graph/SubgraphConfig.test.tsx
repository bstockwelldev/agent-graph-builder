import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SubgraphConfig } from "./SubgraphConfig";
import { agentGraphWrapper } from "@/lib/agentGraphTestWrapper";

// Wave 7c (STO-612): the subgraph node's Configure tab.

const { clientMock } = vi.hoisted(() => ({ clientMock: { graphs: { summaries: { list: vi.fn() } }, releases: { list: vi.fn() } } }));
vi.mock("@/lib/api-client", () => ({ client: clientMock }));

const g = (id: string, name: string, subgraphIds: string[] = []) => ({
  id,
  name,
  node_count: 1 + subgraphIds.length,
  edge_count: 0,
  input_variables: [id === "child" ? "topic" : "question"],
  subgraph_ids: subgraphIds,
});

beforeEach(() => {
  clientMock.graphs.summaries.list.mockResolvedValue([
    g("parent", "Parent"),
    g("child", "Child graph"),
    g("loop", "Loops back", ["parent"]),
  ]);
  clientMock.releases.list.mockResolvedValue([{ release_id: "rel_1", created_at: "2026-09-24", semantic_fingerprint: "x" }]);
});
afterEach(cleanup);

describe("SubgraphConfig", () => {
  it("offers only safe graphs, lists releases, and renders a mapping row per child input", async () => {
    const set = vi.fn();
    render(
      <SubgraphConfig
        node={{ id: "sub", type: "subgraph", position: { x: 0, y: 0 }, config: { graphId: "child", version: "latest" } }}
        graphId="parent"
        set={set}
        fieldIssues={() => []}
        variables={["question"]}
      />,
      { wrapper: agentGraphWrapper(clientMock) },
    );
    await waitFor(() => expect(clientMock.releases.list).toHaveBeenCalledWith("child"));
    expect(await screen.findByRole("textbox", { name: "Input topic" })).toBeTruthy();
    expect(screen.getByText("← upstream")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open graph" }).getAttribute("href")).toBe("/graphs/child");

    screen.getByRole("combobox", { name: "Graph" }).click();
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([expect.stringContaining("Child graph")]);
  });
});
