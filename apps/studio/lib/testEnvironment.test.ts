import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, expect, it } from "vitest";

// Guards the test environment (vitest.config.ts): on Node 22+, Node's fetch
// rejects a jsdom AbortSignal, so any hook that passes one -- e.g. the
// SDK's useRun stream -- would fail or hang under stock jsdom.

const server = setupServer(http.get("http://studio.test/ping", () => HttpResponse.json({ ok: true })));
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

it("fetch accepts an AbortController signal, with jsdom's document available", async () => {
  expect(typeof document).toBe("object");
  const response = await fetch("http://studio.test/ping", { signal: new AbortController().signal });
  expect(await response.json()).toEqual({ ok: true });
});
