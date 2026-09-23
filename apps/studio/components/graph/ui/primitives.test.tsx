import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

import { Combobox, filterComboboxOptions } from "./Combobox";
import { Field } from "./Field";
import { IconTabs } from "./IconTabs";
import { NumberStepper } from "./NumberStepper";
import { SegmentedControl } from "./SegmentedControl";
import { TemplateEditor } from "./TemplateEditor";
import { Toggle } from "./Toggle";

afterEach(() => cleanup());

// studio-graph-workbench-redesign-plan.md, Wave 2.5 graph-kit primitives.
describe("Toggle", () => {
  it("is a labelled switch", () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Allow URLs" />);
    const toggle = screen.getByRole("switch", { name: "Allow URLs" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("NumberStepper", () => {
  it("steps within bounds", () => {
    const onChange = vi.fn();
    render(<NumberStepper value={1} min={1} max={3} onChange={onChange} aria-label="Iterations" />);
    expect((screen.getByRole("button", { name: "Decrease" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Increase" }));
    expect(onChange).toHaveBeenCalledWith(2);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Iterations" }), { target: { value: "9" } });
    expect(onChange).toHaveBeenLastCalledWith(3);
  });
});

describe("SegmentedControl", () => {
  it("is a radio group with arrow-key selection", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        aria-label="Kind"
        value="a"
        onChange={onChange}
        options={[
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ]}
      />,
    );
    const a = screen.getByRole("radio", { name: "A" });
    expect(a.getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(a, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("b");
  });
});

describe("IconTabs", () => {
  it("renders tabs with counts and arrow-key navigation", () => {
    const onChange = vi.fn();
    render(
      <IconTabs
        aria-label="Sections"
        activeId="one"
        onChange={onChange}
        tabs={[
          { id: "one", label: "One", icon: <span /> },
          { id: "two", label: "Two", icon: <span />, count: 3 },
          { id: "raw", label: "Raw", icon: <span />, iconOnly: true },
        ]}
      />,
    );
    expect(screen.getByRole("tab", { name: "One" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: /Two/ }).textContent).toContain("3");
    expect(screen.getByRole("tab", { name: "Raw" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("tab", { name: "One" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("two");
  });
});

describe("Field", () => {
  it("associates its label and shows inline issues", () => {
    render(
      <Field label="Model" issues={[{ code: "X", message: "Model missing", severity: "error", blocking: true }]}>
        {(id) => <input id={id} />}
      </Field>,
    );
    expect(screen.getByLabelText("Model")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Issues for this field" }).textContent).toContain("Model missing");
  });
});

describe("Combobox", () => {
  const options = [
    { value: "ollama", label: "Ollama", group: "Local" },
    { value: "groq", label: "Groq", description: "Hosted", group: "Hosted" },
  ];

  it("filters options", () => {
    expect(filterComboboxOptions(options, "host").map((o) => o.value)).toEqual(["groq"]);
  });

  it("opens, searches, and selects with the keyboard", () => {
    const onChange = vi.fn();
    render(<Combobox aria-label="Provider" value="ollama" options={options} onChange={onChange} />);
    const trigger = screen.getByRole("combobox", { name: "Provider" });
    expect(trigger.textContent).toContain("Ollama");
    fireEvent.click(trigger);
    const search = screen.getByRole("searchbox");
    fireEvent.change(search, { target: { value: "gr" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("groq");
  });

  it("can commit a custom value", () => {
    const onChange = vi.fn();
    render(<Combobox aria-label="Model" value="" options={options} onChange={onChange} allowCustom />);
    fireEvent.click(screen.getByRole("combobox", { name: "Model" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "my-model" } });
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("my-model");
  });
});

describe("TemplateEditor", () => {
  function Harness({ onSubmit }: { onSubmit?: () => void }) {
    const [value, setValue] = useState("Answer {question} for {who}");
    return <TemplateEditor aria-label="Template" value={value} onChange={setValue} variables={["question", "upstream"]} onSubmit={onSubmit} />;
  }

  it("highlights known and unknown variables", () => {
    const { container } = render(<Harness />);
    const marks = container.querySelectorAll("mark");
    expect([...marks].map((m) => [m.textContent, m.getAttribute("data-kind")])).toEqual([
      ["{question}", "known"],
      ["{who}", "unknown"],
    ]);
  });

  it("autocompletes a variable after typing {", () => {
    render(<Harness />);
    const textarea = screen.getByRole("textbox", { name: "Template" }) as HTMLTextAreaElement;
    fireEvent.focus(textarea);
    fireEvent.change(textarea, { target: { value: "Use {up", selectionStart: 7 } });
    const option = screen.getByRole("option", { name: "{upstream}" });
    fireEvent.mouseDown(option);
    expect(textarea.value).toBe("Use {upstream}");
  });

  it("submits on Cmd/Ctrl+Enter", () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Template" }), { key: "Enter", ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
