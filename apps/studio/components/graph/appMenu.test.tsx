import { describe, expect, it, vi } from "vitest";

import { RESOURCE_KINDS } from "@/components/studio/resource-kinds";
import type { StudioAccount } from "@/hooks/use-studio-account";

import { buildAppMenuActions } from "./appMenu";

const signedOut: StudioAccount = { configured: false, user: null, label: "", signInHref: "/login?next=%2F", signOut: vi.fn() };
const build = (overrides: Partial<Parameters<typeof buildAppMenuActions>[0]> = {}) =>
  buildAppMenuActions({ openGraphPicker: vi.fn(), openPanel: vi.fn(), account: signedOut, goTo: vi.fn(), ...overrides });

// canvas-first-landing-plan.md §5: the header's App group, and AC 6.
describe("App menu", () => {
  it("lists Open graph…, the 8 resource kinds, Analytics, workspace policies and the GenUI catalog", () => {
    const actions = build();
    expect(actions.map((action) => action.label)).toEqual(["Open graph…", "Resources", "Analytics", "Workspace policies", "GenUI catalog"]);
    expect(actions[0]).toMatchObject({ shortcut: "⌘O", groupLabel: "App" });
    expect(actions[1].submenu?.map((item) => item.label)).toEqual(RESOURCE_KINDS.map((kind) => kind.panelTitle));
    expect(actions[1].submenu).toHaveLength(8);
  });

  it("opens the matching panels and the picker", () => {
    const openPanel = vi.fn();
    const openGraphPicker = vi.fn();
    const actions = build({ openPanel, openGraphPicker });
    actions[0].onClick();
    expect(openGraphPicker).toHaveBeenCalledTimes(1);
    actions[1].submenu?.[6].onClick();
    expect(openPanel).toHaveBeenLastCalledWith("datasets");
    actions[2].onClick();
    expect(openPanel).toHaveBeenLastCalledWith("analytics");
    actions[3].onClick();
    expect(openPanel).toHaveBeenLastCalledWith("workspacePolicies");
    actions[4].onClick();
    expect(openPanel).toHaveBeenLastCalledWith("genui");
  });

  it("starts the App group at Resources when there is no picker", () => {
    const actions = build({ openGraphPicker: undefined });
    expect(actions[0]).toMatchObject({ label: "Resources", groupLabel: "App", separatorBefore: true });
  });

  it("adds no account entries when auth isn't configured", () => {
    expect(build().some((action) => action.label === "Sign in" || action.label === "Sign out")).toBe(false);
  });

  it("offers Sign in when signed out, going back to where you are", () => {
    const goTo = vi.fn();
    const actions = build({ account: { ...signedOut, configured: true, user: null }, goTo });
    const signIn = actions.find((action) => action.label === "Sign in")!;
    signIn.onClick();
    expect(goTo).toHaveBeenCalledWith("/login?next=%2F");
  });

  it("shows who is signed in, and Sign out", () => {
    const signOut = vi.fn();
    const actions = build({ account: { ...signedOut, configured: true, user: { id: "u1" } as never, label: "person@example.com", signOut } });
    expect(actions.find((action) => action.label === "person@example.com")).toMatchObject({ disabled: true });
    actions.find((action) => action.label === "Sign out")!.onClick();
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
