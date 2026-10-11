"""Deterministic stub extractor -- fixture output, offline/CI-safe.

Mirrors `decision_models/stub.py`: same input always yields the same
StructuredDocument, so unit tests and the eval harness have a stable
baseline that needs no binaries, no models, no network. The public demo
runs on this backend (keyless by construction).
"""

from __future__ import annotations

import time

from .base import (
    ExtractionError,
    ExtractionResult,
    ExtractionSchema,
    build_result,
    validate_fields,
)
from .schemas import DocumentFacts, PageExtract, StructuredDocument

_FIXTURE_TEXT = "Building houses requires a colour set."
FIXTURE_MARKDOWN = "# Monopoly -- Fixture Rulebook\n\n" + _FIXTURE_TEXT + "\n"


class StubExtractor:
    provider_name = "stub"

    def __init__(self, model: str = "stub") -> None:
        self.model = model

    async def extract(
        self,
        *,
        document_bytes: bytes,
        mime: str,
        schema: type[ExtractionSchema],
        file_name: str | None = None,
    ) -> ExtractionResult:
        started = time.perf_counter()
        if schema is not DocumentFacts:
            raise ExtractionError(
                "stub extractor supports the built-in document-facts schema "
                f"only, got {schema.__name__}"
            )
        fixture_fields = DocumentFacts(
            title="Monopoly -- Fixture Rulebook",
            page_count=1,
            total_chars=len(FIXTURE_MARKDOWN),
            # Fixed fixture identity: the stub is input-independent by
            # design, so the baseline never shifts with the upload name.
            source_file="fixture://rulebook",
            has_embedded_text=True,
            extraction_method="stub",
            layout_preserved=True,
        )
        fields, attempts = await validate_fields(
            schema,
            fixture_fields.model_dump(),
            retry=lambda: fixture_fields.model_dump(),
        )
        assert isinstance(fields, DocumentFacts)
        document = StructuredDocument(
            markdown=FIXTURE_MARKDOWN,
            fields=fields,
            pages=[
                PageExtract(
                    page_number=1,
                    text=_FIXTURE_TEXT,
                    char_count=len(_FIXTURE_TEXT),
                    method="text",
                )
            ],
        )
        return build_result(
            document=document,
            confidence=1.0,
            provider_name=self.provider_name,
            model=self.model,
            latency_ms=(time.perf_counter() - started) * 1000.0,
            attempts=attempts,
            raw="stub:fixture",
        )
