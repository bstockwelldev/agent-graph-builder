---
id: node-extract
title: "Extract node"
summary: "Turn documents into structured JSON"
category: node
keywords: ["extract", "document", "pdf", "ocr", "vision", "ingest", "scan"]
related: ["node-tool", "node-transform", "replay"]
---
Upload a PDF, scan, or photo — or pull the bytes from a run variable — and get back both readable markdown and schema-validated fields for downstream nodes. The pipeline runs in stages: embedded text first, then OCR, then a vision model, and each page records which method produced it. When confidence falls below the node's threshold the extractor abstains instead of guessing: downstream nodes see `abstained: true` with empty fields, and the run continues. The stub provider returns deterministic fixture fields, so demo graphs stay keyless.
