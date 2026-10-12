import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({
  client: {
    providers: {
      ready: vi.fn(async () => ({ ready: true, message: "" })),
      models: vi.fn(async () => ({ models: [], message: "" })),
    },
  },
}));

import { ProviderModelPicker } from "./ProviderModelPicker";

afterEach(() => cleanup());

const base = { provider: "stub" as const, model: "", onProviderChange: vi.fn(), onModelChange: vi.fn() };

describe("ProviderModelPicker", () => {
  it("lists providers by default", () => {
    render(<ProviderModelPicker {...base} />);
    expect(screen.getByLabelText("Model provider")).toBeTruthy();
  });

  it("hides the provider field when only the model is being chosen", () => {
    render(<ProviderModelPicker {...base} hideProvider />);
    expect(screen.queryByLabelText("Model provider")).toBeNull();
  });

  it("lists a provider the deployment cannot serve with its reason, and does not let it be picked", () => {
    const onProviderChange = vi.fn();
    render(<ProviderModelPicker {...base} onProviderChange={onProviderChange} providerNotes={{ groq: "needs your own key" }} />);
    fireEvent.click(screen.getByLabelText("Model provider"));
    expect(screen.getByText("needs your own key")).toBeTruthy();
    fireEvent.click(screen.getByText("Groq"));
    expect(onProviderChange).not.toHaveBeenCalled();
  });
});
