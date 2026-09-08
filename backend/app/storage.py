"""Graph and run persistence.

SQLite stands in for Supabase PostgreSQL in the POC (EDD section 29): the
platform still owns the canonical graph as its system of record, just via a
lighter-weight local store. Completed run snapshots (summary + node traces)
persist here; live SSE buses stay in memory until a run finishes.
"""

from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path

from .models import GraphDefinition, NodeTrace, RunSummary

_DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "graphs.db"
DB_PATH = Path(os.environ["GRAPH_DB_PATH"]) if os.environ.get("GRAPH_DB_PATH") else _DEFAULT_DB_PATH


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        create table if not exists graph (
            id text primary key,
            name text not null,
            definition text not null,
            updated_at text not null
        )
        """
    )
    conn.execute(
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
        """
    )
    conn.execute(
        """
        create index if not exists idx_run_graph_started
        on run (graph_id, started_at desc)
        """
    )
    conn.execute(
        """
        create table if not exists run_node_trace (
            run_id text not null,
            node_id text not null,
            trace_json text not null,
            primary key (run_id, node_id)
        )
        """
    )
    return conn


def save_graph(graph: GraphDefinition) -> None:
    with _connect() as conn:
        conn.execute(
            "insert into graph (id, name, definition, updated_at) values (?, ?, ?, ?) "
            "on conflict(id) do update set name = excluded.name, "
            "definition = excluded.definition, updated_at = excluded.updated_at",
            (graph.id, graph.name, graph.model_dump_json(), graph.updated_at or ""),
        )


def get_graph(graph_id: str) -> GraphDefinition | None:
    with _connect() as conn:
        row = conn.execute(
            "select definition from graph where id = ?", (graph_id,)
        ).fetchone()
    if row is None:
        return None
    return GraphDefinition.model_validate(json.loads(row[0]))


def list_graphs() -> list[GraphDefinition]:
    with _connect() as conn:
        rows = conn.execute(
            "select definition from graph order by updated_at desc"
        ).fetchall()
    return [GraphDefinition.model_validate(json.loads(r[0])) for r in rows]


def _row_to_run_summary(row: tuple) -> RunSummary:
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
    result = json.loads(result_json) if result_json else None
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
    )


def save_run_snapshot(summary: RunSummary, traces: list[NodeTrace]) -> None:
    result_json = json.dumps(summary.result) if summary.result is not None else None
    with _connect() as conn:
        conn.execute(
            """
            insert into run (
                run_id, graph_id, status, input_json, provider,
                result_json, error, started_at, completed_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
            on conflict(run_id) do update set
                status = excluded.status,
                result_json = excluded.result_json,
                error = excluded.error,
                completed_at = excluded.completed_at
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
            ),
        )
        conn.execute("delete from run_node_trace where run_id = ?", (summary.run_id,))
        conn.executemany(
            "insert into run_node_trace (run_id, node_id, trace_json) values (?, ?, ?)",
            [(summary.run_id, trace.node_id, trace.model_dump_json()) for trace in traces],
        )


def get_run(run_id: str) -> RunSummary | None:
    with _connect() as conn:
        row = conn.execute(
            """
            select run_id, graph_id, status, input_json, provider,
                   result_json, error, started_at, completed_at
            from run where run_id = ?
            """,
            (run_id,),
        ).fetchone()
    if row is None:
        return None
    return _row_to_run_summary(row)


def list_runs_for_graph(graph_id: str, *, limit: int = 50) -> list[RunSummary]:
    with _connect() as conn:
        rows = conn.execute(
            """
            select run_id, graph_id, status, input_json, provider,
                   result_json, error, started_at, completed_at
            from run
            where graph_id = ?
            order by started_at desc
            limit ?
            """,
            (graph_id, limit),
        ).fetchall()
    return [_row_to_run_summary(row) for row in rows]


def get_run_traces(run_id: str) -> list[NodeTrace]:
    with _connect() as conn:
        rows = conn.execute(
            "select trace_json from run_node_trace where run_id = ? order by node_id",
            (run_id,),
        ).fetchall()
    return [NodeTrace.model_validate(json.loads(row[0])) for row in rows]
