"""GenUI surface schema (resource-forms-consistency-plan, slice 5): the shape
a ``human_gate`` node's ``genuiCheckpointSurfaceJson`` must have, checked at
validate/compile time so a broken surface is a field diagnostic in the
editor rather than a blank checkpoint mid-run.

Mirrors ``apps/studio/lib/genui.ts`` (the zod schema the studio renders
with). Both are tested against
``packages/agent-graph-sdk/contract/genui-surfaces.json`` so they can't
drift. ``$ref`` values (``{"$ref": "/nodes/<id>/output"}``) are only checked
for shape here; the studio resolves them against the paused run.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError


class GenuiRef(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    ref: str = Field(alias="$ref", pattern=r"^/")


Rows = GenuiRef | list[dict[str, Any]]
Text = GenuiRef | str


class _Node(BaseModel):
    id: str | None = None


class StackProps(BaseModel):
    gap: float | None = Field(default=None, ge=0, le=64)
    direction: Literal["col", "row"] | None = None


class Stack(_Node):
    type: Literal["Stack"]
    props: StackProps | None = None
    children: list[GenuiNode]


class TextProps(BaseModel):
    content: Text


class TextNode(_Node):
    type: Literal["Text"]
    props: TextProps


class Markdown(_Node):
    type: Literal["Markdown"]
    props: TextProps


class ButtonProps(BaseModel):
    label: str
    actionId: str | None = None


class Button(_Node):
    type: Literal["Button"]
    id: str
    props: ButtonProps


class CardProps(BaseModel):
    title: str | None = None


class Card(_Node):
    type: Literal["Card"]
    props: CardProps | None = None
    children: list[GenuiNode] | None = None


class FormFieldProps(BaseModel):
    label: str
    inputType: Literal["text", "number"] | None = None
    placeholder: str | None = None


class FormField(_Node):
    type: Literal["FormField"]
    id: str
    props: FormFieldProps


class Option(BaseModel):
    value: str
    label: str | None = None


class SelectProps(BaseModel):
    label: str
    options: list[str | Option] = Field(min_length=1)


class Select(_Node):
    type: Literal["Select"]
    id: str
    props: SelectProps


class CheckboxProps(BaseModel):
    label: str


class Checkbox(_Node):
    type: Literal["Checkbox"]
    id: str
    props: CheckboxProps


class ApprovalProps(BaseModel):
    title: str | None = None
    summary: Text | None = None
    approveLabel: str | None = None
    rejectLabel: str | None = None


class Approval(_Node):
    type: Literal["Approval"]
    props: ApprovalProps | None = None


class ChartProps(BaseModel):
    kind: Literal["bar", "line", "area"] | None = None
    data: Rows
    x: str
    y: str | Annotated[list[str], Field(min_length=1, max_length=8)]
    title: str | None = None
    height: float | None = Field(default=None, ge=120, le=480)


class Chart(_Node):
    type: Literal["Chart"]
    props: ChartProps


class Column(BaseModel):
    key: str
    label: str | None = None


class TableProps(BaseModel):
    rows: Rows
    columns: list[str | Column] | None = None
    caption: str | None = None


class Table(_Node):
    type: Literal["Table"]
    props: TableProps


class KeyValueItem(BaseModel):
    label: str
    value: Any = None


class KeyValueProps(BaseModel):
    items: GenuiRef | list[KeyValueItem] | dict[str, Any]
    title: str | None = None


class KeyValue(_Node):
    type: Literal["KeyValue"]
    props: KeyValueProps


class DiffProps(BaseModel):
    before: Any = None
    after: Any = None
    title: str | None = None


class Diff(_Node):
    type: Literal["Diff"]
    props: DiffProps


class DiagramProps(BaseModel):
    source: Text
    title: str | None = None


class Diagram(_Node):
    type: Literal["Diagram"]
    props: DiagramProps


GenuiNode = Annotated[
    Stack
    | TextNode
    | Markdown
    | Button
    | Card
    | FormField
    | Select
    | Checkbox
    | Approval
    | Chart
    | Table
    | KeyValue
    | Diff
    | Diagram,
    Field(discriminator="type"),
]

Stack.model_rebuild()
Card.model_rebuild()


class GenuiSurface(BaseModel):
    root: GenuiNode


_SURFACE = TypeAdapter(GenuiSurface)
# Union tags and member names pydantic puts in error paths.
_PATH_NOISE = {
    "Stack",
    "Text",
    "Markdown",
    "Button",
    "Card",
    "FormField",
    "Select",
    "Checkbox",
    "Approval",
    "Chart",
    "Table",
    "KeyValue",
    "Diff",
    "Diagram",
    "GenuiRef",
    "Option",
    "Column",
    "KeyValueItem",
}


def _is_path_part(part: str) -> bool:
    return part not in _PATH_NOISE and "[" not in part and part not in {"str", "float"}


def surface_error(value: Any) -> str | None:
    """Why `value` isn't a GenUI surface (``"root.props.options: …"``), or
    None when it is. The path skips pydantic's union tags so it reads like
    the studio's."""
    try:
        _SURFACE.validate_python(value)
    except ValidationError as exc:
        error = exc.errors()[0]
        path = [str(part) for part in error["loc"] if _is_path_part(str(part))]
        return f"{'.'.join(path) or 'surface'}: {error['msg']}"
    return None
