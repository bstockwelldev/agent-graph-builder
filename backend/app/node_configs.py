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
    GenUI checkpoint surface must at least be valid JSON (full schema
    validation against a GenUI node shape lands with GenUI rendering)."""

    content: str = Field(min_length=1)
    genuiCheckpointSurfaceJson: str | None = None

    @field_validator("genuiCheckpointSurfaceJson")
    @classmethod
    def _must_be_valid_json(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return value
        try:
            json.loads(value)
        except json.JSONDecodeError as exc:
            raise ValueError(f"must be valid JSON ({exc.msg})") from exc
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


_CONFIG_MODELS: dict[NodeType, type[BaseModel]] = {
    NodeType.GUARDRAIL: GuardrailConfig,
    NodeType.RUBRIC: RubricConfig,
    NodeType.BRANCH: BranchConfig,
    NodeType.TOOL_LOOP: ToolLoopConfig,
    NodeType.CODE_EXEC: CodeExecConfig,
    NodeType.HUMAN_GATE: HumanGateConfig,
    NodeType.SUBGRAPH: SubgraphConfig,
    NodeType.TRANSFORM: TransformNodeConfig,
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
