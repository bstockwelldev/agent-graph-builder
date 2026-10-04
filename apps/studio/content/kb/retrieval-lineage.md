---
id: retrieval-lineage
title: "Retrieval lineage"
summary: "Which documents and chunks fed which runs and nodes"
category: concept
keywords: ["lineage", "sources", "provenance", "retrieval", "chunk", "citation", "rag", "document version"]
related: ["knowledge-base-rag", "runs-and-traces"]
---
Every time an llm node retrieves from the graph's knowledge base, the run records which chunks it used: the document and its version, the chunk, its rank and score, the query, the embedding model and, for a release run, the release.

## How do I…
- See the whole picture in **Knowledge ▸ Lineage**: documents, then chunks, then runs, then nodes. Pick a document to narrow it down. Select a run to open it, or a node to open its **Run** tab.
- See what one step used in its **Run** tab: **Sources** lists the chunks that went into its prompt, best first, with their scores.

Re-uploading a document with the same name gives it a new version. Unchanged text keeps the same chunk ids, so older lineage still points at the right passage.
