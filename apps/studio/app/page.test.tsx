import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

describe("HomePage", () => {
  it("renders the scaffold placeholder", () => {
    render(<HomePage />);
    expect(screen.getByText("Agent Graph Studio")).toBeTruthy();
  });
});
