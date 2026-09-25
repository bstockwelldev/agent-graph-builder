import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RAW_SYNTAX_STORAGE_KEY } from "@/lib/jsonEditor";
import { RawConfigEditor } from "./RawConfigEditor";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const textarea = () => screen.getByRole("textbox") as HTMLTextAreaElement;

describe("RawConfigEditor", () => {
  it("shows JSON by default and converts to YAML on the YAML tab", () => {
    render(<RawConfigEditor value={{ provider: "groq", temperature: 0.2 }} onApply={vi.fn()} />);
    expect(JSON.parse(textarea().value)).toEqual({ provider: "groq", temperature: 0.2 });
    fireEvent.click(screen.getByRole("tab", { name: /YAML/ }));
    expect(textarea().value).toBe("provider: groq\ntemperature: 0.2\n");
    expect(window.localStorage.getItem(RAW_SYNTAX_STORAGE_KEY)).toBe("yaml");
  });

  it("applies YAML edits as a plain object", () => {
    window.localStorage.setItem(RAW_SYNTAX_STORAGE_KEY, "yaml");
    const onApply = vi.fn();
    render(<RawConfigEditor value={{ provider: "groq" }} onApply={onApply} />);
    fireEvent.change(textarea(), { target: { value: "provider: stub\nmodel: tiny\n" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith({ provider: "stub", model: "tiny" });
  });

  it("keeps unapplied edits when switching views, and blocks switching on a syntax error", () => {
    render(<RawConfigEditor value={{ a: 1 }} onApply={vi.fn()} />);
    fireEvent.change(textarea(), { target: { value: '{"a": 2}' } });
    fireEvent.click(screen.getByRole("tab", { name: /YAML/ }));
    expect(textarea().value).toBe("a: 2\n");
    fireEvent.change(textarea(), { target: { value: "a: [2" } });
    fireEvent.click(screen.getByRole("tab", { name: /JSON/ }));
    expect(screen.getByRole("alert").textContent).toMatch(/Invalid YAML.*fix it before switching to JSON/);
    expect(textarea().value).toBe("a: [2");
  });

  it("follows value changes when there are no edits, and flags them when there are", () => {
    const { rerender } = render(<RawConfigEditor value={{ a: 1 }} onApply={vi.fn()} />);
    rerender(<RawConfigEditor value={{ a: 2 }} onApply={vi.fn()} />);
    expect(JSON.parse(textarea().value)).toEqual({ a: 2 });
    fireEvent.change(textarea(), { target: { value: '{"a": 9}' } });
    rerender(<RawConfigEditor value={{ a: 3 }} onApply={vi.fn()} />);
    expect(JSON.parse(textarea().value)).toEqual({ a: 9 });
    expect(screen.getByRole("status").textContent).toMatch(/Changed elsewhere/);
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(JSON.parse(textarea().value)).toEqual({ a: 3 });
  });

  it("shows validator errors without applying", () => {
    const onApply = vi.fn();
    render(<RawConfigEditor value={{ a: 1 }} onApply={onApply} />);
    fireEvent.change(textarea(), { target: { value: "[1]" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByRole("alert").textContent).toMatch(/must be a JSON object/);
    expect(onApply).not.toHaveBeenCalled();
  });
});
