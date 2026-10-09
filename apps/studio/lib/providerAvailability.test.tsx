import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ready = vi.fn();
vi.mock("@/lib/api-client", () => ({ client: { providers: { ready: (p: string) => ready(p) } } }));

import {
  loadOllamaAvailability,
  resetOllamaAvailabilityCache,
  useOllamaAvailable,
  withoutUnavailableProviderIds,
  withoutUnavailableProviders,
} from "./providerAvailability";
import { PROVIDER_ORDER } from "./providers";

beforeEach(() => {
  ready.mockReset();
  resetOllamaAvailabilityCache();
});

describe("withoutUnavailableProviders", () => {
  const options = PROVIDER_ORDER.map((value) => ({ value, label: value }));

  it("leaves everything when Ollama is available or still unknown", () => {
    expect(withoutUnavailableProviders(options, true)).toEqual(options);
    expect(withoutUnavailableProviders(options, null)).toEqual(options);
  });

  it("drops Ollama once it is known unavailable, keeping the rest in order", () => {
    const filtered = withoutUnavailableProviders(options, false, "groq");
    expect(filtered.map((o) => o.value)).toEqual(["stub", "groq", "google", "azure", "openai_compat"]);
  });

  it("keeps an already-selected Ollama so the control never renders blank", () => {
    expect(withoutUnavailableProviders(options, false, "ollama").some((o) => o.value === "ollama")).toBe(true);
  });

  it("does the same for plain id lists", () => {
    expect(withoutUnavailableProviderIds(PROVIDER_ORDER, false, "stub")).not.toContain("ollama");
    expect(withoutUnavailableProviderIds(PROVIDER_ORDER, false, "ollama")).toContain("ollama");
    expect(withoutUnavailableProviderIds(PROVIDER_ORDER, true)).toEqual(PROVIDER_ORDER);
  });
});

describe("loadOllamaAvailability", () => {
  it("asks the backend about ollama once and caches the answer", async () => {
    ready.mockResolvedValue({ ready: false, message: "Ollama is only available in local development" });
    expect(await loadOllamaAvailability()).toBe(false);
    expect(await loadOllamaAvailability()).toBe(false);
    expect(ready).toHaveBeenCalledTimes(1);
    expect(ready).toHaveBeenCalledWith("ollama");
  });

  it("reports available when the backend says ready", async () => {
    ready.mockResolvedValue({ ready: true, message: "" });
    expect(await loadOllamaAvailability()).toBe(true);
  });

  it("fails soft: a backend error keeps Ollama listed", async () => {
    ready.mockRejectedValue(new Error("network down"));
    expect(await loadOllamaAvailability()).toBe(true);
  });

  it("fails soft when the client has no ready() at all (partial mocks)", async () => {
    ready.mockImplementation(() => {
      throw new TypeError("client.providers.ready is not a function");
    });
    expect(await loadOllamaAvailability()).toBe(true);
  });
});

describe("useOllamaAvailable", () => {
  it("is null until the backend answers, then the answer", async () => {
    ready.mockResolvedValue({ ready: false, message: "" });
    const { result } = renderHook(() => useOllamaAvailable());
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(false));
  });
});
