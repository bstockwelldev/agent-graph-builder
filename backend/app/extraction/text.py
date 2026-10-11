"""Embedded-text extractor -- real backend for text-based PDFs.

Uses pdfplumber to pull the embedded text layer out of a PDF, with pypdf
as the fallback when pdfplumber is unavailable. This is the primary
engine: for documents that already carry text it is exact,
layout-preserving, and orders of magnitude faster than OCR. Image-only
content is not this backend's job -- the RuleGate routes that to OCR, and
calling this backend on an image raises ExtractionError.
"""

from __future__ import annotations

import asyncio
import io
import time

from .base import (
    MIN_TEXT_CHARS_PER_PAGE,
    BackendUnavailableError,
    ExtractionError,
    ExtractionResult,
    ExtractionSchema,
    build_result,
    validate_fields,
)
from .schemas import DocumentFacts, PageExtract, StructuredDocument


class TextExtractor:
    provider_name = "text"
    model = "pdfplumber"

    async def _read_pages(self, document_bytes: bytes) -> list[str]:
        """Extract per-page text, preferring pdfplumber, falling back to
        pypdf. Raises BackendUnavailableError when neither library is
        installed."""
        try:
            import pdfplumber

            def _with_pdfplumber() -> list[str]:
                with pdfplumber.open(io.BytesIO(document_bytes)) as pdf:
                    return [page.extract_text() or "" for page in pdf.pages]

            texts = await asyncio.to_thread(_with_pdfplumber)
            self.model = "pdfplumber"
            return texts
        except ImportError:
            pass
        try:
            from pypdf import PdfReader
        except ImportError:
            raise BackendUnavailableError(
                "text extraction needs pdfplumber (or pypdf as a fallback): "
                "pip install pdfplumber"
            ) from None

        def _with_pypdf() -> list[str]:
            reader = PdfReader(io.BytesIO(document_bytes))
            return [(page.extract_text() or "") for page in reader.pages]

        texts = await asyncio.to_thread(_with_pypdf)
        self.model = "pypdf"
        return texts

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
                "text extractor supports the built-in document-facts schema "
                f"only, got {schema.__name__}"
            )
        if mime != "application/pdf":
            raise ExtractionError(
                f"text extractor handles application/pdf, got {mime!r} "
                "(image content belongs to the OCR backend)"
            )

        texts = await self._read_pages(document_bytes)
        total_chars = sum(len(t) for t in texts)

        if total_chars == 0:
            # Honest abstain: a text backend finding no text is not allowed to
            # invent fields. The scanned_pdf rule should have routed this to
            # OCR; a direct call abstains instead.
            return build_result(
                document=None,
                confidence=0.0,
                provider_name=self.provider_name,
                model=self.model,
                latency_ms=(time.perf_counter() - started) * 1000.0,
                attempts=1,
                raw="text:empty",
            )

        first_line = next(
            (line.strip() for line in texts[0].splitlines() if line.strip()), ""
        )
        pages = [
            PageExtract(
                page_number=i + 1, text=text, char_count=len(text), method="text"
            )
            for i, text in enumerate(texts)
        ]
        markdown = "\n\n".join(
            f"<!-- page {i + 1} -->\n\n{text}" for i, text in enumerate(texts)
        )
        field_data = {
            "title": first_line[:200] or "untitled",
            "page_count": len(texts),
            "total_chars": total_chars,
            "source_file": file_name or "unknown.pdf",
            "has_embedded_text": True,
            "extraction_method": "text",
            "layout_preserved": True,
        }
        # Repair retry = re-attempt extraction (no coercion of field values).
        fields, attempts = await validate_fields(
            schema, field_data, retry=lambda: dict(field_data)
        )
        assert isinstance(fields, DocumentFacts)
        document = StructuredDocument(
            markdown=markdown, fields=fields, pages=pages
        )
        good_pages = sum(
            1 for p in pages if p.char_count >= MIN_TEXT_CHARS_PER_PAGE
        )
        return build_result(
            document=document,
            confidence=good_pages / len(pages),
            provider_name=self.provider_name,
            model=self.model,
            latency_ms=(time.perf_counter() - started) * 1000.0,
            attempts=attempts,
            raw=f"text:{len(pages)}p/{total_chars}c",
        )
