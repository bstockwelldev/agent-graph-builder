import { ReactFlowProvider } from "@xyflow/react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GraphNodeView } from "./GraphNodeView";
import { shell } from "../../theme";

afterEach(() => {
  cleanup();
});

describe("GraphNodeView handles", () => {
  it("uses a 44px hit target on source and target handles", () => {
    const { container } = render(
      <ReactFlowProvider>
        <GraphNodeView
          id="prompt_1"
          data={{ nodeType: "prompt", label: "prompt", config: {} }}
          selected={false}
          type="prompt"
          dragging={false}
          zIndex={1}
          isConnectable
          positionAbsoluteX={0}
          positionAbsoluteY={0}
        />
      </ReactFlowProvider>,
    );
    const handles = container.querySelectorAll(".react-flow__handle");
    expect(handles.length).toBeGreaterThan(0);
    handles.forEach((handle) => {
      const style = (handle as HTMLElement).style;
      expect(style.minWidth || style.width).toBe(`${shell.touchTarget.min}px`);
      expect(style.minHeight || style.height).toBe(`${shell.touchTarget.min}px`);
    });
    const target = container.querySelector(".react-flow__handle-left");
    const source = container.querySelector(".react-flow__handle-right");
    expect(target?.getAttribute("aria-label")).toMatch(/Connect to prompt node/i);
    expect(source?.getAttribute("aria-label")).toMatch(/Connect from prompt node/i);
    expect(target?.getAttribute("title")).toMatch(/Connect to prompt node/i);
  });
});
