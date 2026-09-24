import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({
  client: {
    tools: { list: vi.fn(async () => []) },
    providers: { models: vi.fn(async () => ({ models: [], message: "" })) },
    prompts: { list: vi.fn(async () => [{ id: "p_explain", name: "Explain", body: "Explain {question}" }]) },
  },
}));

import { NodeInspector } from "./NodeInspector";

afterEach(() => cleanup());

// studio-graph-workbench-redesign-plan.md, Wave 2.5 (STO-606): Inspector v2.
describe("NodeInspector (v2)", () => {
  const node = { id: "llm_1", type: "llm" as const, position: { x: 0, y: 0 }, config: { prompt: "Answer {question}" } };

  it("edits the name inline in the header and keeps actions out of the body", () => {
    const onLabelChange = vi.fn();
    const onDelete = vi.fn();
    render(
      <NodeInspector
        node={node}
        onConfigChange={vi.fn()}
        onDelete={onDelete}
        onDuplicate={vi.fn()}
        userLabel=""
        derivedLabel="LLM"
        onLabelChange={onLabelChange}
        templateVariables={["question"]}
      />,
    );
    fireEvent.change(screen.getByLabelText("Node name"), { target: { value: "Answerer" } });
    expect(onLabelChange).toHaveBeenCalledWith("Answerer");
    expect(screen.getByRole("tablist", { name: "Node sections" })).toBeTruthy();
    // Delete moved into the header's overflow menu -- no bottom Delete button.
    expect(screen.queryByRole("button", { name: /^Delete/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More node actions" }));
    fireEvent.click(screen.getByText("Delete node"));
    expect(onDelete).toHaveBeenCalled();
  });

  it("shows a library-bound prompt with its preview and an Open action (Wave 4a)", async () => {
    const onOpenResource = vi.fn();
    render(
      <NodeInspector
        node={{ id: "prompt_1", type: "prompt", position: { x: 0, y: 0 }, config: { template: "INLINE", promptId: "p_explain" } }}
        onConfigChange={vi.fn()}
        onDelete={vi.fn()}
        templateVariables={["question"]}
        onOpenResource={onOpenResource}
      />,
    );
    expect((screen.getByRole("radio", { name: /Library/ }) as HTMLElement).getAttribute("aria-checked")).toBe("true");
    expect((await screen.findByLabelText("Bound prompt preview")).textContent).toBe("Explain {question}");
    fireEvent.click(screen.getByRole("button", { name: "Open prompt" }));
    expect(onOpenResource).toHaveBeenCalledWith("prompts", "p_explain");
  });
});
