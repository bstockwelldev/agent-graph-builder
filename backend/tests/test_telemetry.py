"""Telemetry: runtime-config validation, provider selection, the Langfuse
adapter (against a fake client, no real package needed), and end-to-end
trace/event recording through a real demo-graph run (studio-consolidation
Phase 5 — see docs/planning/features/studio-consolidation-plan.md).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import env_config
from app.compiler import compile_graph
from app.demo_graph import build_demo_graph
from app.main import app
from app.runtime import COMPILED_WORKFLOWS, start_run_inline
from app.telemetry.langfuse_telemetry import LangfuseTelemetry
from app.telemetry.noop import NoopTelemetry
from app.telemetry.provider import get_server_telemetry
from app.telemetry.types import TelemetryModelEvent, TelemetryToolEvent, TelemetryTraceContext


def _clear_telemetry_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("TELEMETRY_PROVIDER", raising=False)
    monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)
    monkeypatch.delenv("LANGFUSE_HOST", raising=False)
    monkeypatch.delenv("LANGFUSE_BASEURL", raising=False)


class FakeTelemetry:
    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple, dict]] = []

    def start_trace(self, context: TelemetryTraceContext) -> None:
        self.calls.append(("start_trace", (context,), {}))

    def record_model_event(self, trace_id, event: TelemetryModelEvent) -> None:
        self.calls.append(("record_model_event", (trace_id, event), {}))

    def record_tool_event(self, trace_id, event: TelemetryToolEvent) -> None:
        self.calls.append(("record_tool_event", (trace_id, event), {}))

    def capture_error(self, trace_id, error, metadata=None) -> None:
        self.calls.append(("capture_error", (trace_id, error), {"metadata": metadata}))

    def finish_trace(self, trace_id, status, metadata=None) -> None:
        self.calls.append(("finish_trace", (trace_id, status), {"metadata": metadata}))


class FakeLangfuseTrace:
    def __init__(self) -> None:
        self.events: list[dict] = []
        self.output: dict | None = None

    def event(self, **kwargs) -> None:
        self.events.append(kwargs)

    def update(self, **kwargs) -> None:
        self.output = kwargs.get("output")


class FakeLangfuseClient:
    def __init__(self) -> None:
        self.traces: dict[str, FakeLangfuseTrace] = {}
        self.flushed = False

    def trace(self, *, id, name, session_id, metadata):  # noqa: A002
        trace = FakeLangfuseTrace()
        self.traces[id] = trace
        return trace

    def flush(self) -> None:
        self.flushed = True


# --- env_config: telemetry provider parsing/validation ---------------------


def test_parse_telemetry_provider_defaults_to_noop() -> None:
    assert env_config.parse_telemetry_provider(None) == "noop"
    assert env_config.parse_telemetry_provider("") == "noop"
    assert env_config.parse_telemetry_provider("noop") == "noop"


def test_parse_telemetry_provider_rejects_unknown_value() -> None:
    with pytest.raises(env_config.RuntimeConfigError):
        env_config.parse_telemetry_provider("datadog")


def test_telemetry_provider_raises_when_langfuse_misconfigured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _clear_telemetry_env(monkeypatch)
    monkeypatch.setenv("TELEMETRY_PROVIDER", "langfuse")
    with pytest.raises(env_config.RuntimeConfigError, match="LANGFUSE_PUBLIC_KEY"):
        env_config.telemetry_provider()


def test_telemetry_provider_ok_when_langfuse_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_telemetry_env(monkeypatch)
    monkeypatch.setenv("TELEMETRY_PROVIDER", "langfuse")
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk_test")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk_test")
    assert env_config.telemetry_provider() == "langfuse"


def test_telemetry_health_reports_misconfiguration(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_telemetry_env(monkeypatch)
    monkeypatch.setenv("TELEMETRY_PROVIDER", "langfuse")
    payload = env_config.telemetry_health()
    assert payload["ok"] is False
    assert payload["telemetry_provider"] == "langfuse"
    assert payload["telemetry_configured"] is False
    assert "LANGFUSE_PUBLIC_KEY" in payload["message"]


def test_telemetry_health_ok_for_default_noop(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_telemetry_env(monkeypatch)
    payload = env_config.telemetry_health()
    assert payload == {"ok": True, "telemetry_provider": "noop", "telemetry_configured": True}


# --- provider.get_server_telemetry: fail-open on misconfiguration ---------


def test_get_server_telemetry_returns_noop_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_telemetry_env(monkeypatch)
    assert isinstance(get_server_telemetry(), NoopTelemetry)


def test_get_server_telemetry_falls_back_to_noop_when_langfuse_misconfigured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _clear_telemetry_env(monkeypatch)
    monkeypatch.setenv("TELEMETRY_PROVIDER", "langfuse")
    # No LANGFUSE_PUBLIC_KEY/SECRET_KEY set — telemetry is diagnostic, not
    # load-bearing, so this degrades runs to untraced rather than raising.
    assert isinstance(get_server_telemetry(), NoopTelemetry)


# --- LangfuseTelemetry adapter, against a fake client (no package needed) --


def test_langfuse_telemetry_records_a_full_trace_lifecycle() -> None:
    client = FakeLangfuseClient()
    telemetry = LangfuseTelemetry(client)

    telemetry.start_trace(TelemetryTraceContext(trace_id="t1", run_id="run1", graph_id="g1"))
    telemetry.record_model_event(
        "t1", TelemetryModelEvent(phase="generation_finish", provider="stub", model="stub-model")
    )
    telemetry.record_tool_event(
        "t1", TelemetryToolEvent(phase="tool_call_finish", tool_name="lookup_topic")
    )
    telemetry.finish_trace("t1", "ok", {"result": "done"})

    trace = client.traces["t1"]
    assert [e["name"] for e in trace.events] == ["model_generation_finish", "tool_tool_call_finish"]
    assert trace.output == {"status": "ok", "result": "done"}
    assert client.flushed is True


def test_langfuse_telemetry_ignores_events_for_unknown_trace_id() -> None:
    client = FakeLangfuseClient()
    telemetry = LangfuseTelemetry(client)
    # No start_trace call for "missing" — every method should no-op, not raise.
    telemetry.record_model_event("missing", TelemetryModelEvent(phase="generation_finish"))
    telemetry.record_tool_event(
        "missing", TelemetryToolEvent(phase="tool_call_finish", tool_name="x")
    )
    telemetry.capture_error("missing", RuntimeError("boom"))
    telemetry.finish_trace("missing", "error")
    assert client.traces == {}


# --- End-to-end: a real demo-graph run records the expected trace/events --


async def test_demo_graph_run_records_telemetry_trace_and_node_events(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = FakeTelemetry()
    monkeypatch.setattr("app.runtime.get_server_telemetry", lambda: fake)

    demo = build_demo_graph()
    compiled = compile_graph(demo, "cwf_telemetry_test")
    assert compiled.ok, compiled.diagnostics
    COMPILED_WORKFLOWS["cwf_telemetry_test"] = demo

    run_id, _bus = await start_run_inline(
        "cwf_telemetry_test", {"question": "What is a database index?"}, provider="stub"
    )

    kinds = [call[0] for call in fake.calls]
    assert kinds[0] == "start_trace"
    assert kinds[-1] == "finish_trace"
    # Technical branch of the demo graph: llm_classify -> router -> tool_lookup -> output
    # (llm_answer is only on the "other" branch — see app/demo_graph.py).
    assert kinds.count("record_model_event") == 1  # llm_classify
    assert kinds.count("record_tool_event") == 1  # lookup_topic

    _, (trace_id, status), kwargs = next(c for c in fake.calls if c[0] == "finish_trace")
    assert status == "ok"
    assert kwargs["metadata"] is None

    start_context = fake.calls[0][1][0]
    assert start_context.run_id == run_id
    assert start_context.graph_id == demo.id
    assert start_context.trace_id == trace_id


class _BoomModel:
    provider_name = "stub"
    model = "stub-model"

    async def generate(self, **kwargs):
        raise RuntimeError("stub provider exploded")


async def test_demo_graph_run_failure_captures_telemetry_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = FakeTelemetry()
    monkeypatch.setattr("app.runtime.get_server_telemetry", lambda: fake)
    monkeypatch.setattr("app.runtime.get_chat_model", lambda *a, **k: _BoomModel())

    demo = build_demo_graph()
    compiled = compile_graph(demo, "cwf_telemetry_fail_test")
    assert compiled.ok, compiled.diagnostics
    COMPILED_WORKFLOWS["cwf_telemetry_fail_test"] = demo

    await start_run_inline(
        "cwf_telemetry_fail_test", {"question": "What is a database index?"}, provider="stub"
    )

    kinds = [call[0] for call in fake.calls]
    assert "capture_error" in kinds
    assert kinds[-1] == "finish_trace"
    _, (_trace_id, status), _kwargs = next(c for c in fake.calls if c[0] == "finish_trace")
    assert status == "error"


# --- /api/health surfaces telemetry readiness without affecting status ----


def test_health_reports_telemetry_misconfiguration_without_503(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("OBJECT_STORE_BUCKET", raising=False)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("VERCEL", raising=False)
    _clear_telemetry_env(monkeypatch)
    monkeypatch.setenv("TELEMETRY_PROVIDER", "langfuse")

    with TestClient(app) as client:
        response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["ok"] is True
    assert response.json()["telemetry"]["ok"] is False
    assert response.json()["telemetry"]["telemetry_provider"] == "langfuse"
