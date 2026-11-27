"""Database access: Postgres when DATABASE_URL is set, otherwise an in-memory stand-in (local dev, selfcheck).

Schema work runs once per process under an advisory lock, so parallel cold starts do not collide.
"""

import contextlib
import itertools
import os
import secrets
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
    "create table if not exists devices (token text primary key,"
    " user_id uuid not null references users(id) on delete cascade, platform text not null default 'ios',"
    " created_at timestamptz not null default now(), last_ok_at timestamptz)",
    "create index if not exists devices_user_idx on devices (user_id)",
    "create table if not exists price_snapshots (key text primary key, price_eur double precision,"
    " in_stock boolean not null, checked_at timestamptz not null)",
    "create table if not exists alert_log (user_id uuid not null references users(id) on delete cascade,"
    " alert_key text not null, sent_on date not null, primary key (user_id, alert_key))",
]
# only run when the column is missing (an unconditional alter takes a lock on results at every cold start)
RESULTS_USER_ID_CHECK = (
    "select 1 from information_schema.columns where table_schema = current_schema()"
    " and table_name = 'results' and column_name = 'user_id'"
)
RESULTS_USER_ID_ALTER = "alter table results add column user_id uuid references users(id) on delete set null"
SLUG_CHECK = (
    "select 1 from information_schema.columns where table_schema = current_schema()"
    " and table_name = 'users' and column_name = 'profile_slug'"
)
SLUG_ALTER = "alter table users add column profile_slug text unique"

LANG_CHECK = (
    "select 1 from information_schema.columns where table_schema = current_schema()"
    " and table_name = 'users' and column_name = 'language'"
)
LANG_ALTER = "alter table users add column language text"

_migrated = False
_migrate_lock = threading.Lock()

# in-memory stand-in
_mem_lock = threading.Lock()
_results: dict[str, tuple[dict, dict, str | None]] = {}
_users: dict[str, dict] = {}  # id -> row
_codes: list[dict] = []
_code_ids = itertools.count(1)
_sessions: dict[str, dict] = {}
_data: dict[str, dict] = {}
_slugs: dict[str, str] = {}  # user id -> profile slug
_langs: dict[str, str] = {}  # user id -> language
_devices: dict[str, dict] = {}  # token -> {user_id, platform, last_ok_at}
_snaps: dict[str, dict] = {}  # key -> {price_eur, in_stock, checked_at}
_alerts: dict[tuple[str, str], str] = {}  # (user id, alert key) -> sent_on


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
            if conn.execute(RESULTS_USER_ID_CHECK).fetchone() is None:
                conn.execute(RESULTS_USER_ID_ALTER)
            if conn.execute(SLUG_CHECK).fetchone() is None:
                conn.execute(SLUG_ALTER)
            if conn.execute(LANG_CHECK).fetchone() is None:
                conn.execute(LANG_ALTER)
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
            _slugs.pop(user_id, None)
            _langs.pop(user_id, None)
            for t in [t for t, d in _devices.items() if d["user_id"] == user_id]:
                del _devices[t]
            for k in [k for k in _alerts if k[0] == user_id]:
                del _alerts[k]
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


def issue_code(email: str, code_hash: str, ttl_s: int = 600, min_gap_s: int = 60, per_hour: int = 5) -> bool:
    """Rate-limit check and storing the new code in one step, serialized per address.

    Returns False when the address asked too recently or too often (nothing is stored then).
    A still-open older code for the same address stops being valid.
    """
    t = now()
    if not use_postgres():
        with _mem_lock:
            mine = [c for c in _codes if c["email"] == email]
            if any(c["created_at"] > t - timedelta(seconds=min_gap_s) for c in mine) or (
                sum(c["created_at"] > t - timedelta(hours=1) for c in mine) >= per_hour
            ):
                return False
            for c in mine:
                if c["used_at"] is None:
                    c["used_at"] = t
            _codes.append(
                {"id": next(_code_ids), "email": email, "code_hash": code_hash, "attempts": 0, "used_at": None,
                 "created_at": t, "expires_at": t + timedelta(seconds=ttl_s)}
            )
        return True
    with connect() as conn:  # one transaction; the lock is released at its end
        conn.execute("select pg_advisory_xact_lock(hashtext(%s))", (email,))
        last, hour = conn.execute(
            "select count(*) filter (where created_at > %s), count(*) filter (where created_at > %s)"
            " from auth_codes where email = %s",
            (t - timedelta(seconds=min_gap_s), t - timedelta(hours=1), email),
        ).fetchone()
        if last > 0 or hour >= per_hour:
            return False
        conn.execute("update auth_codes set used_at = %s where email = %s and used_at is null", (t, email))
        conn.execute(
            "insert into auth_codes (email, code_hash, expires_at, created_at) values (%s, %s, %s, %s)",
            (email, code_hash, t + timedelta(seconds=ttl_s), t),
        )
        return True


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


# --- public profile slug ---------------------------------------------------


def new_slug() -> str:
    """10 url-safe characters, never starting or ending with - or _."""
    while True:
        slug = secrets.token_urlsafe(8)[:10]
        if slug[0] not in "-_" and slug[-1] not in "-_":
            return slug


def share_profile(user_id: str) -> str:
    """The user's slug; creates one when there is none. A collision with another user's slug draws a new one."""
    if not use_postgres():
        with _mem_lock:
            if user_id not in _slugs:
                taken = set(_slugs.values())
                slug = new_slug()
                while slug in taken:
                    slug = new_slug()
                _slugs[user_id] = slug
            return _slugs[user_id]
    import psycopg

    while True:
        with connect() as conn:
            row = conn.execute("select profile_slug from users where id = %s", (user_id,)).fetchone()
            if row is None:
                raise LookupError("no such user")
            if row[0]:
                return row[0]
            try:
                with conn.transaction():
                    got = conn.execute(
                        "update users set profile_slug = %s where id = %s and profile_slug is null returning profile_slug",
                        (new_slug(), user_id),
                    ).fetchone()
            except psycopg.errors.UniqueViolation:
                continue  # slug taken by someone else: draw again
            if got:
                return got[0]


def unshare_profile(user_id: str) -> None:
    if not use_postgres():
        with _mem_lock:
            _slugs.pop(user_id, None)
        return
    with connect() as conn:
        conn.execute("update users set profile_slug = null where id = %s", (user_id,))


def profile_owner(slug: str) -> str | None:
    if not use_postgres():
        with _mem_lock:
            return next((uid for uid, s in _slugs.items() if s == slug), None)
    with connect() as conn:
        row = conn.execute("select id from users where profile_slug = %s", (slug,)).fetchone()
        return str(row[0]) if row else None


# --- language, devices, price snapshots, alert log ---------------------------


def set_language(user_id: str, language: str) -> None:
    if not use_postgres():
        _langs[user_id] = language
        return
    with connect() as conn:
        conn.execute("update users set language = %s where id = %s", (language, user_id))


def get_language(user_id: str) -> str | None:
    if not use_postgres():
        return _langs.get(user_id)
    with connect() as conn:
        row = conn.execute("select language from users where id = %s", (user_id,)).fetchone()
        return row[0] if row else None


def add_device(user_id: str, token: str, platform: str = "ios") -> None:
    """A token belongs to one account: registering it again moves it (the old account loses the device;
    last_ok_at is reset because the new owner has not been reached yet)."""
    if not use_postgres():
        old = _devices.get(token)
        same = old is not None and old["user_id"] == user_id
        _devices[token] = {"user_id": user_id, "platform": platform, "last_ok_at": old["last_ok_at"] if same else None}
        return
    with connect() as conn:
        conn.execute(
            "insert into devices (token, user_id, platform) values (%s, %s, %s)"
            " on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform,"
            " last_ok_at = case when devices.user_id = excluded.user_id then devices.last_ok_at else null end",
            (token, user_id, platform),
        )


def remove_device(token: str, user_id: str | None = None) -> None:
    """Delete a token; with user_id only when it belongs to that account."""
    if not use_postgres():
        d = _devices.get(token)
        if d and (user_id is None or d["user_id"] == user_id):
            del _devices[token]
        return
    with connect() as conn:
        if user_id is None:
            conn.execute("delete from devices where token = %s", (token,))
        else:
            conn.execute("delete from devices where token = %s and user_id = %s", (token, user_id))


def devices_of(user_id: str) -> list[str]:
    if not use_postgres():
        return [t for t, d in _devices.items() if d["user_id"] == user_id]
    with connect() as conn:
        return [r[0] for r in conn.execute("select token from devices where user_id = %s", (user_id,)).fetchall()]


def users_with_devices() -> list[str]:
    if not use_postgres():
        return sorted({d["user_id"] for d in _devices.values()})
    with connect() as conn:
        return [str(r[0]) for r in conn.execute("select distinct user_id from devices").fetchall()]


def mark_device_ok(token: str) -> None:
    if not use_postgres():
        if token in _devices:
            _devices[token]["last_ok_at"] = now()
        return
    with connect() as conn:
        conn.execute("update devices set last_ok_at = %s where token = %s", (now(), token))


def get_snapshots(keys: list[str]) -> dict[str, dict]:
    if not keys:
        return {}
    if not use_postgres():
        return {k: dict(_snaps[k]) for k in keys if k in _snaps}
    with connect() as conn:
        rows = conn.execute("select key, price_eur, in_stock from price_snapshots where key = any(%s)", (keys,)).fetchall()
        return {r[0]: {"price_eur": r[1], "in_stock": r[2]} for r in rows}


def put_snapshot(key: str, price_eur: float | None, in_stock: bool) -> None:
    t = now()
    if not use_postgres():
        _snaps[key] = {"price_eur": price_eur, "in_stock": in_stock, "checked_at": t}
        return
    with connect() as conn:
        conn.execute(
            "insert into price_snapshots (key, price_eur, in_stock, checked_at) values (%s, %s, %s, %s)"
            " on conflict (key) do update set price_eur = excluded.price_eur, in_stock = excluded.in_stock,"
            " checked_at = excluded.checked_at",
            (key, price_eur, in_stock, t),
        )


def alerts_seen(user_id: str, keys: list[str], today: str) -> tuple[set[str], bool]:
    """Which of `keys` were already sent to this user, and whether anything went out on `today` (YYYY-MM-DD)."""
    if not use_postgres():
        mine = {k: d for (u, k), d in _alerts.items() if u == user_id}
        return {k for k in keys if k in mine}, today in mine.values()
    with connect() as conn:
        seen = {r[0] for r in conn.execute(
            "select alert_key from alert_log where user_id = %s and alert_key = any(%s)", (user_id, keys)).fetchall()}
        sent = conn.execute("select 1 from alert_log where user_id = %s and sent_on = %s limit 1", (user_id, today)).fetchone()
        return seen, sent is not None


def claim_alerts(user_id: str, keys: list[str], today: str) -> list[str]:
    """Atomically log `keys` as sent; returns only the ones this call newly claimed (insert ... on conflict do nothing)."""
    if not use_postgres():
        claimed = []
        for k in keys:
            if (user_id, k) not in _alerts:
                _alerts[(user_id, k)] = today
                claimed.append(k)
        return claimed
    with connect() as conn:
        return [k for k in keys if conn.execute(
            "insert into alert_log (user_id, alert_key, sent_on) values (%s, %s, %s)"
            " on conflict do nothing returning alert_key", (user_id, k, today)).fetchone()]


def release_alerts(user_id: str, keys: list[str]) -> None:
    """Undo claim_alerts when nothing was delivered."""
    if not use_postgres():
        for k in keys:
            _alerts.pop((user_id, k), None)
        return
    with connect() as conn:
        conn.execute("delete from alert_log where user_id = %s and alert_key = any(%s)", (user_id, keys))


CRON_LOCK_ID = 727301
_cron_mem_lock = threading.Lock()


@contextlib.contextmanager
def cron_lock():
    """Yields True when this run holds the (database-wide) cron lock, False when another run does."""
    if not use_postgres():
        got = _cron_mem_lock.acquire(blocking=False)
        try:
            yield got
        finally:
            if got:
                _cron_mem_lock.release()
        return
    migrate()
    # session-level lock: needs a direct connection, a transaction-mode pooler may unlock on another backend
    conn = _open(os.environ.get("DATABASE_URL_UNPOOLED") or os.environ["DATABASE_URL"])
    conn.autocommit = True
    try:
        got = conn.execute("select pg_try_advisory_lock(%s)", (CRON_LOCK_ID,)).fetchone()[0]
        try:
            yield got
        finally:
            if got:
                conn.execute("select pg_advisory_unlock(%s)", (CRON_LOCK_ID,))
    finally:
        conn.close()
