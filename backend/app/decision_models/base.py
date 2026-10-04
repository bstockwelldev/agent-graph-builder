"""Provider-neutral decision-model interface.

A "decision model" is the fast, constrained classification/routing/gating
role in an agentic workflow: a compact instruct model, temperature 0, strict
JSON-schema output, with an explicit abstain path -- not free-form
generation.

Conventions mirror `providers/base.py`'s `ChatModel`: callers talk only to
this protocol; adding a backend means adding an adapter module, not touching
callers.
"""

from __future__ import annotations

import os
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol, TypeVar

from pydantic import BaseModel

from ..providers.base import require_live_provider_allowed

T = TypeVar("T", bound=BaseModel)

DEFAULT_ABSTAIN_VALUES = frozenset({"abstain", "needs_review", "unknown"})


class DecisionSchemaError(Exception):
    """A backend's output failed schema validation, even after one repair retry.

    Callers must treat this as "no decision" -- escalate or abstain. Never
    silently coerce a failed validation into a guessed outcome.
    """


@dataclass
class DecisionResult:
    """Envelope around a validated decision payload."""

    payload: BaseModel
    confidence: float
    abstained: bool
    provider_name: str
    model: str
    latency_ms: float
    attempts: int
    raw: str
    rule_hit: str | None = None  # rule name when a RuleGate decided w/o the model


class DecisionSchema(BaseModel):
    """Base class for decision payloads. Subclasses declare their outcome field."""

    @classmethod
    def outcome_field(cls) -> str:
        raise NotImplementedError(f"{cls.__name__} must define outcome_field()")

    def outcome_value(self) -> str:
        return str(getattr(self, self.outcome_field()))

    def reported_confidence(self) -> float:
        try:
            return max(0.0, min(1.0, float(getattr(self, "confidence", 1.0))))
        except (TypeError, ValueError):
            return 0.0


class DecisionModel(Protocol):
    provider_name: str
    model: str

    async def decide(
        self,
        *,
        system_prompt: str | None,
        user_prompt: str,
        schema: type[T],
        abstain_values: set[str] | frozenset[str] | None = None,
        history: list[dict[str, str]] | None = None,
    ) -> DecisionResult:
        """Return a schema-validated decision. Raises DecisionSchemaError when
        the backend cannot produce valid output."""


def build_result(
    *,
    payload: DecisionSchema,
    provider_name: str,
    model: str,
    latency_ms: float,
    attempts: int,
    raw: str,
    abstain_values: set[str] | frozenset[str] | None = None,
    rule_hit: str | None = None,
) -> DecisionResult:
    values = abstain_values if abstain_values is not None else DEFAULT_ABSTAIN_VALUES
    abstained = payload.outcome_value() in values
    return DecisionResult(
        payload=payload,
        confidence=payload.reported_confidence(),
        abstained=abstained,
        provider_name=provider_name,
        model=model,
        latency_ms=latency_ms,
        attempts=attempts,
        raw=raw,
        rule_hit=rule_hit,
    )


@dataclass
class Rule:
    """One deterministic rule: if `matches(input)` then decide without a model."""

    name: str
    matches: Callable[[str], bool]
    decide: Callable[[], DecisionSchema]


class RuleGate:
    """Deterministic rules evaluated before any model call.

    This is the "deterministic rules first" layer of the routing topology:
    auth, policy, destructive-op blocks -- things that must never depend on
    a model's judgment.
    """

    def __init__(self, rules: list[Rule]) -> None:
        self.rules = rules

    def check(self, user_prompt: str) -> tuple[str, DecisionSchema] | None:
        for rule in self.rules:
            if rule.matches(user_prompt):
                return rule.name, rule.decide()
        return None


async def decide_with_rules(
    gate: RuleGate,
    model: DecisionModel,
    *,
    system_prompt: str | None,
    user_prompt: str,
    schema: type[T],
    abstain_values: set[str] | frozenset[str] | None = None,
    history: list[dict[str, str]] | None = None,
) -> DecisionResult:
    """Run the deterministic gate first; only call the model on a miss."""
    started = time.perf_counter()
    hit = gate.check(user_prompt)
    if hit is not None:
        name, payload = hit
        return build_result(
            payload=payload,
            provider_name="rule_gate",
            model=name,
            latency_ms=(time.perf_counter() - started) * 1000.0,
            attempts=0,
            raw=f"rule:{name}",
            abstain_values=abstain_values,
            rule_hit=name,
        )
    return await model.decide(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        schema=schema,
        abstain_values=abstain_values,
        history=history,
    )


def resolve_action(result: DecisionResult, *, threshold: float) -> str:
    """Separate confidence from authority.

    Returns the payload's outcome value only when the decision did not
    abstain AND its reported confidence clears the threshold; otherwise
    returns "escalate". A model reporting confidence=0.97 is not a
    calibrated probability -- set the threshold against a labeled eval set.
    """
    if result.abstained or result.confidence < threshold:
        return "escalate"
    payload = result.payload
    assert isinstance(payload, DecisionSchema)
    return payload.outcome_value()


def resolve_decision_provider(explicit: str | None = None) -> str:
    if explicit is not None:
        return explicit.strip().lower()
    return os.environ.get("DECISION_PROVIDER", "stub").strip().lower() or "stub"


def get_decision_model(
    model: str | None = None,
    provider: str | None = None,
    *,
    api_key: str | None = None,
) -> DecisionModel:
    """Build a DecisionModel. Stub is the default so the public demo and CI
    stay keyless and deterministic; live providers go through the same
    PUBLIC_DEMO_MODE gating as chat models."""
    resolved = resolve_decision_provider(provider)
    if resolved == "ollama":
        require_live_provider_allowed("ollama", api_key)
        from .ollama import OllamaDecisionModel

        return OllamaDecisionModel(
            model=model or os.environ.get("DECISION_OLLAMA_MODEL", "qwen3:8b")
        )
    if resolved == "stub":
        from .stub import StubDecisionModel

        return StubDecisionModel(model=model or "stub")
    raise ValueError(
        f"unknown decision provider: {resolved!r} (expected 'stub' or 'ollama')"
    )
