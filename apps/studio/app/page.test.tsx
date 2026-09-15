import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

describe("HomePage", () => {
  it("renders the themed shell with a shadcn Button", () => {
    render(<HomePage />);
    expect(screen.getByText("Agent Graph Studio")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Compile" })).toBeTruthy();
  });
});
