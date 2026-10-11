---
"@bstockwelldev/agent-graph-sdk": minor
---

New `extract` node type: document ingestion (upload or variable → text/OCR/vision pipeline → schema-validated JSON). Adds `extract` to the `NodeType` enum, `defaultConfig`/`labelFor`/`summaryFor` cases, the `documentFactsSchema()` default output schema, and the `extract.upload` API client method with its response schema.
