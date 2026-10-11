"""Extraction schemas: the document-facts every backend must produce, plus
dynamic models built from inline JSON Schemas.

Design rules (mirroring decision_models/schemas.py):
- the built-in `document-facts` schema covers deterministic document facts
  derivable without a vision model; semantic fields belong to the vision
  stage
- inline custom JSON Schemas go through a restricted subset (see
  `model_from_json_schema`); anything else raises ValueError, surfaced as a
  config diagnostic at graph-save time, never at runtime
- a backend whose output fails validation raises ExtractionError (after one
  repair retry) -- never silently coerced into guessed fields
"""

from __future__ import annotations

import re
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, create_model

from .base import ExtractionSchema

__all__ = [
    "DEFAULT_FACTS_SCHEMA",
    "DocumentFacts",
    "ExtractionMethod",
    "PageExtract",
    "StructuredDocument",
    "model_from_json_schema",
    "resolve_extraction_schema",
]


class ExtractionMethod(StrEnum):
    STUB = "stub"
    TEXT = "text"
    OCR = "ocr"
    VISION = "vision"


class DocumentFacts(ExtractionSchema):
    """The built-in `document-facts` schema: deterministic document facts
    derivable without a vision model.

    Semantic fields (entities, clauses, obligations) belong to the vision /
    structured-LLM stage; these facts are the schema-validated core every
    backend must produce on the happy path.
    """

    title: str = Field(min_length=1, max_length=200)
    page_count: int = Field(ge=1)
    total_chars: int = Field(ge=0)
    source_file: str = Field(min_length=1)
    has_embedded_text: bool
    extraction_method: Literal["stub", "text", "ocr", "vision"]
    layout_preserved: bool


class PageExtract(BaseModel):
    page_number: int = Field(ge=1)
    text: str
    char_count: int = Field(ge=0)
    method: Literal["text", "ocr", "none"]


class StructuredDocument(BaseModel):
    """What an extract node hands downstream: readable text + validated fields."""

    markdown: str
    fields: ExtractionSchema
    pages: list[PageExtract] = Field(min_length=1)


# The inline JSON Schema spelling of the built-in default (for API docs and
# the Studio schema editor's starting point).
DEFAULT_FACTS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": [
        "title",
        "page_count",
        "total_chars",
        "source_file",
        "has_embedded_text",
        "extraction_method",
        "layout_preserved",
    ],
    "properties": {
        "title": {"type": "string", "minLength": 1, "maxLength": 200},
        "page_count": {"type": "integer", "minimum": 1},
        "total_chars": {"type": "integer", "minimum": 0},
        "source_file": {"type": "string", "minLength": 1},
        "has_embedded_text": {"type": "boolean"},
        "extraction_method": {
            "type": "string",
            "enum": ["stub", "text", "ocr", "vision"],
        },
        "layout_preserved": {"type": "boolean"},
    },
}


# ---------------------------------------------------------------------------
# Inline custom schemas (restricted JSON Schema subset)
# ---------------------------------------------------------------------------

_SIMPLE_TYPES: dict[str, type] = {
    "string": str,
    "integer": int,
    "number": float,
    "boolean": bool,
}


def _sanitize_enum_member(value: str) -> str:
    name = re.sub(r"\W", "_", value).upper() or "VALUE"
    if name[0].isdigit():
        name = f"_{name}"
    return name


def model_from_json_schema(name: str, schema: dict[str, Any]) -> type[ExtractionSchema]:
    """Build an ExtractionSchema from a restricted JSON Schema subset.

    Supported: `type: object`; properties of type string (with optional
    `enum`), integer / number (with optional minimum/maximum), boolean
    (with optional minLength/maxLength on strings); `required`;
    `additionalProperties` is always forced to false. Anything else raises
    ValueError (surfaced as a config diagnostic at graph-save time, never
    at runtime).
    """
    if schema.get("type", "object") != "object":
        raise ValueError("custom extraction schema must have type 'object'")
    properties = schema.get("properties")
    if not isinstance(properties, dict) or not properties:
        raise ValueError("custom extraction schema needs a non-empty 'properties' map")
    required = set(schema.get("required", []))

    field_defs: dict[str, tuple[Any, Any]] = {}
    for prop_name, prop in properties.items():
        if not isinstance(prop, dict):
            raise ValueError(f"property {prop_name!r} must be an object")
        ptype = prop.get("type")
        if ptype not in _SIMPLE_TYPES:
            raise ValueError(
                f"property {prop_name!r}: unsupported type {ptype!r} "
                "(string/integer/number/boolean only)"
            )
        annotation: Any = _SIMPLE_TYPES[ptype]
        if "enum" in prop:
            if ptype != "string":
                raise ValueError(
                    f"property {prop_name!r}: enum is only supported for strings"
                )
            enum_vals = prop["enum"]
            if not enum_vals:
                raise ValueError(f"property {prop_name!r}: enum must be non-empty")
            members = {_sanitize_enum_member(v): v for v in enum_vals}
            annotation = StrEnum(
                f"{name}{''.join(p.title() for p in prop_name.split('_'))}",
                members,  # type: ignore[arg-type]
            )
        constraints: dict[str, Any] = {}
        for json_key, field_key in (
            ("minimum", "ge"),
            ("maximum", "le"),
            ("minLength", "min_length"),
            ("maxLength", "max_length"),
        ):
            if json_key in prop:
                constraints[field_key] = prop[json_key]
        default = ... if prop_name in required else None
        field_defs[prop_name] = (annotation, Field(default, **constraints))

    return create_model(
        f"{name}Fields",
        __config__=ConfigDict(extra="forbid"),
        __base__=ExtractionSchema,
        **field_defs,
    )


def resolve_extraction_schema(
    schema: dict[str, Any] | None,
) -> type[ExtractionSchema]:
    """Resolve an extract node's `outputSchema` config to a model class.

    None selects the built-in document-facts schema; a dict builds a custom
    model via the restricted subset. Raises ValueError on anything invalid
    -- callers surface this as a config diagnostic (save time) or a run
    failure (defense in depth).
    """
    if schema is None:
        return DocumentFacts
    if isinstance(schema, dict):
        return model_from_json_schema("CustomExtract", schema)
    raise ValueError("extraction outputSchema must be a JSON Schema object")
