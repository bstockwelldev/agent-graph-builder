"""Deterministic data transforms (p0-graph-foundation-design-plan.md,
"Compatibility rules"): `select`, `wrap`, `format_message` and `coerce`.

One engine behind every transform surface: edge transforms (applied in
`ports.resolve_node_input`), the `transform` node, and reusable Transforms
library entries. Declarative only — no code execution, no implicit
coercions. A transform that can't apply raises `TransformError`, which
fails the step instead of guessing.
"""

from __future__ import annotations

import json
import math
import re
from collections.abc import Callable
from typing import Any, Protocol

from .models import EdgeTransform, GraphDefinition


class TransformSpec(Protocol):
    type: str | None
    pointer: str | None
    field: str | None
    template: str | None
    target_type: str | None


class TransformError(ValueError):
    """A transform couldn't be applied to the value it received."""


# The one field each transform type needs (shared by contract validation,
# the Transforms library model and the transform node config).
REQUIRED_FIELD = {"select": "pointer", "wrap": "field", "format_message": "template", "coerce": "target_type"}


def transform_field_error(spec: TransformSpec) -> str | None:
    """Why `spec` is incomplete, or None. References are checked separately."""
    if spec.type is None:
        return None
    required = REQUIRED_FIELD.get(spec.type)
    if required and not getattr(spec, required):
        return f"{spec.type} transform requires {required!r}"
    return None


TRANSFORM_FIELDS = ("type", "pointer", "field", "template", "target_type")


def materialize_transforms(
    graph: GraphDefinition, lookup: Callable[[str], dict[str, Any] | None]
) -> tuple[GraphDefinition, list[tuple[str, str]]]:
    """Copies every Transforms-library reference (`transform_id`) inline so
    validation and execution see a concrete transform. Returns the graph
    and the `(edge_id, transform_id)` references that didn't resolve (those
    edges keep only their reference and fail if executed)."""
    missing: list[tuple[str, str]] = []
    edges = []
    for edge in graph.edges:
        ref = edge.transform.transform_id if edge.transform else None
        if not ref:
            edges.append(edge)
            continue
        definition = lookup(ref)
        if definition is None:
            missing.append((edge.id, ref))
            edges.append(edge)
            continue
        inline = {key: definition.get(key) for key in TRANSFORM_FIELDS}
        edges.append(edge.model_copy(update={"transform": EdgeTransform(**inline, transform_id=ref)}))
    if not any(edge.transform and edge.transform.transform_id for edge in graph.edges):
        return graph, missing
    return graph.model_copy(update={"edges": edges}), missing


def apply_transform(spec: TransformSpec, value: Any) -> Any:
    if spec.type is None:
        ref = getattr(spec, "transform_id", None)
        raise TransformError(f"library transform {ref!r} not found")
    if spec.type == "select":
        return _select(value, spec.pointer or "")
    if spec.type == "wrap":
        if not spec.field:
            raise TransformError("wrap needs a field name")
        return {spec.field: value}
    if spec.type == "format_message":
        return render_template(spec.template or "", value)
    if spec.type == "coerce":
        return _coerce(value, spec.target_type)
    raise TransformError(f"unknown transform type {spec.type!r}")


# --- select: RFC 6901 JSON Pointer ------------------------------------------


def _as_structured(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError as exc:
            raise TransformError("input is text, not JSON, so it has no fields to select") from exc
    return value


def _select(value: Any, pointer: str) -> Any:
    if pointer == "":
        return value
    if not pointer.startswith("/"):
        raise TransformError(f"pointer {pointer!r} must start with '/' (e.g. /answer)")
    current = _as_structured(value)
    for raw in pointer[1:].split("/"):
        token = raw.replace("~1", "/").replace("~0", "~")
        current = _step(current, token, pointer)
    return current


def _step(current: Any, token: str, where: str) -> Any:
    if isinstance(current, dict):
        if token not in current:
            raise TransformError(f"{where}: no field {token!r}")
        return current[token]
    if isinstance(current, list):
        if not token.isdigit() or int(token) >= len(current):
            raise TransformError(f"{where}: no list index {token!r}")
        return current[int(token)]
    raise TransformError(f"{where}: can't read {token!r} from a {type(current).__name__}")


# --- format_message ----------------------------------------------------------

# `{value}` or `{value.a.0.b}`; `{{`/`}}` are literal braces. Deliberately not
# str.format, whose attribute access (`{value.__class__}`) reaches Python internals.
_PLACEHOLDER = re.compile(r"\{\{|\}\}|\{([^{}]*)\}")
_PATH = re.compile(r"value(?:\.[A-Za-z0-9_-]+)*")


def render_template(template: str, value: Any) -> str:
    def replace(match: re.Match[str]) -> str:
        token = match.group(0)
        if token == "{{":
            return "{"
        if token == "}}":
            return "}"
        path = match.group(1).strip()
        if not _PATH.fullmatch(path):
            raise TransformError(
                f"unsupported placeholder {token!r}; use {{value}} or {{value.field}}"
            )
        resolved = value
        for part in path.split(".")[1:]:
            resolved = _step(_as_structured(resolved), part, token)
        return _text(resolved)

    return _PLACEHOLDER.sub(replace, template)


def _text(value: Any) -> str:
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False)


# --- coerce ------------------------------------------------------------------

_TRUE = {"true", "yes", "1"}
_FALSE = {"false", "no", "0"}


def _coerce(value: Any, target_type: str | None) -> Any:
    if target_type == "string":
        return _text(value)
    if target_type == "number":
        if isinstance(value, bool):
            raise TransformError("won't coerce a boolean to a number")
        if isinstance(value, int | float):
            return value
        return _parse_number(str(value).strip())
    if target_type == "boolean":
        if isinstance(value, bool):
            return value
        text = str(value).strip().lower()
        if text in _TRUE:
            return True
        if text in _FALSE:
            return False
        raise TransformError(f"{text[:40]!r} is not true/false/yes/no/1/0")
    raise TransformError("coerce needs a target type: string, number or boolean")


def _parse_number(text: str) -> int | float:
    try:
        return int(text)
    except ValueError:
        pass
    try:
        number = float(text)
    except ValueError as exc:
        raise TransformError(f"{text[:40]!r} is not a number") from exc
    if not math.isfinite(number):
        raise TransformError(f"{text[:40]!r} is not a finite number")
    return number
