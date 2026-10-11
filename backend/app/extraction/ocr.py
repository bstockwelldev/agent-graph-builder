"""Tesseract OCR extractor -- fallback backend for image-only content.

Renders PDF pages with pdftoppm (poppler) and OCRs with Tesseract via
pytesseract. This is the comparison arm of the in-spike engine decision:
OCR is slower and lossy vs embedded text, but it is the only option for
scanned pages and photos.

Environment contract: requires the `tesseract` and `pdftoppm` binaries (and
the `pytesseract` package). If any is missing, extract() raises
BackendUnavailableError naming the missing piece and the install command --
it never pretends to have OCRed.
"""

from __future__ import annotations

import asyncio
import io
import os
import shutil
import statistics
import subprocess
import tempfile
import time

from .base import (
    SUPPORTED_MIMES,
    BackendUnavailableError,
    ExtractionError,
    ExtractionResult,
    ExtractionSchema,
    build_result,
    validate_fields,
)
from .schemas import DocumentFacts, PageExtract, StructuredDocument

INSTALL_HINT = "sudo apt-get install tesseract-ocr poppler-utils"


class TesseractExtractor:
    provider_name = "ocr"
    model = "tesseract"

    def __init__(self, dpi: int = 150) -> None:
        self.dpi = dpi
        self.tesseract_bin = shutil.which("tesseract")
        self.pdftoppm_bin = shutil.which("pdftoppm")

    def _require_available(self) -> None:
        missing = [
            name
            for name, path in (
                ("tesseract", self.tesseract_bin),
                ("pdftoppm", self.pdftoppm_bin),
            )
            if not path
        ]
        if missing:
            raise BackendUnavailableError(
                f"OCR backend unavailable: missing {', '.join(missing)}. "
                f"Install with: {INSTALL_HINT}"
            )
        try:
            import pytesseract  # noqa: F401
        except ImportError:
            raise BackendUnavailableError(
                "OCR backend unavailable: the pytesseract package is not "
                "installed. Install with: pip install pytesseract"
            ) from None

    def _ocr_image(self, image) -> tuple[str, float | None]:
        import pytesseract

        text = pytesseract.image_to_string(image) or ""
        data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
        confs = [float(c) for c in data.get("conf", []) if float(c) >= 0]
        mean_conf = statistics.mean(confs) / 100.0 if confs else None
        return text, mean_conf

    def _run_sync(
        self, document_bytes: bytes, mime: str, dpi: int
    ) -> list[tuple[str, float | None]]:
        """Render (PDF) or load (image) pages, OCR each. Returns
        [(text, mean_word_confidence)] per page."""
        from PIL import Image

        images: list = []
        if mime == "application/pdf":
            with tempfile.TemporaryDirectory(prefix="ocr_extract_") as tmp:
                src = os.path.join(tmp, "doc.pdf")
                with open(src, "wb") as fh:
                    fh.write(document_bytes)
                prefix = os.path.join(tmp, "page")
                subprocess.run(
                    [
                        self.pdftoppm_bin or "pdftoppm",
                        "-png",
                        "-r",
                        str(dpi),
                        src,
                        prefix,
                    ],
                    check=True,
                    capture_output=True,
                )
                pngs = sorted(f for f in os.listdir(tmp) if f.endswith(".png"))
                images = [Image.open(os.path.join(tmp, f)) for f in pngs]
                results = [self._ocr_image(im) for im in images]
                for im in images:
                    im.close()
                return results
        with Image.open(io.BytesIO(document_bytes)) as im:
            im.load()
            return [self._ocr_image(im)]

    async def extract(
        self,
        *,
        document_bytes: bytes,
        mime: str,
        schema: type[ExtractionSchema],
        file_name: str | None = None,
    ) -> ExtractionResult:
        started = time.perf_counter()
        self._require_available()
        if schema is not DocumentFacts:
            raise ExtractionError(
                "OCR extractor supports the built-in document-facts schema "
                f"only, got {schema.__name__}"
            )
        if mime not in SUPPORTED_MIMES:
            raise ExtractionError(f"OCR extractor cannot handle {mime!r}")

        page_data = await asyncio.to_thread(
            self._run_sync, document_bytes, mime, self.dpi
        )
        texts = [text for text, _ in page_data]
        if all(not t.strip() for t in texts):
            # Honest abstain: OCR found nothing readable; do not invent fields.
            return build_result(
                document=None,
                confidence=0.0,
                provider_name=self.provider_name,
                model=self.model,
                latency_ms=(time.perf_counter() - started) * 1000.0,
                attempts=1,
                raw="ocr:empty",
            )

        def _fields(data: list[tuple[str, float | None]]) -> dict:
            total = sum(len(t) for t, _ in data)
            first_line = next(
                (line.strip() for line in data[0][0].splitlines() if line.strip()),
                "",
            )
            return {
                "title": first_line[:200] or "untitled",
                "page_count": len(data),
                "total_chars": total,
                "source_file": file_name or "unknown",
                "has_embedded_text": False,
                "extraction_method": "ocr",
                "layout_preserved": False,
            }

        field_data = _fields(page_data)

        async def _repair() -> dict:
            # Genuine repair attempt: re-OCR at double DPI instead of coercing.
            retry_data = await asyncio.to_thread(
                self._run_sync, document_bytes, mime, self.dpi * 2
            )
            return _fields(retry_data)

        fields, attempts = await validate_fields(schema, field_data, retry=_repair)
        assert isinstance(fields, DocumentFacts)
        pages = [
            PageExtract(
                page_number=i + 1, text=text, char_count=len(text), method="ocr"
            )
            for i, (text, _) in enumerate(page_data)
        ]
        markdown = "\n\n".join(
            f"<!-- page {i + 1} (OCR) -->\n\n{text}"
            for i, (text, _) in enumerate(page_data)
        )
        confs = [c for _, c in page_data if c is not None]
        confidence = statistics.mean(confs) if confs else 0.0
        return build_result(
            document=StructuredDocument(markdown=markdown, fields=fields, pages=pages),
            confidence=confidence,
            provider_name=self.provider_name,
            model=self.model,
            latency_ms=(time.perf_counter() - started) * 1000.0,
            attempts=attempts,
            raw=f"ocr:{len(pages)}p@{self.dpi}dpi",
        )
