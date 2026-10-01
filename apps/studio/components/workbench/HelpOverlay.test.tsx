import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ client: { system: { health: vi.fn(async () => ({ commit: null })) } } }));

window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

import { HelpLink } from "@/components/graph/HelpLink";
import { HelpOverlay } from "./HelpOverlay";
import { WorkbenchProvider, useWorkbench } from "./WorkbenchProvider";

afterEach(() => cleanup());

function OpenHelp({ articleId }: { articleId?: string }) {
  const workbench = useWorkbench();
  useEffect(() => workbench.open("help", articleId ? { articleId } : undefined), []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// canvas-workbench-ergonomics-plan.md §11: the searchable Help panel.
describe("Help panel", () => {
  it("searches articles and reads one, following in-article and related links", () => {
    render(
      <WorkbenchProvider>
        <OpenHelp />
        <HelpOverlay />
      </WorkbenchProvider>,
    );
    const dialog = screen.getByRole("dialog", { name: "Help" });
    fireEvent.change(within(dialog).getByRole("searchbox", { name: "Search help" }), { target: { value: "json pointer" } });
    const results = within(dialog).getByRole("list", { name: "Help articles" });
    fireEvent.click(within(results).getAllByRole("button")[0]);
    expect(within(dialog).getByRole("heading", { name: "Transforms" })).toBeTruthy();

    // Related ▸ Transform node.
    fireEvent.click(within(dialog).getByRole("button", { name: "Transform node" }));
    expect(within(dialog).getByRole("heading", { name: "Transform node" })).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: /All articles/ }));
    fireEvent.change(within(dialog).getByRole("searchbox", { name: "Search help" }), { target: { value: "routing" } });
    fireEvent.click(within(dialog).getAllByRole("button", { name: /Routing with routers/ })[0]);
    // An in-body [Routing lab](kb:routing-lab) link opens that article.
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Routing lab" })[0]);
    expect(within(dialog).getByRole("heading", { name: "Routing lab" })).toBeTruthy();
  });

  it("opens straight on an article from a help link, and keeps the shortcuts", () => {
    render(
      <WorkbenchProvider>
        <HelpLink articleId="edge-default" />
        <HelpOverlay />
      </WorkbenchProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Help: Fallback edge" }));
    const dialog = screen.getByRole("dialog", { name: "Help" });
    expect(within(dialog).getByRole("heading", { name: "Fallback edge" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("tab", { name: "Shortcuts" }));
    expect(within(dialog).getByText("Command palette — jump to any route, panel or help article")).toBeTruthy();
  });

  it("says when nothing matches", () => {
    render(
      <WorkbenchProvider>
        <OpenHelp articleId="no-such-article" />
        <HelpOverlay />
      </WorkbenchProvider>,
    );
    fireEvent.change(screen.getByRole("searchbox", { name: "Search help" }), { target: { value: "zzz-nothing" } });
    expect(screen.getByRole("status").textContent).toContain("No articles match");
  });
});
