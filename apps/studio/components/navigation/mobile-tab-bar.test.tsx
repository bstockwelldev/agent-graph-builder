import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Menu, MessageSquare, Workflow } from "lucide-react";

import { isRailItemActive, STUDIO_RAIL_ITEMS } from "@/components/studio/studio-nav";
import { MobileTabBar } from "./mobile-tab-bar";

afterEach(() => cleanup());

// Roadmap P3 "Mobile bottom nav tray" (STO-607).
describe("MobileTabBar", () => {
  it("marks the current destination, reflects toggles, and exposes menus", () => {
    const onChat = vi.fn();
    const onMore = vi.fn();
    render(
      <MobileTabBar
        aria-label="Studio tabs"
        tabs={[
          { id: "graphs", label: "Graphs", icon: <Workflow />, href: "/graphs", active: true },
          { id: "chat", label: "Chat", icon: <MessageSquare />, active: false, onClick: onChat },
          { id: "more", label: "More", icon: <Menu />, hasPopup: "menu", active: true, onClick: onMore },
        ]}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Studio tabs" });
    expect(nav).toBeTruthy();
    expect(screen.getByRole("link", { name: "Graphs" }).getAttribute("aria-current")).toBe("page");
    const chat = screen.getByRole("button", { name: "Chat" });
    expect(chat.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(chat);
    expect(onChat).toHaveBeenCalled();
    const more = screen.getByRole("button", { name: "More" });
    expect(more.getAttribute("aria-haspopup")).toBe("menu");
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(more.hasAttribute("aria-pressed")).toBe(false);
  });

  it("derives the global tabs from the rail, so Resources is current on a resource page", () => {
    render(
      <MobileTabBar
        aria-label="Studio tabs"
        tabs={STUDIO_RAIL_ITEMS.map(({ href, label, icon: Icon, matches }) => ({
          id: href,
          label,
          icon: <Icon />,
          href,
          active: isRailItemActive("/prompts", matches),
        }))}
      />,
    );
    expect(screen.getByRole("link", { name: "Resources" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Graphs" }).getAttribute("aria-current")).toBeNull();
  });
});
