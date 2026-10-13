import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccountControl, EmptyCanvas } from "./EmptyCanvas";

afterEach(() => cleanup());

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

const { getSupabasePublicEnvMock } = vi.hoisted(() => ({
  getSupabasePublicEnvMock: vi.fn(),
}));

vi.mock("@/lib/supabase/public-env", () => ({
  getSupabasePublicEnv: getSupabasePublicEnvMock,
}));

const { createSupabaseBrowserClientMock } = vi.hoisted(() => ({
  createSupabaseBrowserClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: createSupabaseBrowserClientMock,
}));

function fakeSupabaseClient(user: { email?: string } | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  };
}

describe("EmptyCanvas", () => {
  it("offers the way forward, and is styled from the canvas tokens rather than shadcn", () => {
    getSupabasePublicEnvMock.mockReturnValue(null);
    const onOpenPicker = vi.fn();
    const { container } = render(<EmptyCanvas onOpenPicker={onOpenPicker} />);
    screen.getByRole("button", { name: "Open or create a graph" }).click();
    expect(onOpenPicker).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "No graph open" })).toBeTruthy();
    // No shadcn primitive (every one carries a data-slot), so none of the CRUD pages' look.
    expect(container.querySelector("[data-slot]")).toBeNull();
  });
});

// The account tests are ported from the retired StudioAuthSection test (canvas-first landing plan, Phase 3).
describe("AccountControl", () => {
  it("renders nothing when Supabase auth is not configured", () => {
    getSupabasePublicEnvMock.mockReturnValue(null);
    const { container } = render(<AccountControl />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a Sign in link, back to the current page, when configured but signed out", async () => {
    getSupabasePublicEnvMock.mockReturnValue({ url: "https://x.supabase.co", anonKey: "anon" });
    createSupabaseBrowserClientMock.mockReturnValue(fakeSupabaseClient(null));

    render(<AccountControl />);

    const link = await screen.findByRole("link", { name: "Sign in" });
    expect(link.getAttribute("href")).toBe("/login?next=%2F");
  });

  it("renders the user's email and a Sign out button when signed in", async () => {
    getSupabasePublicEnvMock.mockReturnValue({ url: "https://x.supabase.co", anonKey: "anon" });
    createSupabaseBrowserClientMock.mockReturnValue(fakeSupabaseClient({ email: "person@example.com" }));

    render(<AccountControl />);

    await waitFor(() => {
      expect(screen.getByText("person@example.com")).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });
});
