"""Vision backend -- interface specified, live transport deferred.

Ported from the extraction-node spike: the prompt builder and the response
parser contract are fully specified (and unit-testable without a model),
but extract() raises BackendUnavailableError naming exactly what is needed
(Ollama serving a vision model, or GROQ_API_KEY). The live transport call
(Ollama /v1/chat/completions with image_url, or the Groq vision endpoint)
is the follow-up unit's work.
"""

from __future__ import annotations

import json
import os
import urllib.request

from .base import (
    BackendUnavailableError,
    ExtractionError,
    ExtractionSchema,
    validate_fields,
)


class VisionExtractor:
    """Vision-model extraction: page image -> markdown + schema JSON.

    Expected model behavior (the contract a live backend must satisfy):
    temperature 0, image input, and a strict JSON object with exactly the
    declared schema fields. Anything else is a schema failure, not a guess.
    """

    provider_name = "vision"

    def __init__(self, model: str | None = None) -> None:
        self.model = model or os.environ.get("VISION_MODEL", "qwen3-vl:8b")

    def requirements(self) -> list[str]:
        return [
            f"Ollama on http://localhost:11434 serving a vision model "
            f"(e.g. `ollama pull qwen3-vl:8b`; configured model: {self.model!r}), or",
            "GROQ_API_KEY in the environment plus a Groq-hosted vision model "
            "(e.g. meta-llama/llama-4-scout-17b-16e-instruct).",
        ]

    def available(self) -> bool:
        """True only when a vision model is actually reachable right now."""
        if os.environ.get("GROQ_API_KEY"):
            return True
        try:
            with urllib.request.urlopen(
                "http://localhost:11434/api/tags", timeout=1
            ) as resp:
                return resp.status == 200
        except OSError:
            return False

    def vision_prompt(self, schema: type[ExtractionSchema]) -> str:
        """The structure-stage prompt contract. The model must return ONLY a
        JSON object with exactly these fields -- no prose, no markdown fences."""
        fields = ", ".join(f'"{f}"' for f in schema.field_names())
        return (
            "You are a document extraction engine, not a chatbot. Read the "
            "document page image and return ONLY a JSON object with exactly "
            f"these fields: {fields}. If a field cannot be determined from "
            'the page, use the string "unknown" for strings, 0 for numbers, '
            "false for booleans. Do not invent facts. No markdown fences."
        )

    async def parse_vision_response(
        self,
        raw_json: str,
        schema: type[ExtractionSchema],
        file_name: str | None,
    ) -> tuple[ExtractionSchema, int]:
        """Validate a vision model's JSON against the declared schema.

        One repair retry (re-validate a whitespace-normalized payload); then
        hard ExtractionError. Testable without a live model."""
        try:
            data = json.loads(raw_json)
        except json.JSONDecodeError as exc:
            raise BackendUnavailableError(
                f"vision model returned non-JSON output: {exc}"
            ) from exc
        if not isinstance(data, dict):
            raise BackendUnavailableError(
                "vision model returned a JSON non-object; expected a field map"
            )
        data.setdefault("extraction_method", "vision")
        data.setdefault("source_file", file_name or "unknown")

        async def _repair() -> dict:
            return {k: (v.strip() if isinstance(v, str) else v) for k, v in data.items()}

        return await validate_fields(schema, data, retry=_repair)

    async def extract(
        self,
        *,
        document_bytes: bytes,
        mime: str,
        schema: type[ExtractionSchema],
        file_name: str | None = None,
    ):
        # Vision is the structured-output backend: it accepts any
        # ExtractionSchema subclass (custom inline schemas included) -- the
        # deterministic backends are document-facts-only by design.
        if not (isinstance(schema, type) and issubclass(schema, ExtractionSchema)):
            raise ExtractionError(
                f"vision extractor needs an ExtractionSchema subclass, got {schema!r}"
            )
        if not self.available():
            raise BackendUnavailableError(
                "Vision backend blocked on this machine. Requirements: "
                + " ".join(self.requirements())
                + " No vision eval numbers are reported by this slice."
            )
        # Live transport (Ollama /v1/chat/completions with image_url, or Groq
        # vision endpoint) is the follow-up unit's work -- see the plan's
        # backend slice. The prompt + parser contract above is the handoff.
        raise BackendUnavailableError(
            "live vision transport not implemented in this slice; "
            "see vision.parse_vision_response for the tested contract. "
            "Requirements: " + " ".join(self.requirements())
        )
