"""Provider-neutral extraction interface.

Ported from the extraction-node spike (see the master-ai-agentic-workflows
goal workspace); adapted to this repo's conventions: provider-neutral
protocol like `ChatModel` (`providers/base.py`), stub default for offline
demos, and PUBLIC_DEMO_MODE gating for the live (vision) backend.

Topology: RuleGate (deterministic routing: embedded-text vs OCR vs abstain)
first; only then the extraction backend; then resolve_extraction(threshold)
separating confidence from authority.
"""

from __future__ import annotations

import asyncio
import io
import os
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Protocol

from pydantic import BaseModel, ValidationError

if TYPE_CHECKING:
    from .schemas import StructuredDocument

SUPPORTED_MIMES = frozenset(
    {"application/pdf", "image/png", "image/jpeg", "image/tiff"}
)
MIN_TEXT_CHARS_PER_PAGE = 50  # below this a PDF page counts as image-only


class ExtractionError(Exception):
    """A backend's output failed schema validation, or the input could not be
    processed. Callers must treat this as "no extraction" -- escalate or
    abstain. Never silently coerce a failed validation into guessed fields."""


class BackendUnavailableError(ExtractionError):
    """The backend cannot run in this environment (missing binary, missing
    model, missing credentials). Distinct from a validation failure: the
    right response is to report the block and its requirements, not retry."""


class ExtractionSchema(BaseModel):
    """Base class for extraction payloads. Subclasses declare their fields."""

    @classmethod
    def field_names(cls) -> list[str]:
        return sorted(cls.model_fields.keys())


@dataclass
class ExtractionResult:
    """Envelope around a validated extraction."""

    document: StructuredDocument | None
    confidence: float
    abstained: bool
    provider_name: str
    model: str
    latency_ms: float
    attempts: int
    raw: str
    rule_hit: str | None = None  # rule name when a RuleGate routed/abstained


class Extractor(Protocol):
    provider_name: str
    model: str

    async def extract(
        self,
        *,
        document_bytes: bytes,
        mime: str,
        schema: type[ExtractionSchema],
        file_name: str | None = None,
    ) -> ExtractionResult:
        """Return a schema-validated extraction.

        Raises ExtractionError when the backend cannot produce valid output;
        BackendUnavailableError when the backend cannot run in this
        environment.
        """


async def validate_fields(
    schema_cls: type[ExtractionSchema],
    data: dict,
    retry: Callable[[], object],
) -> tuple[ExtractionSchema, int]:
    """Validate backend output against the declared schema, with one repair
    retry (the backend re-attempts extraction, it does not coerce). Returns
    (validated_fields, attempts). Raises ExtractionError on the second
    failure."""
    try:
        return schema_cls(**data), 1
    except ValidationError:
        pass
    retried = retry()
    if asyncio.iscoroutine(retried) or isinstance(retried, asyncio.Future):
        retried = await retried
    try:
        return schema_cls(**retried), 2
    except ValidationError as exc:
        raise ExtractionError(
            f"schema validation failed after one repair retry: {exc}"
        ) from exc


def build_result(
    *,
    document: StructuredDocument | None,
    confidence: float,
    provider_name: str,
    model: str,
    latency_ms: float,
    attempts: int,
    raw: str,
    rule_hit: str | None = None,
) -> ExtractionResult:
    return ExtractionResult(
        document=document,
        confidence=max(0.0, min(1.0, confidence)),
        abstained=document is None,
        provider_name=provider_name,
        model=model,
        latency_ms=latency_ms,
        attempts=attempts,
        raw=raw,
        rule_hit=rule_hit,
    )


@dataclass
class DocumentProbe:
    """Cheap pre-extraction signal the RuleGate routes on."""

    mime: str
    page_count: int
    first_page_chars: int
    first_page_has_images: bool


def probe_document(document_bytes: bytes, mime: str) -> DocumentProbe:
    if mime == "application/pdf":
        import pdfplumber

        with pdfplumber.open(io.BytesIO(document_bytes)) as pdf:
            pages = pdf.pages
            first_text = (pages[0].extract_text() or "").strip() if pages else ""
            has_images = bool(pages and pages[0].images)
            return DocumentProbe(
                mime=mime,
                page_count=len(pages),
                first_page_chars=len(first_text),
                first_page_has_images=has_images,
            )
    if mime in {"image/png", "image/jpeg", "image/tiff"}:
        from PIL import Image

        with Image.open(io.BytesIO(document_bytes)) as im:
            im.load()
            return DocumentProbe(mime=mime, page_count=1, first_page_chars=0,
                                 first_page_has_images=True)
    return DocumentProbe(mime=mime, page_count=0, first_page_chars=0,
                         first_page_has_images=False)


def maybe_truncate_pdf(
    document_bytes: bytes, mime: str, page_limit: int
) -> tuple[bytes, int]:
    """Cap a PDF at `page_limit` pages (pypdf rewrite); returns
    (possibly-truncated bytes, page count after truncation). Non-PDF input
    passes through untouched. Used by compute_extract to honor the node's
    pageLimit config before any backend runs."""
    if mime != "application/pdf":
        return document_bytes, 1 if mime in SUPPORTED_MIMES else 0
    from pypdf import PdfReader, PdfWriter

    reader = PdfReader(io.BytesIO(document_bytes))
    total = len(reader.pages)
    if total <= page_limit:
        return document_bytes, total
    writer = PdfWriter()
    for page in reader.pages[:page_limit]:
        writer.add_page(page)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue(), page_limit


@dataclass
class Rule:
    """One deterministic routing rule: if `matches(probe)` then `route`."""

    name: str
    matches: Callable[[DocumentProbe], bool]
    route: str  # "text" | "ocr" | "vision" | "abstain"


class RuleGate:
    """Deterministic routing evaluated before any extraction backend runs.

    This is the "deterministic rules first" layer: embedded-text PDFs never
    pay for OCR, image-only content never goes to the text backend, and
    unsupported MIME types abstain without touching a backend.
    """

    def __init__(self, rules: list[Rule]) -> None:
        self.rules = rules

    def check(self, probe: DocumentProbe) -> tuple[str, str] | None:
        for rule in self.rules:
            if rule.matches(probe):
                return rule.name, rule.route
        return None


def default_rule_gate() -> RuleGate:
    return RuleGate(
        [
            Rule(
                "unsupported_mime",
                lambda p: p.mime not in SUPPORTED_MIMES,
                "abstain",
            ),
            Rule(
                "text_pdf",
                lambda p: p.mime == "application/pdf"
                and p.first_page_chars >= MIN_TEXT_CHARS_PER_PAGE,
                "text",
            ),
            Rule(
                "image_input",
                lambda p: p.mime in {"image/png", "image/jpeg", "image/tiff"},
                "ocr",
            ),
            Rule(
                "scanned_pdf",
                lambda p: p.mime == "application/pdf" and p.page_count >= 1,
                "ocr",
            ),
        ]
    )


async def extract_with_rules(
    gate: RuleGate,
    extractors: dict[str, Extractor],
    *,
    document_bytes: bytes,
    mime: str,
    schema: type[ExtractionSchema],
    file_name: str | None = None,
    forced_route: str | None = None,
) -> ExtractionResult:
    """Run the deterministic gate first; only then the routed backend.

    forced_route bypasses routing (used to test one backend in isolation,
    and by DeterministicExtractor when a single stage is configured); the
    rule_hit is then recorded as "forced". Raises ExtractionError when no
    rule matches, or a KeyError-indexed stage is not enabled -- callers turn
    both into loud failures, never silent fallbacks.
    """
    started = time.perf_counter()
    if forced_route is not None:
        rule_hit, route = "forced", forced_route
    else:
        probe = await asyncio.to_thread(probe_document, document_bytes, mime)
        hit = gate.check(probe)
        if hit is None:
            raise ExtractionError("no routing rule matched the document probe")
        rule_hit, route = hit
    if route == "abstain":
        return build_result(
            document=None,
            confidence=0.0,
            provider_name="rule_gate",
            model=rule_hit,
            latency_ms=(time.perf_counter() - started) * 1000.0,
            attempts=0,
            raw=f"rule:{rule_hit}:abstain",
            rule_hit=rule_hit,
        )
    try:
        backend = extractors[route]
    except KeyError:
        raise ExtractionError(
            f"document routed to stage {route!r} which is not enabled "
            f"(enabled stages: {sorted(extractors)}); widen the node's "
            "'stages' config"
        ) from None
    result = await backend.extract(
        document_bytes=document_bytes,
        mime=mime,
        schema=schema,
        file_name=file_name,
    )
    result.rule_hit = rule_hit
    return result


def resolve_extraction(
    result: ExtractionResult, *, threshold: float
) -> StructuredDocument | str:
    """Separate confidence from authority.

    Returns the document only when the extraction did not abstain AND its
    confidence clears the threshold; otherwise returns "escalate". A backend
    reporting confidence=0.97 is not a calibrated probability -- set the
    threshold against the labeled eval set.
    """
    if result.abstained or result.document is None or result.confidence < threshold:
        return "escalate"
    return result.document


class DeterministicExtractor:
    """The `provider="deterministic"` backend: RuleGate routing across the
    node's configured `stages`.

    A single configured stage forces that route (bypasses the probe, honest
    "forced" rule_hit -- e.g. `stages=["text"]` means "text only, fail
    loudly on anything else"). Multiple stages route via the default gate;
    a document routed to a stage that isn't enabled fails loudly instead of
    silently falling back to another stage.
    """

    provider_name = "deterministic"

    def __init__(
        self, extractors: dict[str, Extractor], model: str | None = None
    ) -> None:
        if not extractors:
            raise ValueError("deterministic extractor needs at least one stage backend")
        self.extractors = extractors
        self.model = model or "gate:" + ",".join(sorted(extractors))

    async def extract(
        self,
        *,
        document_bytes: bytes,
        mime: str,
        schema: type[ExtractionSchema],
        file_name: str | None = None,
    ) -> ExtractionResult:
        forced = next(iter(self.extractors)) if len(self.extractors) == 1 else None
        return await extract_with_rules(
            default_rule_gate(),
            self.extractors,
            document_bytes=document_bytes,
            mime=mime,
            schema=schema,
            file_name=file_name,
            forced_route=forced,
        )


def resolve_extraction_provider(explicit: str | None = None) -> str:
    if explicit is not None:
        return explicit.strip().lower()
    return os.environ.get("EXTRACT_PROVIDER", "stub").strip().lower() or "stub"


def _require_vision_allowed(api_key: str | None) -> None:
    """PUBLIC_DEMO_MODE gating for the vision backend, mirroring
    `require_live_provider_allowed`'s demo semantics for chat models: on a
    public demo the server's own keys are not spendable, so vision runs only
    with a caller-supplied key. (The Ollama-vs-Groq reachability check stays
    in VisionExtractor.available(), which reports honest requirements.)"""
    from ..env_config import public_demo_mode_enabled
    from ..providers.base import PUBLIC_DEMO_PROVIDER_MESSAGE, LiveProviderBlocked

    if not public_demo_mode_enabled():
        return
    if (api_key or "").strip():
        return
    raise LiveProviderBlocked(PUBLIC_DEMO_PROVIDER_MESSAGE)


def get_extractor(
    model: str | None = None,
    provider: str | None = None,
    *,
    stages: list[str] | None = None,
    api_key: str | None = None,
) -> Extractor:
    """Build an Extractor. Stub is the default so the public demo and CI
    stay keyless and deterministic; the vision backend goes through the
    same PUBLIC_DEMO_MODE gating as live chat models."""
    resolved = resolve_extraction_provider(provider)
    if resolved == "stub":
        from .stub import StubExtractor

        return StubExtractor(model=model or "stub")
    if resolved == "deterministic":
        enabled = [s.strip().lower() for s in (stages or ["text", "ocr"])]
        extractors: dict[str, Extractor] = {}
        if "text" in enabled:
            from .text import TextExtractor

            extractors["text"] = TextExtractor()
        if "ocr" in enabled:
            from .ocr import TesseractExtractor

            extractors["ocr"] = TesseractExtractor()
        if "vision" in enabled:
            _require_vision_allowed(api_key)
            from .vision import VisionExtractor

            extractors["vision"] = VisionExtractor(model=model)
        if not extractors:
            raise ValueError(
                f"deterministic provider: no usable stage in {enabled} "
                "(expected a subset of ['text', 'ocr', 'vision'])"
            )
        return DeterministicExtractor(extractors, model=model)
    if resolved == "vision":
        _require_vision_allowed(api_key)
        from .vision import VisionExtractor

        return VisionExtractor(model=model)
    raise ValueError(
        f"unknown extraction provider: {resolved!r} "
        "(expected 'stub', 'deterministic', or 'vision')"
    )
