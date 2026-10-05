"""Deterministic decision backend for offline demos and automated tests.

Mirrors `providers/stub.py`: keyword rules, no network, same DecisionModel
contract. Deterministic so CI stays green without Ollama.
"""

from __future__ import annotations

import time
from typing import TypeVar

from .base import DecisionModel, DecisionResult, DecisionSchema, build_result
from .schemas import (
    GateDecision,
    GateReason,
    GateVerdict,
    Route,
    RouteDecision,
    RouteReason,
    TriageBucket,
    TriageDecision,
    TriageReason,
)

T = TypeVar("T", bound=DecisionSchema)


def _contains_any(text: str, keywords: set[str]) -> bool:
    lowered = text.lower()
    return any(k in lowered for k in keywords)


_SENSITIVE = {
    "refund", "chargeback", "dispute", "delete", "drop table", "production",
    "password", "secret", "api key", "legal", "salary", "medical", "terminate",
}
_COMPLEX = {
    "design", "architect", "migrat", "plan", "strategy", "trade-off",
    "tradeoff", "compare", "roadmap",
}
_SIMPLE = {
    "what is", "what are", "how does", "how do", "define", "explain",
    "haiku", "summarize", "translate",
}
_DESTRUCTIVE = {
    "delete", "drop", "rm -rf", "production", "password", "secret",
    "payment", "charge",
}
_PII = {"email address", "ssn", "social security", "phone number"}
_CRITICAL = {"outage", "down", "500", "breach", "data loss", "all customers"}
_HIGH = {"broken checkout", "can't pay", "customer", "complaint"}
_LOW = {"typo", "footer", "cosmetic", "color", "font"}


def _route_decision(user_prompt: str) -> RouteDecision:
    text = user_prompt.strip()
    if not text or len(text) < 8 or text.strip("?!. ") == "":
        return RouteDecision(
            route=Route.ABSTAIN, confidence=0.35,
            reason_code=RouteReason.INSUFFICIENT_CONTEXT,
        )
    if _contains_any(text, _SENSITIVE):
        return RouteDecision(
            route=Route.HUMAN_REVIEW, confidence=0.92,
            reason_code=RouteReason.SENSITIVE_OR_HIGH_IMPACT,
        )
    if _contains_any(text, _COMPLEX):
        return RouteDecision(
            route=Route.FRONTIER_REASONING, confidence=0.85,
            reason_code=RouteReason.MULTI_STEP_REASONING,
        )
    if _contains_any(text, _SIMPLE):
        return RouteDecision(
            route=Route.LOCAL_ANSWER, confidence=0.90,
            reason_code=RouteReason.SIMPLE_REQUEST,
        )
    return RouteDecision(
        route=Route.LOCAL_ANSWER, confidence=0.55,
        reason_code=RouteReason.SIMPLE_REQUEST,
    )


def _gate_decision(user_prompt: str) -> GateDecision:
    text = user_prompt.strip()
    if not text or len(text) < 8:
        return GateDecision(
            verdict=GateVerdict.NEEDS_REVIEW, confidence=0.50,
            reason_code=GateReason.UNCLEAR_SCOPE,
        )
    if _contains_any(text, _PII):
        return GateDecision(
            verdict=GateVerdict.NEEDS_REVIEW, confidence=0.70,
            reason_code=GateReason.PII_OR_SECRET_RISK,
        )
    if _contains_any(text, _DESTRUCTIVE):
        return GateDecision(
            verdict=GateVerdict.DENY, confidence=0.90,
            reason_code=GateReason.DESTRUCTIVE_OR_IRREVERSIBLE,
        )
    return GateDecision(
        verdict=GateVerdict.ALLOW, confidence=0.80,
        reason_code=GateReason.POLICY_ALLOWLIST,
    )


def _triage_decision(user_prompt: str) -> TriageDecision:
    text = user_prompt.strip()
    if not text or len(text) < 8:
        return TriageDecision(
            bucket=TriageBucket.NEEDS_REVIEW, priority=3, confidence=0.40,
            rationale_code=TriageReason.UNCLEAR,
        )
    if _contains_any(text, _CRITICAL):
        return TriageDecision(
            bucket=TriageBucket.P1_CRITICAL, priority=1, confidence=0.95,
            rationale_code=TriageReason.OUTAGE_OR_SAFETY,
        )
    if _contains_any(text, _HIGH):
        return TriageDecision(
            bucket=TriageBucket.P2_HIGH, priority=2, confidence=0.85,
            rationale_code=TriageReason.CUSTOMER_IMPACTING,
        )
    if _contains_any(text, _LOW):
        return TriageDecision(
            bucket=TriageBucket.P4_LOW, priority=4, confidence=0.90,
            rationale_code=TriageReason.COSMETIC,
        )
    if "feature request" in text.lower() or "add " in text.lower():
        return TriageDecision(
            bucket=TriageBucket.P3_NORMAL, priority=3, confidence=0.80,
            rationale_code=TriageReason.FEATURE_REQUEST,
        )
    return TriageDecision(
        bucket=TriageBucket.P3_NORMAL, priority=3, confidence=0.55,
        rationale_code=TriageReason.UNCLEAR,
    )


class StubDecisionModel:
    provider_name = "stub"

    def __init__(self, model: str = "stub") -> None:
        self.model = model

    async def decide(
        self,
        *,
        system_prompt: str | None,
        user_prompt: str,
        schema: type[T],
        abstain_values: set[str] | frozenset[str] | None = None,
        history: list[dict[str, str]] | None = None,
    ) -> DecisionResult:
        del system_prompt, history  # deterministic keyword rules need neither
        started = time.perf_counter()
        if issubclass(schema, RouteDecision):
            payload: DecisionSchema = _route_decision(user_prompt)
        elif issubclass(schema, GateDecision):
            payload = _gate_decision(user_prompt)
        elif issubclass(schema, TriageDecision):
            payload = _triage_decision(user_prompt)
        else:
            raise ValueError(f"stub has no rules for schema {schema.__name__}")
        return build_result(
            payload=payload,
            provider_name=self.provider_name,
            model=self.model,
            latency_ms=(time.perf_counter() - started) * 1000.0,
            attempts=1,
            raw=payload.model_dump_json(),
            abstain_values=abstain_values,
        )
