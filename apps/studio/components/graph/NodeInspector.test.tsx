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
import { RunSelectionProvider } from "./RunSelectionContext";

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

  it("edits a transform node's type and field in its camelCase config", () => {
    const onConfigChange = vi.fn();
    render(
      <NodeInspector
        node={{ id: "shape_1", type: "transform", position: { x: 0, y: 0 }, config: { type: "coerce", targetType: "number" } }}
        onConfigChange={onConfigChange}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        userLabel=""
        derivedLabel="Transform"
        onLabelChange={vi.fn()}
        templateVariables={[]}
      />,
    );
    expect(screen.queryByRole("radio", { name: "None" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "String" }));
    expect(onConfigChange).toHaveBeenLastCalledWith({ type: "coerce", targetType: "string" });
    fireEvent.click(screen.getByRole("radio", { name: "Select" }));
    expect(onConfigChange).toHaveBeenLastCalledWith({ type: "select", pointer: "" });
  });

  it("declares a node's ports from the I/O tab and edits a kind", () => {
    const onPortsChange = vi.fn();
    const { rerender } = render(
      <NodeInspector
        node={{ id: "llm_1", type: "llm", position: { x: 0, y: 0 }, config: {} }}
        onConfigChange={vi.fn()}
        onPortsChange={onPortsChange}
        onDelete={vi.fn()}
        userLabel=""
        derivedLabel="LLM"
        onLabelChange={vi.fn()}
        templateVariables={[]}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /I\/O/ }));
    fireEvent.click(screen.getByRole("radiogroup", { name: "Input contract" }).querySelector('[aria-checked="false"]')!);
    const declared = onPortsChange.mock.calls[0][0];
    expect(declared).toEqual({ input_ports: [{ id: "input", name: "input", direction: "input", contract: { kind: "message" } }] });

    rerender(
      <NodeInspector
        node={{ id: "llm_1", type: "llm", position: { x: 0, y: 0 }, config: {}, ...declared }}
        onConfigChange={vi.fn()}
        onPortsChange={onPortsChange}
        onDelete={vi.fn()}
        userLabel=""
        derivedLabel="LLM"
        onLabelChange={vi.fn()}
        templateVariables={[]}
      />,
    );
    expect(screen.getByRole("combobox", { name: "input kind" })).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: /Required/ }));
    expect(onPortsChange).toHaveBeenLastCalledWith({
      input_ports: [{ id: "input", name: "input", direction: "input", contract: { kind: "message", required: false } }],
    });
  });

  it("sets an output port's classification and clears it back to unclassified", () => {
    const onPortsChange = vi.fn();
    const output_ports = [{ id: "output", name: "output", direction: "output" as const, contract: { kind: "message" as const } }];
    const inspector = (ports: typeof output_ports) => (
      <NodeInspector
        node={{ id: "input_1", type: "input", position: { x: 0, y: 0 }, config: {}, output_ports: ports }}
        onConfigChange={vi.fn()}
        onPortsChange={onPortsChange}
        onDelete={vi.fn()}
        userLabel=""
        derivedLabel="Input"
        onLabelChange={vi.fn()}
        templateVariables={[]}
      />
    );
    const { rerender } = render(inspector(output_ports));
    fireEvent.click(screen.getByRole("tab", { name: /I\/O/ }));
    fireEvent.click(screen.getByRole("combobox", { name: "output classification" }));
    fireEvent.mouseDown(screen.getByRole("option", { name: /^Confidential/ }));
    const classified = onPortsChange.mock.calls.at(-1)![0].output_ports;
    expect(classified[0].contract).toEqual({ kind: "message", classification: "confidential" });

    rerender(inspector(classified));
    fireEvent.click(screen.getByRole("combobox", { name: "output classification" }));
    fireEvent.mouseDown(screen.getByRole("option", { name: /^Unclassified/ }));
    expect(onPortsChange.mock.calls.at(-1)![0].output_ports[0].contract).toEqual({ kind: "message", classification: null });
  });
});

describe("NodeInspector model section", () => {
  const llm = { id: "llm_1", type: "llm" as const, position: { x: 0, y: 0 }, config: { provider: "ollama", model: "pin-m" } };
  const props = {
    onConfigChange: vi.fn(),
    onDelete: vi.fn(),
    onDuplicate: vi.fn(),
    userLabel: "",
    derivedLabel: "LLM",
    onLabelChange: vi.fn(),
    templateVariables: [],
  };

  it("has no provider picker on an LLM node: the run provider decides where it runs", () => {
    render(
      <RunSelectionProvider value={{ provider: "stub", selectedModel: "", setProvider: () => {}, setSelectedModel: () => {} }}>
        <NodeInspector node={llm} {...props} />
      </RunSelectionProvider>,
    );
    expect(screen.queryByLabelText("Model provider")).toBeNull();
    expect(screen.getByTestId("runs-on").textContent).toContain("Runs on Stub");
    expect((screen.getByLabelText("Model pin") as HTMLInputElement).value).toBe("pin-m");
  });

  it("writes a typed model pin to config.model and never touches config.provider", () => {
    const onConfigChange = vi.fn();
    render(
      <RunSelectionProvider value={{ provider: "stub", selectedModel: "", setProvider: () => {}, setSelectedModel: () => {} }}>
        <NodeInspector node={llm} {...props} onConfigChange={onConfigChange} />
      </RunSelectionProvider>,
    );
    fireEvent.change(screen.getByLabelText("Model pin"), { target: { value: "other-m" } });
    expect(onConfigChange).toHaveBeenCalledTimes(1);
    const next = onConfigChange.mock.calls[0][0] as Record<string, unknown>;
    expect(next.model).toBe("other-m");
    expect(next.provider).toBe("ollama");
  });

  it("falls back to generic wording outside a graph editor", () => {
    render(<NodeInspector node={llm} {...props} />);
    expect(screen.getByTestId("runs-on").textContent).toContain("the Run panel's provider");
  });

  it("tells decision nodes they ignore the Run panel's provider", async () => {
    const decision = { id: "d_1", type: "decision" as const, position: { x: 0, y: 0 }, config: { provider: "stub" } };
    render(<NodeInspector node={decision} {...props} />);
    // The hint is a focus/hover tooltip on the Provider field's info glyph.
    const info = screen.getByText("Provider").parentElement?.querySelector('[aria-label="More info"]');
    expect(info).toBeTruthy();
    fireEvent.focus(info as Element);
    expect((await screen.findByRole("tooltip")).textContent).toContain("Uses its own provider; the Run panel's provider does not apply here.");
  });
});

describe("NodeInspector Run tab model line", () => {
  const llm = { id: "llm_1", type: "llm" as const, position: { x: 0, y: 0 }, config: { model: "pin-m" } };
  const trace = (input: unknown) => ({
    node_id: "llm_1",
    node_type: "llm" as const,
    status: "succeeded" as const,
    input,
    output: "ok",
    started_at: "2026-10-12T00:00:00Z",
  });
  const render_ = (selectedTrace: ReturnType<typeof trace>) => {
    render(
      <NodeInspector
        node={llm}
        selectedTrace={selectedTrace}
        onConfigChange={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        userLabel=""
        derivedLabel="LLM"
        onLabelChange={vi.fn()}
        templateVariables={[]}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Run" }));
  };

  it("says what the node ran on and where the model came from", () => {
    render_(trace({ provider: "groq", model: "llama-x", modelSource: "run" }));
    expect(screen.getByTestId("ran-on").textContent).toBe("Ran on groq · llama-x: set in the Run panel");
  });

  it("omits the line for a trace with no recorded model", () => {
    render_(trace({ userPrompt: "hi" }));
    expect(screen.queryByTestId("ran-on")).toBeNull();
  });
});
