"""Graph and run persistence.

SQLite stands in for Supabase PostgreSQL in the POC (EDD section 29): the
platform still owns the canonical graph as its system of record, just via a
lighter-weight local store. Completed run snapshots (summary + node traces)
persist here; live SSE buses stay in memory until a run finishes.

Backends (first match wins):
- **S3-compatible object store (recommended production):** when
  ``OBJECT_STORE_BUCKET``, ``OBJECT_STORE_ACCESS_KEY_ID``, and
  ``OBJECT_STORE_SECRET_ACCESS_KEY`` are set. Works with AWS S3, Cloudflare
  R2, MinIO, and Azure Blob S3 API.
- **Turso (optional):** when ``TURSO_DATABASE_URL`` and ``TURSO_AUTH_TOKEN``
  are both set and object-store env is not.
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

from . import object_store
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
    if use_object_store():
        return "object_store"
    if use_turso():
        return "turso"
    return "sqlite"


DB_PATH = resolve_db_path()


def _bootstrap_schema(conn: _DbConnection) -> None:
    for statement in _SCHEMA_STATEMENTS:
        conn.execute(statement)
    _ensure_run_schema(conn)


def _ensure_run_schema(conn: _DbConnection) -> None:
    columns = {row[1] for row in conn.execute("pragma table_info(run)").fetchall()}
    if "route_decisions_json" not in columns:
        conn.execute(
            "alter table run add column route_decisions_json text not null default '[]'"
        )


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
        conn = _open_sqlite(resolve_db_path())
        try:
            _bootstrap_schema(conn)
            yield conn
            conn.commit()
        finally:
            conn.close()


def save_graph(graph: GraphDefinition) -> None:
    if use_object_store():
        object_store.save_graph(graph)
        return
    with _connect() as conn:
        conn.execute(
            "insert into graph (id, name, definition, updated_at) values (?, ?, ?, ?) "
            "on conflict(id) do update set name = excluded.name, "
            "definition = excluded.definition, updated_at = excluded.updated_at",
            (graph.id, graph.name, graph.model_dump_json(), graph.updated_at or ""),
        )


def get_graph(graph_id: str) -> GraphDefinition | None:
    if use_object_store():
        return object_store.get_graph(graph_id)
    with _connect() as conn:
        row = conn.execute(
            "select definition from graph where id = ?", (graph_id,)
        ).fetchone()
    if row is None:
        return None
    return GraphDefinition.model_validate(json.loads(row[0]))


def list_graphs() -> list[GraphDefinition]:
    if use_object_store():
        return object_store.list_graphs()
    with _connect() as conn:
        rows = conn.execute(
            "select definition from graph order by updated_at desc"
        ).fetchall()
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
    if use_object_store():
        object_store.save_run_snapshot(summary, traces)
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
    if use_object_store():
        return object_store.get_run(run_id)
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


def list_runs_for_graph(graph_id: str, *, limit: int = 50) -> list[RunSummary]:
    if use_object_store():
        return object_store.list_runs_for_graph(graph_id, limit=limit)
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
    if use_object_store():
        return object_store.get_run_traces(run_id)
    with _connect() as conn:
        rows = conn.execute(
            "select trace_json from run_node_trace where run_id = ? order by node_id",
            (run_id,),
        ).fetchall()
    return [NodeTrace.model_validate(json.loads(row[0])) for row in rows]
