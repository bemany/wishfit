"""Database access: Postgres when DATABASE_URL is set, otherwise an in-memory stand-in (local dev, selfcheck).

Schema work runs once per process under an advisory lock, so parallel cold starts do not collide.
"""

import os
import threading
import uuid
from datetime import datetime, timedelta, timezone

MAX_ATTEMPTS = 5
MIGRATION_LOCK = 872_345_001  # arbitrary fixed id for pg_advisory_xact_lock

SCHEMA = [
    "create table if not exists results (id text primary key, response jsonb, trace jsonb,"
    " created_at timestamptz default now())",
    "create table if not exists users (id uuid primary key, email text unique not null,"
    " created_at timestamptz not null default now())",
    "create table if not exists auth_codes (id bigserial primary key, email text not null, code_hash text not null,"
    " expires_at timestamptz not null, attempts int not null default 0, used_at timestamptz,"
    " created_at timestamptz not null default now())",
    "create index if not exists auth_codes_email_idx on auth_codes (email, created_at)",
    "create table if not exists sessions (token_hash text primary key,"
    " user_id uuid not null references users(id) on delete cascade,"
    " created_at timestamptz not null default now(), expires_at timestamptz not null)",
    "create table if not exists user_data (user_id uuid primary key references users(id) on delete cascade,"
    " people jsonb not null default '[]', profile jsonb, updated_at timestamptz not null)",
    "alter table results add column if not exists user_id uuid references users(id) on delete set null",
]

_migrated = False
_migrate_lock = threading.Lock()

# in-memory stand-in
_mem_lock = threading.Lock()
_results: dict[str, tuple[dict, dict, str | None]] = {}
_users: dict[str, dict] = {}  # id -> row
_codes: list[dict] = []
_sessions: dict[str, dict] = {}
_data: dict[str, dict] = {}


def use_postgres() -> bool:
    return bool(os.environ.get("DATABASE_URL"))


def now() -> datetime:
    return datetime.now(timezone.utc)


def _open(url: str):
    import psycopg

    # prepare_threshold=None: safe behind Neon's pooled (pgbouncer) endpoint
    return psycopg.connect(url, prepare_threshold=None)


def migrate() -> None:
    global _migrated
    if _migrated or not use_postgres():
        return
    with _migrate_lock:
        if _migrated:
            return
        url = os.environ.get("DATABASE_URL_UNPOOLED") or os.environ["DATABASE_URL"]
        with _open(url) as conn:  # one transaction; commits on exit
            conn.execute("select pg_advisory_xact_lock(%s)", (MIGRATION_LOCK,))
            for stmt in SCHEMA:
                conn.execute(stmt)
        _migrated = True


def connect():
    migrate()
    return _open(os.environ["DATABASE_URL"])


def _user(row) -> dict:
    return {"id": str(row[0]), "email": row[1], "created_at": row[2].isoformat()}


# --- results ---------------------------------------------------------------


def save_result(result_id: str, response: dict, trace: dict, user_id: str | None = None) -> None:
    if not use_postgres():
        _results[result_id] = (response, trace, user_id)
        return
    from psycopg.types.json import Jsonb

    with connect() as conn:
        conn.execute(
            "insert into results (id, response, trace, user_id) values (%s, %s, %s, %s)",
            (result_id, Jsonb(response), Jsonb(trace), user_id),
        )


def get_result(result_id: str) -> tuple[dict, dict] | None:
    if not use_postgres():
        row = _results.get(result_id)
        return (row[0], row[1]) if row else None
    with connect() as conn:
        return conn.execute("select response, trace from results where id = %s", (result_id,)).fetchone()


def result_user_id(result_id: str) -> str | None:
    """Owner of a stored result (used by tests and later features)."""
    if not use_postgres():
        row = _results.get(result_id)
        return row[2] if row else None
    with connect() as conn:
        row = conn.execute("select user_id from results where id = %s", (result_id,)).fetchone()
        return str(row[0]) if row and row[0] else None


# --- users -----------------------------------------------------------------


def get_user(user_id: str) -> dict | None:
    if not use_postgres():
        return _users.get(user_id)
    with connect() as conn:
        row = conn.execute("select id, email, created_at from users where id = %s", (user_id,)).fetchone()
        return _user(row) if row else None


def get_or_create_user(email: str) -> tuple[dict, bool]:
    if not use_postgres():
        with _mem_lock:
            for u in _users.values():
                if u["email"] == email:
                    return u, False
            u = {"id": str(uuid.uuid4()), "email": email, "created_at": now().isoformat()}
            _users[u["id"]] = u
            return u, True
    with connect() as conn:
        row = conn.execute(
            "insert into users (id, email) values (%s, %s) on conflict (email) do nothing returning id, email, created_at",
            (str(uuid.uuid4()), email),
        ).fetchone()
        if row:
            return _user(row), True
        row = conn.execute("select id, email, created_at from users where email = %s", (email,)).fetchone()
        return _user(row), False


def delete_user(user_id: str) -> None:
    if not use_postgres():
        with _mem_lock:
            user = _users.pop(user_id, None)
            for k in [k for k, v in _sessions.items() if v["user_id"] == user_id]:
                del _sessions[k]
            _data.pop(user_id, None)
            for rid, (resp, trace, uid) in list(_results.items()):
                if uid == user_id:
                    _results[rid] = (resp, trace, None)
            if user:
                _codes[:] = [c for c in _codes if c["email"] != user["email"]]
        return
    with connect() as conn:  # results.user_id -> null and sessions/user_data cascade via the foreign keys
        row = conn.execute("delete from users where id = %s returning email", (user_id,)).fetchone()
        if row:
            conn.execute("delete from auth_codes where email = %s", (row[0],))


# --- auth codes ------------------------------------------------------------


def rate_limited(email: str, min_gap_s: int = 60, per_hour: int = 5) -> bool:
    t = now()
    if not use_postgres():
        mine = [c for c in _codes if c["email"] == email]
        return any(c["created_at"] > t - timedelta(seconds=min_gap_s) for c in mine) or (
            sum(c["created_at"] > t - timedelta(hours=1) for c in mine) >= per_hour
        )
    with connect() as conn:
        last, hour = conn.execute(
            "select count(*) filter (where created_at > %s), count(*) filter (where created_at > %s)"
            " from auth_codes where email = %s",
            (t - timedelta(seconds=min_gap_s), t - timedelta(hours=1), email),
        ).fetchone()
        return last > 0 or hour >= per_hour


def create_code(email: str, code_hash: str, ttl_s: int = 600) -> None:
    """Store a new code; an older open one for the same address stops being valid."""
    t = now()
    if not use_postgres():
        with _mem_lock:
            for c in _codes:
                if c["email"] == email and c["used_at"] is None:
                    c["used_at"] = t
            _codes.append(
                {"id": len(_codes) + 1, "email": email, "code_hash": code_hash, "attempts": 0, "used_at": None,
                 "created_at": t, "expires_at": t + timedelta(seconds=ttl_s)}
            )
        return
    with connect() as conn:
        conn.execute("update auth_codes set used_at = %s where email = %s and used_at is null", (t, email))
        conn.execute(
            "insert into auth_codes (email, code_hash, expires_at, created_at) values (%s, %s, %s, %s)",
            (email, code_hash, t + timedelta(seconds=ttl_s), t),
        )


def claim_code_attempt(email: str) -> tuple[int, str] | None:
    """Count one attempt against the newest open code and return (id, hash), or None if there is none left."""
    t = now()
    if not use_postgres():
        with _mem_lock:
            open_codes = [c for c in _codes if c["email"] == email and c["used_at"] is None and c["expires_at"] > t]
            if not open_codes or open_codes[-1]["attempts"] >= MAX_ATTEMPTS:
                return None
            c = open_codes[-1]
            c["attempts"] += 1
            return c["id"], c["code_hash"]
    with connect() as conn:
        row = conn.execute(
            "update auth_codes set attempts = attempts + 1 where id = ("
            " select id from auth_codes where email = %s and used_at is null and expires_at > %s"
            " order by created_at desc, id desc limit 1) and attempts < %s returning id, code_hash",
            (email, t, MAX_ATTEMPTS),
        ).fetchone()
        return (row[0], row[1]) if row else None


def consume_code(code_id: int) -> bool:
    """Mark a code used; False if someone else used it first."""
    t = now()
    if not use_postgres():
        with _mem_lock:
            for c in _codes:
                if c["id"] == code_id and c["used_at"] is None:
                    c["used_at"] = t
                    return True
            return False
    with connect() as conn:
        return conn.execute(
            "update auth_codes set used_at = %s where id = %s and used_at is null returning id", (t, code_id)
        ).fetchone() is not None


# --- sessions --------------------------------------------------------------


def create_session(token_hash: str, user_id: str, ttl: timedelta) -> None:
    t = now()
    if not use_postgres():
        _sessions[token_hash] = {"user_id": user_id, "expires_at": t + ttl}
        return
    with connect() as conn:
        conn.execute(
            "insert into sessions (token_hash, user_id, created_at, expires_at) values (%s, %s, %s, %s)",
            (token_hash, user_id, t, t + ttl),
        )


def session_user(token_hash: str) -> dict | None:
    t = now()
    if not use_postgres():
        s = _sessions.get(token_hash)
        return get_user(s["user_id"]) if s and s["expires_at"] > t else None
    with connect() as conn:
        row = conn.execute(
            "select u.id, u.email, u.created_at from sessions s join users u on u.id = s.user_id"
            " where s.token_hash = %s and s.expires_at > %s",
            (token_hash, t),
        ).fetchone()
        return _user(row) if row else None


def delete_session(token_hash: str) -> None:
    if not use_postgres():
        _sessions.pop(token_hash, None)
        return
    with connect() as conn:
        conn.execute("delete from sessions where token_hash = %s", (token_hash,))


# --- account data ----------------------------------------------------------


def get_data(user_id: str) -> dict:
    empty = {"people": [], "profile": None, "updated_at": None}
    if not use_postgres():
        return dict(_data.get(user_id) or empty)
    with connect() as conn:
        row = conn.execute("select people, profile, updated_at from user_data where user_id = %s", (user_id,)).fetchone()
        return {"people": row[0], "profile": row[1], "updated_at": row[2].isoformat()} if row else empty


def put_data(user_id: str, people: list, profile: dict | None, base: datetime | None) -> str | None:
    """Optimistic write: returns the new updated_at, or None when `base` is not the stored stand."""
    t = now()
    if not use_postgres():
        with _mem_lock:
            cur = _data.get(user_id)
            if (cur["updated_at"] if cur else None) != (base.isoformat() if base else None):
                return None
            _data[user_id] = {"people": people, "profile": profile, "updated_at": t.isoformat()}
            return t.isoformat()
    from psycopg.types.json import Jsonb

    with connect() as conn:
        if base is None:
            row = conn.execute(
                "insert into user_data (user_id, people, profile, updated_at) values (%s, %s, %s, %s)"
                " on conflict (user_id) do nothing returning updated_at",
                (user_id, Jsonb(people), Jsonb(profile), t),
            ).fetchone()
        else:
            row = conn.execute(
                "update user_data set people = %s, profile = %s, updated_at = %s"
                " where user_id = %s and updated_at = %s returning updated_at",
                (Jsonb(people), Jsonb(profile), t, user_id, base),
            ).fetchone()
        return row[0].isoformat() if row else None
