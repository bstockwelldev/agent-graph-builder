import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectKindMenu } from "./ConnectKindMenu";

afterEach(() => {
  cleanup();
});

describe("ConnectKindMenu", () => {
  it("shows Always / Match text / Fallback glossary", () => {
    render(<ConnectKindMenu x={20} y={20} targetLabel="llm_1" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("Always")).toBeTruthy();
    expect(screen.getByText("Match text")).toBeTruthy();
    expect(screen.getByText("Fallback")).toBeTruthy();
    expect(screen.getByText("Always follow this path")).toBeTruthy();
    fireEvent.click(screen.getByText("Match text"));
    expect(screen.getByText(/previous LLM output \(not the Prompt template\)/i)).toBeTruthy();
  });
});
