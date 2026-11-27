"""Result store: Postgres when DATABASE_URL is set, otherwise an in-memory dict."""

import os

_memory: dict[str, tuple[dict, dict]] = {}
_table_ready = False


def _connect():
    # ponytail: one connection per call (fine for serverless + demo load); add a pool if traffic matters.
    import psycopg

    global _table_ready
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    if not _table_ready:
        conn.execute(
            "create table if not exists results (id text primary key, response jsonb, trace jsonb,"
            " created_at timestamptz default now())"
        )
        _table_ready = True
    return conn


def save(result_id: str, response: dict, trace: dict) -> None:
    if not os.environ.get("DATABASE_URL"):
        _memory[result_id] = (response, trace)
        return
    from psycopg.types.json import Jsonb

    with _connect() as conn:
        conn.execute(
            "insert into results (id, response, trace) values (%s, %s, %s)",
            (result_id, Jsonb(response), Jsonb(trace)),
        )


def get(result_id: str) -> tuple[dict, dict] | None:
    if not os.environ.get("DATABASE_URL"):
        return _memory.get(result_id)
    with _connect() as conn:
        return conn.execute("select response, trace from results where id = %s", (result_id,)).fetchone()
