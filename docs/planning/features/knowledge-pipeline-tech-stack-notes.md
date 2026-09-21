---
title: Knowledge-pipeline tech-stack notes
status: reference
capability: knowledge-pipeline-tech-stack
depends_on: []
linear_issue: none
last_updated: 2026-09-21
---

# Knowledge-pipeline tech-stack notes

> **Status:** Reference. A candidate stack to revisit when the current RAG
> implementation is next upgraded — not a committed build plan, not
> approved for implementation, and no code changes are implied by this
> document.

## Context

`backend/app/knowledge.py` and `backend/app/embedding_model.py` implement
the graph-level knowledge base / RAG feature shipped in studio-consolidation
Phase 5: substring-boundary chunking (`chunk_text`), direct OpenAI/Google
embedding API calls per chunk, cosine-similarity top-K retrieval over an
in-memory list, and JSON-blob storage of the whole entry (documents +
chunks + raw float vectors) via `storage.save_resource("knowledge", ...)`.
No OCR, no document-layout parsing, no real vector database, no reranking.
It works for the `.txt`/`.md` uploads it was scoped for, but doesn't scale
to PDFs, scanned documents, tables, or knowledge bases large enough that
loading every vector into memory per query stops being viable.

The table below is a candidate replacement stack for that pipeline,
provided by the user for future reference — relevant to the P2 "Retrieval/
document lineage graph" roadmap row and its lineage-tracking work
(`KnowledgeLineageEntry` in `backend/app/models.py`, recorded by
`knowledge.py`'s `augment_system_with_knowledge`), since any pipeline
upgrade would need to keep recording which chunk fed which node's output
the same way the current one does. Recorded here for revisiting, not for
immediate adoption.

## Candidate stack

| Layer | Recommended default |
| ----- | -------------------- |
| Parsing, OCR, layout, tables | Docling |
| LangChain ingestion integration | langchain-docling |
| Indexing and retrieval | LlamaIndex + Docling reader/node parser |
| Embeddings | FastEmbed initially; Sentence Transformers if a specific model or reranker is needed |
| Vector store | Qdrant |
| Stateful extraction workflow | Existing LangGraph installation |
| Tracing and evaluations | Langfuse or LangSmith |
| Application API | FastAPI |
| Fallback PDF handling | PyMuPDF and pypdf |
| Fallback image OCR | Tesseract + pytesseract or RapidOCR |

## Notes for whoever revisits this

- **LangGraph and FastAPI rows are already satisfied** — `backend/app/runtime.py`
  compiles/runs LangGraph workflows today, and `backend/app/main.py` is the
  existing FastAPI app. Any pipeline upgrade would be additive to these,
  not a new stack.
- **Langfuse is already integrated** (studio-consolidation Phase 5,
  opt-in, fails open) as the tracing layer — the "Langfuse or LangSmith"
  row is effectively already decided in this repo unless that decision is
  revisited separately.
- **Vector store is the biggest structural change**: today's storage is
  whatever backend `storage.py` resolves (Vercel Blob / S3-compatible /
  Turso / file SQLite) holding a JSON blob per graph's knowledge entry —
  adopting Qdrant means a new infrastructure dependency and a new
  `OBJECT_STORE_*`-style config block in `AGENTS.md`'s env-variable table,
  not just a library swap.
- **Docling/OCR rows unblock file types the current uploader rejects**
  (`knowledge.py`'s `_looks_like_text_file` only accepts `.txt`/`.md`
  today) — this is likely the actual product-visible payoff of adopting
  this stack, more than the retrieval-quality layers.
- Any adoption should preserve the P2 lineage-tracking contract already
  built: `augment_system_with_knowledge`'s `run_id`/`node_id` recording
  into `KnowledgeLineageEntry` should keep working (or have an equivalent)
  regardless of what retrieval backend produces the hits.
