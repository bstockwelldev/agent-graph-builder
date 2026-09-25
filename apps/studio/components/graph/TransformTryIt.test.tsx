import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const preview = vi.fn();
vi.mock("@/lib/api-client", () => ({ client: { transforms: { preview: (...args: unknown[]) => preview(...args) } } }));

import { parseSample, TransformTryIt } from "./TransformTryIt";

afterEach(() => {
  cleanup();
  preview.mockReset();
});

describe("parseSample", () => {
  it("parses JSON and falls back to plain text", () => {
    expect(parseSample('{"a": 1}')).toEqual({ a: 1 });
    expect(parseSample("42")).toBe(42);
    expect(parseSample("plain words")).toBe("plain words");
  });
});

describe("TransformTryIt", () => {
  it("previews the transform on the parsed sample and shows the output", async () => {
    preview.mockResolvedValue({ ok: true, output: { topic: "indexes" }, error: null });
    render(<TransformTryIt transform={{ type: "wrap", field: "topic" }} />);
    fireEvent.click(screen.getByRole("button", { name: /Try it/ }));
    fireEvent.change(screen.getByLabelText("Sample input"), { target: { value: '"indexes"' } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect((await screen.findByLabelText("Preview output")).textContent).toBe('{\n  "topic": "indexes"\n}');
    expect(preview).toHaveBeenCalledWith({ type: "wrap", field: "topic" }, "indexes");
  });

  it("shows the error a run would fail with", async () => {
    preview.mockResolvedValue({ ok: false, output: null, error: "'abc' is not a number" });
    render(<TransformTryIt transform={{ transform_id: "to_number" }} />);
    fireEvent.click(screen.getByRole("button", { name: /Try it/ }));
    fireEvent.change(screen.getByLabelText("Sample input"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect((await screen.findByRole("alert")).textContent).toBe("'abc' is not a number");
    expect(screen.queryByLabelText("Preview output")).toBeNull();
  });
});
