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
from typing import Any, Protocol


class TransformSpec(Protocol):
    type: str
    pointer: str | None
    field: str | None
    template: str | None
    target_type: str | None


class TransformError(ValueError):
    """A transform couldn't be applied to the value it received."""


def apply_transform(spec: TransformSpec, value: Any) -> Any:
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
