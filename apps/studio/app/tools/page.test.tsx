import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ToolsPage from "./page";

afterEach(() => cleanup());

const listMock = vi.fn(async () => [
  {
    id: "tool_demo",
    description: "Demo tool",
    parameters_json: "{}",
    requires_approval: false,
  },
]);

vi.mock("@/lib/api-client", () => ({
  client: {
    tools: {
      list: (...args: unknown[]) => listMock(...args),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

describe("ToolsPage", () => {
  it("lists tools loaded from the SDK client", async () => {
    render(<ToolsPage />);

    await waitFor(() => expect(screen.getByText("tool_demo")).toBeTruthy());
    expect(screen.getByText("Demo tool")).toBeTruthy();
    expect(listMock).toHaveBeenCalledTimes(1);
  });

  it("renders a New tool button", async () => {
    render(<ToolsPage />);
    await waitFor(() => expect(screen.getByText("tool_demo")).toBeTruthy());

    expect(screen.getByRole("button", { name: "New tool" })).toBeTruthy();
  });
});
