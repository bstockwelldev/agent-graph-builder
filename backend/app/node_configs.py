"""Typed per-node-type config validation.

Part of the studio-consolidation program
(docs/planning/features/studio-consolidation-plan.md, Phase 1). This module
does *not* change the wire shape of ``GraphNode.config`` — it stays a
permissive ``dict[str, Any]`` on ``GraphDefinition`` so every existing stored
graph and playground config form keeps working unmodified. Instead, each new
node type absorbed from micro-ui-agent-builder's ``FlowStep`` vocabulary gets
a typed Pydantic model here that ``compiler.py`` validates the raw config
against, turning the field-level rules ported from that repo's
``packages/shared/src/flow-validation.ts`` into ``Diagnostic``s.

Field names intentionally match the camelCase convention already used by
every node's ``config`` dict in this codebase (e.g. ``variableName``,
``systemPrompt``, ``toolName`` in ``backend/app/nodes.py``), not Python's
snake_case, since config values are authored as JSON.

The original six node types (input/prompt/llm/tool/router/output) are
intentionally *not* given typed models here: their config handling in
``nodes.py`` is already tolerant-by-design (e.g. an ``llm`` node with no
``model`` falls through to the provider's default), and porting
micro-ui-agent-builder's stricter "model is required" rule for the existing
``llm`` type would be a breaking behavior change unrelated to this program.
"""

from __future__ import annotations

import json
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator

from .genui import surface_error
from .models import NodeType
from .transforms import node_transform_spec, transform_field_error


class GuardrailConfig(BaseModel):
    """Input validation gate. No required fields — see MUI's own
    ``validateFlowSteps`` (guardrail is documentation-only there too)."""

    allowUrls: bool = False


class RubricConfig(BaseModel):
    """Static prompt-quality gate. No required fields."""

    rubricFailOnFindings: bool = False


class BranchConfig(BaseModel):
    """Substring gate on the upstream value. ``content`` may be empty — an
    empty branch is a documentation-only gate, per the original ``GraphEdge``
    condition convention this mirrors."""

    content: str | None = None


class ToolLoopConfig(BaseModel):
    """Multi-step tool-loop agent. Both fields are required — ported from
    MUI's ``tool_loop`` case in ``flow-validation.ts``, which is the one
    place that repo's own validator requires a model id and a bounded
    iteration count."""

    model: str = Field(min_length=1)
    provider: str | None = None
    systemPrompt: str | None = None
    maxToolIterations: int = Field(ge=1, le=64)


class CodeExecConfig(BaseModel):
    """Declares code-execution expectations. ``content`` (the contract /
    instructions) is required; no sandbox executor exists yet (Phase 2)."""

    content: str = Field(min_length=1)
    codeExecLanguage: Literal["javascript", "typescript", "python"] | None = None
    toolName: str | None = None


class HumanGateConfig(BaseModel):
    """Pause-for-approval checkpoint. ``content`` is required; the optional
    GenUI checkpoint surface must be valid JSON in the GenUI surface shape
    (genui.py, mirroring the studio's schema)."""

    content: str = Field(min_length=1)
    genuiCheckpointSurfaceJson: str | None = None

    @field_validator("genuiCheckpointSurfaceJson")
    @classmethod
    def _must_be_valid_json(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return value
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError as exc:
            raise ValueError(f"must be valid JSON ({exc.msg})") from exc
        error = surface_error(parsed)
        if error:
            raise ValueError(f"isn't a GenUI surface: {error}")
        return value


class SubgraphConfig(BaseModel):
    """Large-graph complexity, Wave 7c (STO-612): another saved graph run as
    a nested run. ``version`` is ``latest`` (newest release, else the saved
    draft), ``draft``, or a release id; ``inputMapping`` maps each child
    input variable to a template over the parent's variables plus
    ``{upstream}``."""

    graphId: str = Field(min_length=1)
    version: str = Field(default="latest", min_length=1)
    inputMapping: dict[str, str] | None = None


class TransformNodeConfig(BaseModel):
    """A transform node (transforms.py): inline (``type`` plus the one field
    that type needs) or bound to a Transforms library entry
    (``transformId``, resolved like any other binding)."""

    type: Literal["select", "wrap", "format_message", "coerce"] | None = None
    pointer: str | None = None
    field: str | None = None
    template: str | None = None
    targetType: Literal["string", "number", "boolean"] | None = None
    transformId: str | None = None

    @model_validator(mode="after")
    def _complete(self) -> TransformNodeConfig:
        if self.transformId:
            return self
        if self.type is None:
            raise ValueError("choose a transform type, or bind one from the library")
        error = transform_field_error(node_transform_spec(self.model_dump()))
        if error:
            raise ValueError(error)
        return self


class DecisionRule(BaseModel):
    """One deterministic rule on a decision node: when ``match`` (case-insensitive
    substring) appears in the upstream text, the node returns ``verdict``
    without calling any model. Policy-team owned; never depends on model
    judgment."""

    name: str = Field(min_length=1)
    match: str = Field(min_length=1)
    verdict: str = Field(min_length=1)


class DecisionConfig(BaseModel):
    """Constrained decision node (decision_models/).

    ``schema`` names a built-in schema (``route`` / ``gate`` / ``triage``) or
    carries an inline JSON Schema object (restricted subset -- see
    ``decision_models.schemas.model_from_json_schema``). ``onLowConfidence``
    is ``"default"`` (take the default edge -- human review path) unless the
    graph performs state changes downstream, in which case ``"fail"`` fails
    the run rather than acting on an uncalibrated guess.
    """

    schema: str | dict[str, Any] = "route"
    outcomeField: str | None = None
    abstainValues: list[str] = Field(default_factory=lambda: ["abstain", "needs_review"])
    provider: str | None = None
    model: str | None = None
    threshold: float = Field(default=0.7, ge=0.0, le=1.0)
    onLowConfidence: Literal["default", "fail"] = "default"
    rules: list[DecisionRule] = Field(default_factory=list)
    systemPrompt: str | None = None

    @model_validator(mode="after")
    def _check_schema_and_rules(self) -> DecisionConfig:
        from .decision_models.schemas import resolve_decision_schema

        if isinstance(self.schema, dict) and not self.outcomeField:
            raise ValueError("outcomeField is required with an inline schema")
        try:
            schema_cls, outcome_values = resolve_decision_schema(
                self.schema, self.outcomeField
            )
        except ValueError as exc:
            raise ValueError(str(exc)) from exc
        for rule in self.rules:
            if outcome_values and rule.verdict not in outcome_values:
                raise ValueError(
                    f"rule {rule.name!r}: verdict {rule.verdict!r} is not a "
                    f"valid outcome (expected one of {outcome_values})"
                )
        # Deterministic rule payloads only carry outcome + confidence (+ an
        # optional reason code), so rules are rejected when the schema demands
        # other required fields the rule cannot fill.
        if self.rules and isinstance(self.schema, dict):
            unfillable = [
                name
                for name, f in schema_cls.model_fields.items()
                if f.is_required()
                and name not in {schema_cls.outcome_field(), "confidence"}
            ]
            if unfillable:
                raise ValueError(
                    f"rules require fillable schemas: required fields "
                    f"{unfillable} cannot be set by a deterministic rule"
                )
        return self


class ExtractConfig(BaseModel):
    """Document extraction node (extraction/).

    ``source="upload"``: the run input's ``documentId`` key selects the
    upload, falling back to the graph's latest upload.
    ``source="variable"``: ``variableName`` names a run variable holding a
    documentId. ``stages`` is the deterministic routing pipeline -- unknown
    stage names fail at save time. ``provider="deterministic"`` runs the
    RuleGate across the enabled stages, ``provider="vision"`` calls a
    vision model directly, ``provider="stub"`` returns deterministic
    fixture output (public-demo default). ``outputSchema`` is an inline
    JSON Schema (restricted subset -- see
    ``extraction.schemas.model_from_json_schema``); omitted, the built-in
    document-facts schema applies.
    """

    source: Literal["upload", "variable"] = "upload"
    variableName: str | None = None
    stages: list[Literal["text", "ocr", "vision"]] = Field(
        default_factory=lambda: ["text", "ocr"]
    )
    outputSchema: dict[str, Any] | None = None
    provider: Literal["stub", "deterministic", "vision"] = "stub"
    model: str | None = None
    threshold: float = Field(default=0.7, ge=0.0, le=1.0)
    pageLimit: int = Field(default=10, ge=1, le=100)

    @model_validator(mode="after")
    def _check_extract(self) -> ExtractConfig:
        # Literal["text", "ocr", "vision"] already rejects unknown stage
        # names; an empty list would leave deterministic routing with no
        # backend to route to.
        if not self.stages:
            raise ValueError(
                "stages must name at least one of 'text', 'ocr', 'vision'"
            )
        if self.source == "variable" and not self.variableName:
            raise ValueError("variableName is required when source='variable'")
        if self.outputSchema is not None:
            from .extraction.schemas import model_from_json_schema

            try:
                model_from_json_schema("CustomExtract", self.outputSchema)
            except ValueError as exc:
                raise ValueError(f"invalid outputSchema: {exc}") from exc
        return self


_CONFIG_MODELS: dict[NodeType, type[BaseModel]] = {
    NodeType.GUARDRAIL: GuardrailConfig,
    NodeType.RUBRIC: RubricConfig,
    NodeType.BRANCH: BranchConfig,
    NodeType.TOOL_LOOP: ToolLoopConfig,
    NodeType.CODE_EXEC: CodeExecConfig,
    NodeType.HUMAN_GATE: HumanGateConfig,
    NodeType.SUBGRAPH: SubgraphConfig,
    NodeType.TRANSFORM: TransformNodeConfig,
    NodeType.DECISION: DecisionConfig,
    NodeType.EXTRACT: ExtractConfig,
}


def validate_node_config(node_type: NodeType, config: dict[str, Any]) -> list[str]:
    """Return human-readable validation error messages for ``config``, or an
    empty list when valid. Node types with no registered typed model (the
    original six) always return ``[]`` — their validation stays in
    ``nodes.py``'s executors, unchanged by this program.
    """
    model = _CONFIG_MODELS.get(node_type)
    if model is None:
        return []
    try:
        model.model_validate(config)
    except ValidationError as exc:
        return [_format_error(error) for error in exc.errors()]
    return []


def _format_error(error: dict[str, Any]) -> str:
    field = ".".join(str(part) for part in error.get("loc", ())) or "config"
    return f"{field}: {error.get('msg', 'invalid value')}"

