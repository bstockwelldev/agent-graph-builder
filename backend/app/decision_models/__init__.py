"""Decision models -- the fast, constrained classification/routing/gating role.

Ported from the DecisionModel spike (see the career-goal workspace); adapted
to this repo's conventions: provider-neutral protocol like `ChatModel`
(`providers/base.py`), stub default for offline demos, and
`require_live_provider_allowed` gating for live providers in PUBLIC_DEMO_MODE.
"""

from .base import (
    DEFAULT_ABSTAIN_VALUES,
    DecisionModel,
    DecisionResult,
    DecisionSchema,
    DecisionSchemaError,
    Rule,
    RuleGate,
    build_result,
    decide_with_rules,
    get_decision_model,
    resolve_action,
    resolve_decision_provider,
)
from .schemas import (
    SCHEMAS,
    GateDecision,
    RouteDecision,
    TriageDecision,
    model_from_json_schema,
    resolve_decision_schema,
    rule_payload,
)

__all__ = [
    "DEFAULT_ABSTAIN_VALUES",
    "SCHEMAS",
    "DecisionModel",
    "DecisionResult",
    "DecisionSchema",
    "DecisionSchemaError",
    "GateDecision",
    "RouteDecision",
    "Rule",
    "RuleGate",
    "TriageDecision",
    "build_result",
    "decide_with_rules",
    "get_decision_model",
    "model_from_json_schema",
    "resolve_action",
    "resolve_decision_provider",
    "resolve_decision_schema",
    "rule_payload",
]
