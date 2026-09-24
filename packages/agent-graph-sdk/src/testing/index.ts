/**
 * `@bstockwelldev/agent-graph-sdk/testing` (SDK 5/7, STO-620): an in-memory
 * mock of the whole API as MSW handlers, plus fixture factories. Needs the
 * `msw` peer dependency (v2); nothing else in the SDK imports this entry.
 */
export { createHandlers, createMockStore, mockRoutes, RESOURCE_KINDS } from "./handlers.js";
export type { CreateHandlersOptions, MockSeed, MockStore, ResourceKind } from "./handlers.js";
export {
  demoGraph,
  FIXED_TIME,
  makeChatSession,
  makeDataset,
  makeDiagnostic,
  makeEffectivePolicy,
  makeFixture,
  makeGraph,
  makePolicyCatalog,
  makePolicyException,
  makePrompt,
  makeRelease,
  makeRun,
  makeTrace,
  releaseIndexEntry,
} from "./fixtures.js";
