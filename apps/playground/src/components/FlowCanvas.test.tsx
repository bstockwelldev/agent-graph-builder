import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Node } from "@xyflow/react";
import type { GraphNodeData } from "./nodes/GraphNodeView";
import { FlowCanvas } from "./FlowCanvas";

const { fitView } = vi.hoisted(() => ({ fitView: vi.fn() }));

const orientationState = vi.hoisted(() => ({
  paneSize: { width: 0, height: 0 },
}));

vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  return {
    ...actual,
    useReactFlow: () => ({ fitView }),
    ReactFlow: ({ children }: { children?: React.ReactNode }) => <div data-testid="react-flow">{children}</div>,
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

vi.mock("../hooks/useCanvasOrientation", () => ({
  useCanvasOrientation: () => ({
    effectiveRankDir: "LR",
    paneSize: orientationState.paneSize,
    liveAnnouncement: "",
    clearLiveAnnouncement: () => undefined,
  }),
}));

const sampleNodes: Node<GraphNodeData>[] = [
  {
    id: "input_1",
    position: { x: 0, y: 0 },
    data: { nodeType: "input", label: "input_1", config: {} },
    type: "input",
  },
];

function renderCanvas() {
  return render(
    <FlowCanvas
      graphId="g1"
      nodes={sampleNodes}
      edges={[]}
      setNodes={() => undefined}
      onNodesChange={() => undefined}
      onEdgesChange={() => undefined}
      onConnect={undefined}
      authoringEnabled
      nodeTypes={{}}
      reducedMotion
      graphOrientation="auto"
      onNodeClick={() => undefined}
      onEdgeClick={() => undefined}
      onPaneClick={() => undefined}
      liveAnnouncement=""
      onLiveAnnouncement={() => undefined}
      onClearLiveAnnouncement={() => undefined}
    />,
  );
}

function flushFitView() {
  act(() => {
    vi.advanceTimersByTime(200);
  });
}

describe("FlowCanvas fitView calls", () => {
  beforeEach(() => {
    fitView.mockClear();
    orientationState.paneSize = { width: 0, height: 0 };
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
      window.setTimeout(() => cb(0), 0),
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      window.clearTimeout(id);
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not call fitView when the pane size is zero", () => {
    renderCanvas();
    flushFitView();
    expect(fitView).not.toHaveBeenCalled();
  });

  it("calls fitView after the pane has a positive size", () => {
    orientationState.paneSize = { width: 800, height: 600 };
    renderCanvas();
    flushFitView();
    expect(fitView).toHaveBeenCalled();
    expect(fitView).toHaveBeenCalledWith(
      expect.objectContaining({
        padding: 0.18,
        duration: 0,
      }),
    );
  });
});
