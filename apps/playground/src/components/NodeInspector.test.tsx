import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NodeInspector } from "./NodeInspector";
import type { GraphNode } from "../types";

afterEach(() => {
  cleanup();
});

const toolNode: GraphNode = {
  id: "tool_1",
  type: "tool",
  position: { x: 0, y: 0 },
  config: { toolName: "lookup_topic", inputVariable: "question" },
};

describe("NodeInspector", () => {
  it("shows the local lookup blurb for Tool nodes", () => {
    render(<NodeInspector node={toolNode} onConfigChange={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/does not call the web/i)).toBeTruthy();
    expect(screen.getByText(/in-process table/i)).toBeTruthy();
  });
});
