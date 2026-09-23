import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({
  client: {
    prompts: { list: vi.fn(async () => [{ id: "p_explain", name: "Explain", body: "Explain {question} simply" }]) },
    llmProfiles: { list: vi.fn(async () => []) },
    tools: { list: vi.fn(async () => []) },
  },
}));

import { emitResourceChanged } from "@/lib/resourceEvents";
import { client } from "@/lib/api-client";
import { ResourceBindingField } from "./ResourceBindingField";

afterEach(() => cleanup());

function Harness({ initial, onOpen }: { initial?: string; onOpen?: (kind: string, id: string) => void }) {
  const [value, setValue] = useState<string | undefined>(initial);
  return (
    <>
      <span data-testid="value">{value ?? "inline"}</span>
      <ResourceBindingField kind="prompts" label="Prompt template" value={value} onChange={setValue} onOpen={onOpen} variables={["question"]}>
        <textarea aria-label="Inline template" defaultValue="INLINE" />
      </ResourceBindingField>
    </>
  );
}

// studio-graph-workbench-redesign-plan.md, Wave 4a (STO-605).
describe("ResourceBindingField", () => {
  it("shows the inline editor until Library is chosen, then binds and previews", async () => {
    const onOpen = vi.fn();
    render(<Harness onOpen={onOpen} />);
    expect(screen.getByLabelText("Inline template")).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: /Library/ }));
    expect(screen.queryByLabelText("Inline template")).toBeNull();
    fireEvent.click(await screen.findByRole("combobox", { name: /Prompt template \(library prompt\)/ }));
    fireEvent.mouseDown(await screen.findByRole("option", { name: /Explain/ }));
    expect(screen.getByTestId("value").textContent).toBe("p_explain");

    const preview = screen.getByLabelText("Bound prompt preview");
    expect(preview.textContent).toBe("Explain {question} simply");
    expect(preview.querySelector('mark[data-kind="known"]')?.textContent).toBe("{question}");

    fireEvent.click(screen.getByRole("button", { name: "Open prompt" }));
    expect(onOpen).toHaveBeenCalledWith("prompts", "p_explain");
  });

  it("switching back to Inline clears the binding and restores the inline editor", async () => {
    render(<Harness initial="p_explain" />);
    await screen.findByLabelText("Bound prompt preview");
    fireEvent.click(screen.getByRole("radio", { name: /Inline/ }));
    expect(screen.getByTestId("value").textContent).toBe("inline");
    expect(screen.getByLabelText("Inline template")).toBeTruthy();
  });

  it("flags a binding whose resource no longer exists, and refetches on resource changes", async () => {
    render(<Harness initial="p_gone" />);
    expect(await screen.findByText("Not found")).toBeTruthy();
    const calls = vi.mocked(client.prompts.list).mock.calls.length;
    emitResourceChanged();
    await waitFor(() => expect(vi.mocked(client.prompts.list).mock.calls.length).toBe(calls + 1));
  });
});
