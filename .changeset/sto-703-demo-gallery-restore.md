---
"@bstockwelldev/agent-graph-sdk": patch
---

Restore `client.demos.list()` over `GET /api/demos` (STO-703): the SDK resource removed in f1f92de left the studio's graph picker stuck on "Loading graphs…" forever and broke studio typecheck. The backend serves the seeded, read-only gallery again from `demo_graph.SEEDED_DEMOS`; a failing gallery call still degrades to "no demos" via the existing `Promise.allSettled` in `useGraphLibrary`.
