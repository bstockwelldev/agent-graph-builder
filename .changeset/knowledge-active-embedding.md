---
"@bstockwelldev/agent-graph-sdk": minor
---

Knowledge summaries now include `embeddingDimensions`, `activeEmbeddingProvider`, `activeEmbeddingModelId` and `embeddingUnavailableReason`, which say which embedding provider and model uploads and retrieval use right now (Supabase `gte-small` is the new default provider). All four are optional, so the client still accepts responses from older backends.
