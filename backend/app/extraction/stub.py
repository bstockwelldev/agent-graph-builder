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

# Opt-in demo fixture: when the uploaded file is the Starlight Bazaar demo
# rulebook (see backend/app/demo_graph.py), the stub returns this instead of
# the Monopoly fixture, so the public demo's extraction -> Q&A reads
# coherently. Selected by file name only; the default fixture (and the CI
# baseline) is untouched.
_STARLIGHT_FILE_MARKER = "starlight-bazaar"
_STARLIGHT_MARKDOWN = """# Starlight Bazaar -- Rulebook

Starlight Bazaar is a trading game for 2-4 players. On your turn, perform exactly two actions: Travel, Trade, Haggle, or Stargaze.

Starlight shards are victory points. A set of 4 different goods is worth 3 shards; a set of 3 identical goods is worth 2 shards. The game ends immediately when a player holds 12 or more starlight shards. That player wins.

Solar Flare: every player discards half of their coins (rounded down). Then each player may immediately claim one set for free. The Solar Flare card is reshuffled into the event deck instead of discarded.
"""


def _is_starlight_demo(file_name: str | None) -> bool:
    return bool(file_name) and _STARLIGHT_FILE_MARKER in file_name.lower()


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
        if _is_starlight_demo(file_name):
            fixture_markdown = _STARLIGHT_MARKDOWN
            fixture_fields = DocumentFacts(
                title="Starlight Bazaar -- Rulebook",
                page_count=2,
                total_chars=len(fixture_markdown),
                source_file="fixture://starlight-bazaar",
                has_embedded_text=True,
                extraction_method="stub",
                layout_preserved=True,
            )
            raw = "stub:fixture:starlight-bazaar"
        else:
            fixture_markdown = FIXTURE_MARKDOWN
            fixture_fields = DocumentFacts(
                title="Monopoly -- Fixture Rulebook",
                page_count=1,
                total_chars=len(fixture_markdown),
                # Fixed fixture identity: the stub is input-independent by
                # design, so the baseline never shifts with the upload name.
                source_file="fixture://rulebook",
                has_embedded_text=True,
                extraction_method="stub",
                layout_preserved=True,
            )
            raw = "stub:fixture"
        fields, attempts = await validate_fields(
            schema,
            fixture_fields.model_dump(),
            retry=lambda: fixture_fields.model_dump(),
        )
        assert isinstance(fields, DocumentFacts)
        document = StructuredDocument(
            markdown=fixture_markdown,
            fields=fields,
            pages=[
                PageExtract(
                    page_number=1,
                    text=fixture_markdown,
                    char_count=len(fixture_markdown),
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
            raw=raw,
        )
