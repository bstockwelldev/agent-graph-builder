import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CanvasActionsProvider, type CanvasActions } from "../canvasActions";
import { GroupFrame } from "./GroupFrame";

// Wave 7b (STO-611): the group frame / collapsed card.

vi.mock("@xyflow/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@xyflow/react")>()),
  Handle: () => null,
}));

afterEach(cleanup);

function renderFrame(data: Partial<ComponentProps<typeof GroupFrame>["data"]>) {
  const actions = { toggleGroup: vi.fn(), renameGroup: vi.fn() } as unknown as CanvasActions;
  const props = {
    data: { groupId: "g1", label: "Answer", color: "#8fbaff", count: 2, collapsed: false, memberTypes: ["prompt", "llm"], dimmed: false, horizontal: true, ...data },
  } as unknown as ComponentProps<typeof GroupFrame>;
  render(
    <CanvasActionsProvider value={actions}>
      <GroupFrame {...props} />
    </CanvasActionsProvider>,
  );
  return actions;
}

describe("GroupFrame", () => {
  it("expanded: shows label and count, collapses from the header toggle", () => {
    const actions = renderFrame({});
    expect(screen.getByRole("group", { name: "Group Answer" })).toBeTruthy();
    expect(screen.getByText("2 nodes")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Collapse group Answer" }));
    expect(actions.toggleGroup).toHaveBeenCalledWith("g1");
  });

  it("collapsed: renders a card that expands on double-click", () => {
    const actions = renderFrame({ collapsed: true });
    const card = screen.getByRole("group", { name: "Group Answer (collapsed)" });
    expect(screen.getByRole("button", { name: "Expand group Answer" }).getAttribute("aria-expanded")).toBe("false");
    fireEvent.doubleClick(card);
    expect(actions.toggleGroup).toHaveBeenCalledWith("g1");
  });

  it("renaming: commits on Enter and cancels on Escape", () => {
    const actions = renderFrame({ renaming: true });
    const input = screen.getByRole("textbox", { name: "Group name" });
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "Answer path" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(actions.renameGroup).toHaveBeenLastCalledWith("g1", "Answer path");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(actions.renameGroup).toHaveBeenLastCalledWith("g1", null);
  });
});
