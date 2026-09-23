import { cleanup, render, screen } from "@testing-library/react";
import { ReactFlowProvider, type NodeProps } from "@xyflow/react";
import { afterEach, describe, expect, it } from "vitest";

import { GraphNodeView, type GraphNodeData } from "./GraphNodeView";
import { NODE_CARD_WIDTH } from "@/layout/nodeGeometry";

afterEach(() => cleanup());

function renderNode(data: Partial<GraphNodeData>, selected = false) {
  const props = {
    id: "llm_1",
    type: "llm",
    selected,
    data: { nodeType: "llm", label: "qwen2.5:3b", config: { provider: "ollama", model: "qwen2.5:3b" }, ...data },
    dragging: false,
    zIndex: 0,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    selectable: true,
    deletable: true,
    draggable: true,
  } as unknown as NodeProps;
  render(
    <ReactFlowProvider>
      <GraphNodeView {...props} />
    </ReactFlowProvider>,
  );
  return screen.getByTestId("graph-node-card");
}

// studio-graph-workbench-redesign-plan.md, Slice 4.
describe("GraphNodeView", () => {
  it("renders at the shared fixed width so layout never undershoots it", () => {
    const card = renderNode({});
    expect(card.style.width).toBe(`${NODE_CARD_WIDTH}px`);
  });

  it("shows type, title, summary, and I/O at rest", () => {
    renderNode({});
    expect(screen.getByText("LLM")).toBeTruthy();
    expect(screen.getByText("qwen2.5:3b")).toBeTruthy();
    expect(screen.getByText("via ollama")).toBeTruthy();
    expect(screen.getByText("in: message")).toBeTruthy();
    expect(screen.getByText("out: message")).toBeTruthy();
  });

  it("uses the user's name as the title and moves the model into the summary", () => {
    renderNode({ label: "Intent classifier", userLabel: "Intent classifier" });
    expect(screen.getByText("Intent classifier")).toBeTruthy();
    expect(screen.getByText("ollama · qwen2.5:3b")).toBeTruthy();
  });

  it("shows a run status pill and an issue badge with a count", () => {
    renderNode({
      status: "failed",
      compileIssue: { severity: "warning", caption: "first", messages: ["first", "second"] },
    });
    expect(screen.getByRole("status", { name: "failed" })).toBeTruthy();
    expect(screen.getByLabelText("2 warnings")).toBeTruthy();
  });

  it("keeps the selection ring and the run status visible at the same time", () => {
    const card = renderNode({ status: "failed" }, true);
    expect(card.style.outline).toContain("solid");
    expect(card.style.outline).not.toContain("transparent");
    expect(card.dataset.status).toBe("failed");
  });

  it("marks a stale result", () => {
    renderNode({ status: "succeeded", statusStale: true });
    expect(screen.getByRole("status", { name: "succeeded (stale)" })).toBeTruthy();
  });
});
