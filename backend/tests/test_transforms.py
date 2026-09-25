"""Deterministic transforms: the engine (app/transforms.py) and edge
transforms applied at runtime (ports.resolve_node_input)."""

from __future__ import annotations

import pytest

from app import runtime
from app.adapters import LangGraphAdapter
from app.demo_graph import build_demo_graph
from app.models import EdgeTransform
from app.transforms import TransformError, apply_transform, render_template


def t(**kwargs) -> EdgeTransform:
    return EdgeTransform(**kwargs)


class TestSelect:
    def test_reads_nested_fields_and_list_indexes(self) -> None:
        value = {"answer": {"items": [{"name": "a"}, {"name": "b"}]}}
        assert apply_transform(t(type="select", pointer="/answer/items/1/name"), value) == "b"

    def test_parses_json_text(self) -> None:
        assert apply_transform(t(type="select", pointer="/score"), '{"score": 0.9}') == 0.9

    def test_unescapes_pointer_tokens(self) -> None:
        value = {"a/b": {"m~n": 1}}
        assert apply_transform(t(type="select", pointer="/a~1b/m~0n"), value) == 1

    def test_empty_pointer_is_the_whole_value(self) -> None:
        assert apply_transform(t(type="select", pointer=""), {"a": 1}) == {"a": 1}

    @pytest.mark.parametrize(
        ("pointer", "value", "message"),
        [
            ("/missing", {"a": 1}, "no field 'missing'"),
            ("/5", [1, 2], "no list index '5'"),
            ("/a/b", {"a": 3}, "can't read 'b' from a int"),
            ("/a", "plain text", "not JSON"),
            ("a", {"a": 1}, "must start with '/'"),
        ],
    )
    def test_errors(self, pointer: str, value: object, message: str) -> None:
        with pytest.raises(TransformError, match=message):
            apply_transform(t(type="select", pointer=pointer), value)


def test_wrap() -> None:
    assert apply_transform(t(type="wrap", field="topic"), "indexes") == {"topic": "indexes"}


class TestFormatMessage:
    def test_value_and_paths(self) -> None:
        value = {"topic": "indexes", "scores": [3, 4], "meta": {"ok": True}}
        template = "Topic: {value.topic}, second: {value.scores.1}, meta: {value.meta}"
        assert render_template(template, value) == 'Topic: indexes, second: 4, meta: {"ok": true}'

    def test_whole_value_and_literal_braces(self) -> None:
        assert render_template("{{literal}} {value}", "hi") == "{literal} hi"

    @pytest.mark.parametrize(
        "template", ["{value.__class__}", "{value!r}", "{other}", "{value[0]}"]
    )
    def test_rejects_anything_but_value_paths(self, template: str) -> None:
        with pytest.raises(TransformError):
            render_template(template, {"a": 1})

    def test_unknown_field_is_an_error(self) -> None:
        with pytest.raises(TransformError, match="no field 'nope'"):
            render_template("{value.nope}", {"a": 1})


class TestCoerce:
    @pytest.mark.parametrize(
        ("target", "value", "expected"),
        [
            ("string", 3, "3"),
            ("string", {"a": 1}, '{"a": 1}'),
            ("number", " 42 ", 42),
            ("number", "2.5", 2.5),
            ("boolean", "Yes", True),
            ("boolean", "0", False),
            ("boolean", False, False),
        ],
    )
    def test_approved_coercions(self, target: str, value: object, expected: object) -> None:
        assert apply_transform(t(type="coerce", target_type=target), value) == expected

    @pytest.mark.parametrize(
        ("target", "value"),
        [("number", "abc"), ("number", "inf"), ("number", True), ("boolean", "maybe"), (None, "x")],
    )
    def test_rejects_the_rest(self, target: str | None, value: object) -> None:
        with pytest.raises(TransformError):
            apply_transform(t(type="coerce", target_type=target), value)


def test_capability_matrix_counts_every_node_type() -> None:
    from app.models import NodeType

    entry = next(
        e for e in LangGraphAdapter().capabilities().capabilities if e.feature == "node_executors"
    )
    assert entry.notes == f"All {len(NodeType)} node types run through the executor registry."


def test_capability_matrix_claims_transforms_are_applied() -> None:
    entry = next(
        e
        for e in LangGraphAdapter().capabilities().capabilities
        if e.feature == "deterministic_transforms"
    )
    assert entry.supported is True
    assert "resolve_node_input" in (entry.notes or "")


def _demo_with_output_transform(transform: EdgeTransform):
    graph = build_demo_graph()
    edges = [
        edge.model_copy(update={"transform": transform}) if edge.id == "e_tool_output" else edge
        for edge in graph.edges
    ]
    return graph.model_copy(update={"edges": edges})


async def _run(graph) -> str:
    compiled = runtime.compile_workflow(graph)
    run_id, bus = runtime.start_run(
        compiled.compiled_workflow_id,
        {"question": "How does a database index work?"},
        provider="stub",
    )
    async for _ in bus.stream():
        pass
    return run_id


@pytest.mark.asyncio
async def test_edge_transform_is_applied_at_runtime() -> None:
    graph = _demo_with_output_transform(t(type="format_message", template="Fact: {value}"))
    run_id = await _run(graph)
    summary = runtime.RUN_STORE[run_id]
    assert summary.status == "succeeded", summary
    assert isinstance(summary.result, str) and summary.result.startswith("Fact: ")


@pytest.mark.asyncio
async def test_failing_edge_transform_fails_the_target_node() -> None:
    graph = _demo_with_output_transform(t(type="select", pointer="/topic"))
    run_id = await _run(graph)
    summary = runtime.RUN_STORE[run_id]
    assert summary.status == "failed"
    assert "edge e_tool_output transform select" in (summary.error or "")
    trace = runtime.RUN_TRACES[run_id]["output_1"]
    assert trace.status == "failed"
