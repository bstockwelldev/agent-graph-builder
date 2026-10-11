"""Document extraction backends -- the structured-ingestion role.

Ported from the extraction-node spike (see the master-ai-agentic-workflows
goal workspace); adapted to this repo's conventions: provider-neutral
`Extractor` protocol like `ChatModel` (`providers/base.py`), stub default
for offline demos, and `require_live_provider_allowed`-style gating for
the live (vision) backend in PUBLIC_DEMO_MODE.

Topology (see base.py): RuleGate (deterministic routing: embedded-text vs
OCR vs abstain) first; only then the extraction backend; then
resolve_extraction(threshold) separating confidence from authority.
"""

from .base import (
    SUPPORTED_MIMES,
    BackendUnavailableError,
    DeterministicExtractor,
    DocumentProbe,
    ExtractionError,
    ExtractionResult,
    ExtractionSchema,
    Extractor,
    Rule,
    RuleGate,
    build_result,
    default_rule_gate,
    extract_with_rules,
    get_extractor,
    maybe_truncate_pdf,
    probe_document,
    resolve_extraction,
    resolve_extraction_provider,
    validate_fields,
)
from .documents import (
    EXTRACT_MAX_UPLOAD_BYTES,
    ExtractDocument,
    ExtractUploadError,
    get_document,
    latest_document,
    list_documents,
    store_upload,
)
from .ocr import TesseractExtractor
from .schemas import (
    DEFAULT_FACTS_SCHEMA,
    DocumentFacts,
    ExtractionMethod,
    PageExtract,
    StructuredDocument,
    model_from_json_schema,
    resolve_extraction_schema,
)
from .stub import StubExtractor
from .text import TextExtractor
from .vision import VisionExtractor

__all__ = [
    "SUPPORTED_MIMES",
    "DEFAULT_FACTS_SCHEMA",
    "EXTRACT_MAX_UPLOAD_BYTES",
    "BackendUnavailableError",
    "DeterministicExtractor",
    "DocumentFacts",
    "DocumentProbe",
    "ExtractDocument",
    "ExtractUploadError",
    "ExtractionError",
    "ExtractionMethod",
    "ExtractionResult",
    "ExtractionSchema",
    "Extractor",
    "PageExtract",
    "Rule",
    "RuleGate",
    "StructuredDocument",
    "StubExtractor",
    "TesseractExtractor",
    "TextExtractor",
    "VisionExtractor",
    "build_result",
    "default_rule_gate",
    "extract_with_rules",
    "get_document",
    "get_extractor",
    "latest_document",
    "list_documents",
    "maybe_truncate_pdf",
    "model_from_json_schema",
    "probe_document",
    "resolve_extraction",
    "resolve_extraction_provider",
    "resolve_extraction_schema",
    "store_upload",
    "validate_fields",
]
