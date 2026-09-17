"""Graph and run persistence.

SQLite stands in for Supabase PostgreSQL in the POC (EDD section 29): the
platform still owns the canonical graph as its system of record, just via a
lighter-weight local store. Completed run snapshots (summary + node traces)
persist here; live SSE buses stay in memory until a run finishes.

Backends (first match wins):
- **Vercel Blob (recommended on Vercel):** when ``BLOB_READ_WRITE_TOKEN`` is
  set. REST PUT/GET/LIST of JSON objects (not S3).
- **Supabase Storage:** when ``SUPABASE_URL`` and
  ``SUPABASE_SERVICE_ROLE_KEY`` are set (studio-consolidation Phase 5, see
  docs/planning/features/studio-consolidation-plan.md and
  ``supabase_store.py``). JSON objects in a bucket, same shape as Blob.
- **S3-compatible object store:** when ``OBJECT_STORE_BUCKET``,
  ``OBJECT_STORE_ACCESS_KEY_ID``, and ``OBJECT_STORE_SECRET_ACCESS_KEY`` are
  set. Works with AWS S3, Cloudflare R2, MinIO, and Azure Blob S3 API.
- **Turso (optional):** when ``TURSO_DATABASE_URL`` and ``TURSO_AUTH_TOKEN``
  are both set and none of the above are.
- **File SQLite:** local / Docker / Vercel ``GRAPH_DB_PATH`` (or Vercel
  ``/tmp`` fallback). Isolate-local on serverless — not durable across GET
  after POST.
"""

from __future__ import annotations

import json
import os
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Protocol

from . import object_store, supabase_store, vercel_blob
from .models import GraphDefinition, NodeTrace, RouteDecision, RunSummary

_DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "graphs.db"
_VERCEL_EPHEMERAL_DB = Path("/tmp/graphs.db")

_SCHEMA_STATEMENTS = (
    """
    create table if not exists graph (
        id text primary key,
        name text not null,
        definition text not null,
        updated_at text not null
    )
    """,
    """
    create table if not exists run (
        run_id text primary key,
        graph_id text not null,
        status text not null,
        input_json text not null,
        provider text,
        result_json text,
        error text,
        started_at text not null,
        completed_at text not null
    )
    """,
    """
    create index if not exists idx_run_graph_started
    on run (graph_id, started_at desc)
    """,
    """
    create table if not exists run_node_trace (
        run_id text not null,
        node_id text not null,
        trace_json text not null,
        primary key (run_id, node_id)
    )
    """,
    """
    create table if not exists resource (
        kind text not null,
        id text not null,
        payload_json text not null,
        primary key (kind, id)
    )
    """,
)


class _DbCursor(Protocol):
    def fetchone(self) -> tuple[Any, ...] | None: ...

    def fetchall(self) -> list[tuple[Any, ...]]: ...


class _DbConnection(Protocol):
    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> _DbCursor: ...

    def executemany(self, sql: str, params: list[tuple[Any, ...]]) -> None: ...

    def commit(self) -> None: ...

    def close(self) -> None: ...


def resolve_db_path() -> Path:
    """Writable SQLite path for the current runtime.

    Vercel serverless mounts the deployment bundle read-only; only ``/tmp`` is
    writable. ``vercel.json`` sets ``GRAPH_DB_PATH=/tmp/graphs.db``, but if that
    env var is missing (dashboard drift, new project) we still default to ``/tmp``
    when ``VERCEL`` is set instead of ``backend/graphs.db`` in the bundle.
    """
    explicit = os.environ.get("GRAPH_DB_PATH", "").strip()
    if explicit:
        return Path(explicit)
    if os.environ.get("VERCEL"):
        return _VERCEL_EPHEMERAL_DB
    return _DEFAULT_DB_PATH


def use_vercel_blob() -> bool:
    """True when Vercel Blob read-write token is set."""
    return bool(os.environ.get("BLOB_READ_WRITE_TOKEN", "").strip())


def use_supabase() -> bool:
    """True when Supabase project URL + service-role key are set
    (studio-consolidation Phase 5 — see
    docs/planning/features/studio-consolidation-plan.md). Checked after
    Vercel Blob (Vercel stays the recommended-on-Vercel default) and before
    the generic S3-compatible object store.
    """
    url = os.environ.get("SUPABASE_URL", "").strip()
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    return bool(url and service_role_key)


def use_object_store() -> bool:
    """True when object-store bucket and credentials are set."""
    bucket = os.environ.get("OBJECT_STORE_BUCKET", "").strip()
    access_key = os.environ.get("OBJECT_STORE_ACCESS_KEY_ID", "").strip()
    secret_key = os.environ.get("OBJECT_STORE_SECRET_ACCESS_KEY", "").strip()
    return bool(bucket and access_key and secret_key)


def use_turso() -> bool:
    """True when both Turso env vars are set for remote libsql."""
    url = os.environ.get("TURSO_DATABASE_URL", "").strip()
    token = os.environ.get("TURSO_AUTH_TOKEN", "").strip()
    return bool(url and token)


def storage_backend() -> str:
    """Active persistence backend label (for diagnostics)."""
    if use_vercel_blob():
        return "vercel_blob"
    if use_supabase():
        return "supabase"
    if use_object_store():
        return "object_store"
    if use_turso():
        return "turso"
    return "sqlite"


class StorageMisconfiguredError(RuntimeError):
    """Raised when Vercel runs without a durable persistence backend."""


STORAGE_MISCONFIGURED_DETAIL = (
    "Vercel requires durable storage. Set BLOB_READ_WRITE_TOKEN, "
    "SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, "
    "OBJECT_STORE_BUCKET + OBJECT_STORE_ACCESS_KEY_ID + "
    "OBJECT_STORE_SECRET_ACCESS_KEY, or TURSO_DATABASE_URL + TURSO_AUTH_TOKEN."
)


def is_vercel_runtime() -> bool:
    """True when running on Vercel serverless (``VERCEL`` env is set)."""
    return bool(os.environ.get("VERCEL"))


def is_durable_storage_configured() -> bool:
    """True when a shared store is configured (not isolate-local SQLite)."""
    return use_vercel_blob() or use_supabase() or use_object_store() or use_turso()


def storage_is_healthy() -> bool:
    """False on Vercel when only ephemeral SQLite would be used."""
    if is_vercel_runtime() and not is_durable_storage_configured():
        return False
    return True


def storage_health() -> dict[str, bool | str]:
    """Cheap diagnostics payload for health/ready probes."""
    backend = storage_backend()
    ok = storage_is_healthy()
    payload: dict[str, bool | str] = {"ok": ok, "storage_backend": backend}
    if not ok:
        payload["message"] = STORAGE_MISCONFIGURED_DETAIL
    return payload


def _assert_storage_ready_for_sqlite() -> None:
    if not storage_is_healthy():
        raise StorageMisconfiguredError(STORAGE_MISCONFIGURED_DETAIL)


def _json_object_backend():
    if use_vercel_blob():
        return vercel_blob
    if use_supabase():
        return supabase_store
    if use_object_store():
        return object_store
    return None


DB_PATH = resolve_db_path()


def _bootstrap_schema(conn: _DbConnection) -> None:
    for statement in _SCHEMA_STATEMENTS:
        conn.execute(statement)
    _ensure_run_schema(conn)


def _ensure_run_schema(conn: _DbConnection) -> None:
    columns = {row[1] for row in conn.execute("pragma table_info(run)").fetchall()}
    if "route_decisions_json" not in columns:
        conn.execute("alter table run add column route_decisions_json text not null default '[]'")


def _open_sqlite(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    return sqlite3.connect(path)


def _open_turso() -> Any:
    import libsql

    url = os.environ["TURSO_DATABASE_URL"].strip()
    token = os.environ["TURSO_AUTH_TOKEN"].strip()
    return libsql.connect(database=url, auth_token=token)


@contextmanager
def _connect() -> Iterator[_DbConnection]:
    if use_turso():
        conn = _open_turso()
        try:
            _bootstrap_schema(conn)
            yield conn
            conn.commit()
        finally:
            conn.close()
    else:
        _assert_storage_ready_for_sqlite()
        conn = _open_sqlite(resolve_db_path())
        try:
            _bootstrap_schema(conn)
            yield conn
            conn.commit()
        finally:
            conn.close()


def save_graph(graph: GraphDefinition) -> None:
    remote = _json_object_backend()
    if remote is not None:
        remote.save_graph(graph)
        return
    with _connect() as conn:
        conn.execute(
            "insert into graph (id, name, definition, updated_at) values (?, ?, ?, ?) "
            "on conflict(id) do update set name = excluded.name, "
            "definition = excluded.definition, updated_at = excluded.updated_at",
            (graph.id, graph.name, graph.model_dump_json(), graph.updated_at or ""),
        )


def get_graph(graph_id: str) -> GraphDefinition | None:
    remote = _json_object_backend()
    if remote is not None:
        return remote.get_graph(graph_id)
    with _connect() as conn:
        row = conn.execute("select definition from graph where id = ?", (graph_id,)).fetchone()
    if row is None:
        return None
    return GraphDefinition.model_validate(json.loads(row[0]))


def list_graphs() -> list[GraphDefinition]:
    remote = _json_object_backend()
    if remote is not None:
        return remote.list_graphs()
    with _connect() as conn:
        rows = conn.execute("select definition from graph order by updated_at desc").fetchall()
    return [GraphDefinition.model_validate(json.loads(r[0])) for r in rows]


def _row_to_run_summary(row: tuple) -> RunSummary:
    if len(row) == 9:
        (
            run_id,
            graph_id,
            status,
            input_json,
            provider,
            result_json,
            error,
            started_at,
            completed_at,
        ) = row
        route_decisions_json = "[]"
    else:
        (
            run_id,
            graph_id,
            status,
            input_json,
            provider,
            result_json,
            error,
            started_at,
            completed_at,
            route_decisions_json,
        ) = row
    result = json.loads(result_json) if result_json else None
    route_decisions_raw = json.loads(route_decisions_json or "[]")
    route_decisions = [RouteDecision.model_validate(item) for item in route_decisions_raw]
    return RunSummary(
        run_id=run_id,
        graph_id=graph_id,
        status=status,  # type: ignore[arg-type]
        input=json.loads(input_json),
        provider=provider,
        result=result,
        error=error,
        started_at=started_at,
        completed_at=completed_at,
        route_decisions=route_decisions,
    )


def save_run_snapshot(summary: RunSummary, traces: list[NodeTrace]) -> None:
    remote = _json_object_backend()
    if remote is not None:
        remote.save_run_snapshot(summary, traces)
        return
    result_json = json.dumps(summary.result) if summary.result is not None else None
    route_decisions_json = json.dumps(
        [decision.model_dump(by_alias=True) for decision in summary.route_decisions]
    )
    with _connect() as conn:
        conn.execute(
            """
            insert into run (
                run_id, graph_id, status, input_json, provider,
                result_json, error, started_at, completed_at, route_decisions_json
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            on conflict(run_id) do update set
                status = excluded.status,
                result_json = excluded.result_json,
                error = excluded.error,
                completed_at = excluded.completed_at,
                route_decisions_json = excluded.route_decisions_json
            """,
            (
                summary.run_id,
                summary.graph_id,
                summary.status,
                json.dumps(summary.input),
                summary.provider,
                result_json,
                summary.error,
                summary.started_at or "",
                summary.completed_at or "",
                route_decisions_json,
            ),
        )
        conn.execute("delete from run_node_trace where run_id = ?", (summary.run_id,))
        conn.executemany(
            "insert into run_node_trace (run_id, node_id, trace_json) values (?, ?, ?)",
            [(summary.run_id, trace.node_id, trace.model_dump_json()) for trace in traces],
        )


def get_run(run_id: str) -> RunSummary | None:
    remote = _json_object_backend()
    if remote is not None:
        return remote.get_run(run_id)
    with _connect() as conn:
        row = conn.execute(
            """
            select run_id, graph_id, status, input_json, provider,
                   result_json, error, started_at, completed_at, route_decisions_json
            from run where run_id = ?
            """,
            (run_id,),
        ).fetchone()
    if row is None:
        return None
    return _row_to_run_summary(row)


def list_all_runs(*, limit: int = 200) -> list[RunSummary]:
    """Cross-graph run history (studio-consolidation Phase 5 — see
    docs/planning/features/studio-consolidation-plan.md). AGB had no
    cross-graph run listing before this — Phase 4c's as-built notes flagged
    it as "a candidate Phase 5+ backend addition." Composes `list_graphs()`
    + `list_runs_for_graph()` rather than adding a fifth per-backend
    function: same N+1-ish shape `list_runs_for_graph` itself already has
    on the remote backends (list-then-filter), not a new inefficiency.
    """
    runs: list[RunSummary] = []
    for graph in list_graphs():
        runs.extend(list_runs_for_graph(graph.id, limit=limit))
    runs.sort(key=lambda item: item.started_at or "", reverse=True)
    return runs[:limit]


def list_runs_for_graph(graph_id: str, *, limit: int = 50) -> list[RunSummary]:
    remote = _json_object_backend()
    if remote is not None:
        return remote.list_runs_for_graph(graph_id, limit=limit)
    with _connect() as conn:
        rows = conn.execute(
            """
            select run_id, graph_id, status, input_json, provider,
                   result_json, error, started_at, completed_at, route_decisions_json
            from run
            where graph_id = ?
            order by started_at desc
            limit ?
            """,
            (graph_id, limit),
        ).fetchall()
    return [_row_to_run_summary(row) for row in rows]


def get_run_traces(run_id: str) -> list[NodeTrace]:
    remote = _json_object_backend()
    if remote is not None:
        return remote.get_run_traces(run_id)
    with _connect() as conn:
        rows = conn.execute(
            "select trace_json from run_node_trace where run_id = ? order by node_id",
            (run_id,),
        ).fetchall()
    return [NodeTrace.model_validate(json.loads(row[0])) for row in rows]


def delete_graph(graph_id: str) -> bool:
    """Deletes a graph; returns whether it existed. Added for
    studio-consolidation Phase 3 — graphs were previously never deletable
    through this API."""
    remote = _json_object_backend()
    if remote is not None:
        # Matches _graph_key("graphs/{id}.json") in object_store.py /
        # vercel_blob.py — not exposed as a shared helper, so inlined here.
        return remote.delete_json(f"graphs/{graph_id}.json")
    with _connect() as conn:
        row = conn.execute("select 1 from graph where id = ?", (graph_id,)).fetchone()
        if row is None:
            return False
        conn.execute("delete from graph where id = ?", (graph_id,))
    return True


# ---------------------------------------------------------------------------
# Generic resource CRUD (studio-consolidation Phase 3, see
# docs/planning/features/studio-consolidation-plan.md and
# resource_models.py). Prompts, tools, MCP servers, agents, and LLM
# profiles are all small, JSON-shaped, non-relational documents — same
# shape as `graph` — so one generic store serves all five kinds rather
# than duplicating the graph/run pattern five times across four backends.
# Object-store/Blob key convention: ``resources/{kind}/{id}.json``.
# ---------------------------------------------------------------------------

_RESOURCE_PREFIX = "resources/"


def _resource_key(kind: str, resource_id: str) -> str:
    return f"{_RESOURCE_PREFIX}{kind}/{resource_id}.json"


def save_resource(kind: str, resource_id: str, payload: dict[str, Any]) -> None:
    remote = _json_object_backend()
    if remote is not None:
        remote.put_json(_resource_key(kind, resource_id), payload)
        return
    with _connect() as conn:
        conn.execute(
            "insert into resource (kind, id, payload_json) values (?, ?, ?) "
            "on conflict(kind, id) do update set payload_json = excluded.payload_json",
            (kind, resource_id, json.dumps(payload)),
        )


def get_resource(kind: str, resource_id: str) -> dict[str, Any] | None:
    remote = _json_object_backend()
    if remote is not None:
        return remote.get_json(_resource_key(kind, resource_id))
    with _connect() as conn:
        row = conn.execute(
            "select payload_json from resource where kind = ? and id = ?", (kind, resource_id)
        ).fetchone()
    if row is None:
        return None
    return json.loads(row[0])


def list_resources(kind: str) -> list[dict[str, Any]]:
    remote = _json_object_backend()
    if remote is not None:
        items: list[dict[str, Any]] = []
        for key in remote.list_keys(f"{_RESOURCE_PREFIX}{kind}/"):
            payload = remote.get_json(key)
            if payload is not None:
                items.append(payload)
        items.sort(key=lambda item: item.get("id", ""))
        return items
    with _connect() as conn:
        rows = conn.execute(
            "select payload_json from resource where kind = ? order by id", (kind,)
        ).fetchall()
    return [json.loads(row[0]) for row in rows]


def delete_resource(kind: str, resource_id: str) -> bool:
    remote = _json_object_backend()
    if remote is not None:
        return remote.delete_json(_resource_key(kind, resource_id))
    with _connect() as conn:
        row = conn.execute(
            "select 1 from resource where kind = ? and id = ?", (kind, resource_id)
        ).fetchone()
        if row is None:
            return False
        conn.execute("delete from resource where kind = ? and id = ?", (kind, resource_id))
    return True
