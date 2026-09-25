import { builtinEnvironments, type Environment } from "vitest/environments";

/**
 * jsdom, but keeping Node's own AbortController/AbortSignal.
 *
 * Tests here run on Node's fetch (undici), which msw intercepts. Since
 * Node 22, undici brand-checks `RequestInit.signal` against Node's
 * AbortSignal, so a jsdom AbortSignal (what `new AbortController()` gives
 * under the stock jsdom environment) fails every fetch that passes one
 * -- e.g. `useRun`'s stream, which then retries with backoff and looks
 * like a hang. Node 20 only duck-typed the signal, which is why it
 * passed in CI but not on newer local Node. Browsers are unaffected:
 * their fetch and AbortController come from the same realm.
 *
 * Applied to `src/react/**` by vitest.config.ts (a docblock can only name
 * a built-in or packaged environment, not a path), and to every Studio test
 * by apps/studio/vitest.config.ts.
 */
export default {
  name: "jsdom-node-abort",
  transformMode: "web",
  async setup(global, options) {
    const { AbortController, AbortSignal } = global;
    const jsdom = await builtinEnvironments.jsdom.setup(global, options);
    Object.assign(global, { AbortController, AbortSignal });
    return jsdom;
  },
} satisfies Environment;
