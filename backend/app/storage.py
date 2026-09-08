"""Graph persistence.

SQLite stands in for Supabase PostgreSQL in the POC (EDD section 29): the
platform still owns the canonical graph as its system of record, just via a
lighter-weight local store. Runs are intentionally NOT persisted here -- the
POC excludes durable execution / replay, so run state lives in memory
(see runtime.py's RUN_STORE).
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from .models import GraphDefinition

DB_PATH = Path(__file__).resolve().parent.parent / "graphs.db"


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
