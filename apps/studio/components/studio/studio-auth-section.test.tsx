import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioAuthSection } from "./studio-auth-section";

afterEach(() => cleanup());

vi.mock("next/navigation", () => ({
  usePathname: () => "/graphs",
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

describe("StudioAuthSection", () => {
  it("renders nothing when Supabase auth is not configured", () => {
    getSupabasePublicEnvMock.mockReturnValue(null);
    const { container } = render(<StudioAuthSection />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a Sign in link when configured but signed out", async () => {
    getSupabasePublicEnvMock.mockReturnValue({ url: "https://x.supabase.co", anonKey: "anon" });
    createSupabaseBrowserClientMock.mockReturnValue(fakeSupabaseClient(null));

    render(<StudioAuthSection />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
    });
  });

  it("renders the user's email and a Sign out button when signed in", async () => {
    getSupabasePublicEnvMock.mockReturnValue({ url: "https://x.supabase.co", anonKey: "anon" });
    createSupabaseBrowserClientMock.mockReturnValue(
      fakeSupabaseClient({ email: "person@example.com" }),
    );

    render(<StudioAuthSection />);

    await waitFor(() => {
      expect(screen.getByText("person@example.com")).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });
});
