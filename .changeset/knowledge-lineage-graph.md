---
"@bstockwelldev/agent-graph-sdk": minor
---

Retrieval lineage: `client.knowledge.lineageGraph(graphId, { runId?, documentId?, limit? })` returns documents → chunks → runs → nodes (`LineageGraph`). Lineage entries add `document_version`, `rank`, `query`, `embedding_model` and `release_id`; knowledge documents add `content_hash` and `version`.
