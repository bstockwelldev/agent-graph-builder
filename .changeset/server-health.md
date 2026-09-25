---
"@bstockwelldev/agent-graph-sdk": minor
---

Add `client.system.health()` (`GET /api/health`) returning `{ ok, storage_backend, message? }`, so clients can tell whether runs are stored in a shared backend.
