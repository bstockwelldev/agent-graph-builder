"""Decision schemas: constrained action spaces for the decision node.

Design rules:
- enums, bounded numbers, no free-text rationale fields -- reason *codes* only
- every schema has an explicit abstain outcome
- confidence is reported but never trusted without calibration

Named schemas (`route` / `gate` / `triage`) cover the common cases. Inline
custom JSON Schemas are supported through a restricted subset (see
`model_from_json_schema`).
"""

from __future__ import annotations

import re
from enum import StrEnum
from typing import Any

from pydantic import ConfigDict, Field, create_model

from .base import DecisionSchema


# ---------------------------------------------------------------------------
# Routing: which execution path should handle this request?
# ---------------------------------------------------------------------------


class Route(StrEnum):
    LOCAL_ANSWER = "local_answer"
    FRONTIER_REASONING = "frontier_reasoning"
    HUMAN_REVIEW = "human_review"
    ABSTAIN = "abstain"


class RouteReason(StrEnum):
    SIMPLE_REQUEST = "simple_request"
    MULTI_STEP_REASONING = "multi_step_reasoning"
    SENSITIVE_OR_HIGH_IMPACT = "sensitive_or_high_impact"
    INSUFFICIENT_CONTEXT = "insufficient_context"
    POLICY_RULE = "policy_rule"


class RouteDecision(DecisionSchema):
    route: Route
    confidence: float = Field(ge=0.0, le=1.0)
    reason_code: RouteReason

    @classmethod
    def outcome_field(cls) -> str:
        return "route"


# ---------------------------------------------------------------------------
# Gating: is this action allowed to proceed?
# ---------------------------------------------------------------------------


class GateVerdict(StrEnum):
    ALLOW = "allow"
    DENY = "deny"
    NEEDS_REVIEW = "needs_review"


class GateReason(StrEnum):
    POLICY_ALLOWLIST = "policy_allowlist"
    DESTRUCTIVE_OR_IRREVERSIBLE = "destructive_or_irreversible"
    PII_OR_SECRET_RISK = "pii_or_secret_risk"
    UNCLEAR_SCOPE = "unclear_scope"
    POLICY_RULE = "policy_rule"


class GateDecision(DecisionSchema):
    verdict: GateVerdict
    confidence: float = Field(ge=0.0, le=1.0)
    reason_code: GateReason

    @classmethod
    def outcome_field(cls) -> str:
        return "verdict"


# ---------------------------------------------------------------------------
# Triage: how urgent is this item?
# ---------------------------------------------------------------------------


class TriageBucket(StrEnum):
    P1_CRITICAL = "p1_critical"
    P2_HIGH = "p2_high"
    P3_NORMAL = "p3_normal"
    P4_LOW = "p4_low"
    NEEDS_REVIEW = "needs_review"


class TriageReason(StrEnum):
    OUTAGE_OR_SAFETY = "outage_or_safety"
    CUSTOMER_IMPACTING = "customer_impacting"
    FEATURE_REQUEST = "feature_request"
    COSMETIC = "cosmetic"
    UNCLEAR = "unclear"
    POLICY_RULE = "policy_rule"


class TriageDecision(DecisionSchema):
    bucket: TriageBucket
    priority: int = Field(ge=1, le=5)
    confidence: float = Field(ge=0.0, le=1.0)
    rationale_code: TriageReason

    @classmethod
    def outcome_field(cls) -> str:
        return "bucket"


SCHEMAS: dict[str, type[DecisionSchema]] = {
    "route": RouteDecision,
    "gate": GateDecision,
    "triage": TriageDecision,
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


def model_from_json_schema(
    name: str, schema: dict[str, Any], outcome_field: str
) -> type[DecisionSchema]:
    """Build a DecisionSchema from a restricted JSON Schema subset.

    Supported: `type: object`; properties of type string (with optional
    `enum`), integer / number (with optional minimum/maximum), boolean;
    `required`; `additionalProperties` is always forced to false. Anything
    else raises ValueError (surfaced as a config diagnostic at graph-save
    time, never at runtime).
    """
    if schema.get("type", "object") != "object":
        raise ValueError("custom decision schema must have type 'object'")
    properties = schema.get("properties")
    if not isinstance(properties, dict) or not properties:
        raise ValueError("custom decision schema needs a non-empty 'properties' map")
    if outcome_field not in properties:
        raise ValueError(
            f"outcomeField {outcome_field!r} is not a property of the schema"
        )
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

    model = create_model(
        f"{name}Decision",
        __config__=ConfigDict(extra="forbid"),
        __base__=DecisionSchema,
        **field_defs,
    )
    model.outcome_field = classmethod(lambda cls: outcome_field)  # type: ignore[method-assign]
    return model


def resolve_decision_schema(
    schema_ref: str | dict[str, Any], outcome_field: str | None
) -> tuple[type[DecisionSchema], list[str]]:
    """Resolve a decision node's `schema` config to (model class, outcome values).

    Raises ValueError on anything invalid -- callers surface this as a config
    diagnostic (save time) or a run failure (defense in depth).
    """
    if isinstance(schema_ref, str):
        try:
            cls = SCHEMAS[schema_ref]
        except KeyError:
            raise ValueError(
                f"unknown decision schema {schema_ref!r} "
                f"(expected one of {sorted(SCHEMAS)} or an inline JSON Schema)"
            ) from None
        outcome_values = [m.value for m in cls.model_fields[cls.outcome_field()].annotation]
        return cls, outcome_values
    if isinstance(schema_ref, dict):
        if not outcome_field:
            raise ValueError("outcomeField is required with an inline schema")
        cls = model_from_json_schema("Custom", schema_ref, outcome_field)
        annotation = cls.model_fields[outcome_field].annotation
        try:
            outcome_values = [m.value for m in annotation]  # enum
        except TypeError:
            outcome_values = []
        return cls, outcome_values
    raise ValueError("decision schema must be a name or an inline JSON Schema object")


def rule_payload(schema_cls: type[DecisionSchema], verdict: str) -> DecisionSchema:
    """Build a deterministic rule-hit payload: the verdict, confidence 1.0,
    and the schema's policy reason code when it has one."""
    fields = schema_cls.model_fields
    kwargs: dict[str, Any] = {schema_cls.outcome_field(): verdict}
    if "confidence" in fields:
        kwargs["confidence"] = 1.0
    for reason_field in ("reason_code", "rationale_code"):
        if reason_field in fields:
            annotation = fields[reason_field].annotation
            try:
                members = list(annotation)
            except TypeError:
                break
            policy = next((m for m in members if "policy" in m.value), None)
            kwargs[reason_field] = policy if policy is not None else members[0]
            break
    return schema_cls(**kwargs)
