---
title: Extraction node — document ingestion (OCR, vision) as a node type
last_updated: 2026-10-04
---

# Extraction node plan

**Status:** implementing (2026-10-10). Backend slice in progress (uncommitted working tree): `backend/app/extraction/` package (base/schemas/stub/text/ocr/vision/documents), `NodeType.EXTRACT`, `ExtractConfig`, `compute_extract`, `extract.completed` event, ports entry, replay recompute rule, `extractor_factory` on both runtime sites, `POST /api/graphs/{id}/extract`, `backend/tests/test_extract_node.py` (38 tests). Studio slice in parallel. Follows the decision-node rollout template: spike → backend → Studio (`spikes/decision-model`, PRs #151/#152).

## Why

Graphs today can only ingest `.txt`/`.md` knowledge uploads (`backend/app/knowledge.py`: `upload_knowledge_document` rejects anything else). Real-world documents are PDFs, scans, and photos. An `extract` node brings document ingestion into the graph itself: upload or variable → OCR/vision pipeline → structured JSON downstream nodes can consume.

## Decisions (2026-10-04, proposed — need Brandon's sign-off)

- **Pipeline:** vision-model-only chain (no Tesseract). Fewer moving parts, layout-aware, and the practice repo already proved Docling for PDFs. Stages: `pdf` (Docling, pypdf fallback) → `vision` (Ollama vision / Groq) → `structure` (schema-validated JSON).
- **Upload path:** standalone `POST /api/graphs/{id}/extract` endpoint accepting PDF/images, rather than extending the knowledge upload. Extraction is a run-time node input, not a knowledge-base document.
- **Output:** `StructuredDocument { markdown, fields: dict, pages: [...] }` — downstream nodes get both the readable text and the schema-validated fields.
- **Stub default:** deterministic stub extractor (returns fixture fields) keeps the public demo keyless, same as the decision node.

## Spike (`spikes/extraction/`)

Provider-neutral `Extractor` protocol, mirroring `decision_models/`:

```yaml
protocol: Extractor
method: extract(bytes, mime) -> StructuredDocument
backends: StubExtractor  # deterministic fixture output
          DoclingExtractor  # PDF, layout-aware
          VisionExtractor  # Ollama / Groq vision model -> markdown + JSON
```

Eval fixture set (10 docs): clean PDF, scanned PDF, phone photo of a page, table-heavy PDF, multi-column layout. Metric: field-level accuracy per doc, plus a "layout preserved" flag. Baseline on stub, then Ollama vision.

## Backend

- **New package** `backend/app/extraction/` (`__init__.py`, `base.py`, `schemas.py`, `docling.py`, `vision.py`, `stub.py`) — port of the spike.
- **`models.py`:** `NodeType.EXTRACT`.
- **`node_configs.py`:** `ExtractConfig` — `source` (upload | variable), `stages` (list), `output_schema` (inline JSON Schema), `provider`, `model`. Registered in `_CONFIG_MODELS`; rule-style validation: unknown stage names fail at save time.
- **`nodes.py`:** `compute_extract` + `EXECUTORS` entry. Emits `extract.completed` trace event (new in `events.py`).
- **`ports.py`:** `_DEFAULT_PORT_CATALOG[NodeType.EXTRACT] = _single_io(ARTIFACT, STRUCTURED_JSON)` — document in, structured fields out.
- **`replay.py`:** EXTRACT in the recompute allowlist (extraction is deterministic given the bytes; frozen otherwise).
- **`runtime.py`:** extractor factory on `ExecContext` (stub default via `require_live_provider_allowed` for live backends).
- **Route:** `POST /api/graphs/{id}/extract` — multipart upload → stored bytes → node input binding.

## Studio (10-touchpoint checklist, from the decision slice)

1. SDK `schemas.ts`: `decision`-style enum addition → `extract`.
2. `NodePalette.tsx` + `canvasMenuActions.tsx` ("Data and tools" group).
3. `nodeTypeIcons.ts`: new icon.
4. `content/kb/node-extract.md` + `pnpm kb` bundles.
5. `NodeInspector.tsx`: config form — stage toggles, schema editor, provider/model, `RENDERED_FIELDS` entry.
6. Run tab: extraction preview (markdown excerpt + extracted fields table).
7. `content/node-ports.ts` + `lib/graph-theme.ts` accents.
8. SDK `graph/nodes.ts`: `defaultConfig` / `labelFor` / `summaryFor`.
9. Tests: backend unit on stub + fixture eval; Studio typecheck/lint/vitest; `kb.test.ts` coverage via the new article.
10. Changeset (minor).

## Testing

- Backend: unit tests on stub extractor; fixture eval set runs in CI (`--backend stub` baseline, Ollama vision on demand).
- Studio: typecheck, eslint, palette/inspector/kb tests.
- Backend pytest for ports/config validation (needs CI — no local venv).

## Acceptance

- A scanned PDF dropped on an extract node yields schema-validated JSON in a live graph run.
- The public demo stays keyless (stub default).
- The 10-doc fixture eval is green and recorded as the baseline for future backend comparisons.

## Open questions

- Vision provider priority: Ollama-first (local, free) with Groq as the hosted fallback?
- Page limit / size caps for uploads (DoS surface on the public demo)?
- Should extraction feed the knowledge base directly (extract → index in one graph)?
