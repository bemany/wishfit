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
    "create table if not exists admin_audit (id bigserial primary key, at timestamptz not null default now(),"
    " admin_id uuid, action text not null, target_user_id uuid, detail jsonb)",
    "create table if not exists cost_events (id bigserial primary key, at timestamptz not null default now(),"
    " source text not null, kind text not null, usd numeric(12,6) not null default 0, units int not null default 1,"
    " user_id uuid, result_id text, detail jsonb)",
    "create index if not exists cost_events_at_idx on cost_events (at)",
]
# (table, column, alter): each runs only when the column is missing (see RESULTS_USER_ID_CHECK)
LATE_COLUMNS = [
    ("sessions", "impersonated_by", "alter table sessions add column impersonated_by uuid"),
    ("users", "signup_source", "alter table users add column signup_source jsonb"),
    ("users", "referred_by", "alter table users add column referred_by uuid references users(id) on delete set null"),
]
COLUMN_CHECK = (
    "select 1 from information_schema.columns where table_schema = current_schema()"
    " and table_name = %s and column_name = %s"
)
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
_signup: dict[str, dict] = {}  # user id -> {"source": dict, "referred_by": user id | None}
_result_at: dict[str, datetime] = {}  # result id -> created_at
_audit: list[dict] = []
_costs: list[dict] = []


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
            for table, column, alter in LATE_COLUMNS:
                if conn.execute(COLUMN_CHECK, (table, column)).fetchone() is None:
                    conn.execute(alter)
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
        _result_at[result_id] = now()
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


def get_or_create_user(email: str, source: dict | None = None, referred_by: str | None = None) -> tuple[dict, bool]:
    """`source` (sanitized utm/referrer map) and `referred_by` (inviter's user id) are stored only for a new account."""
    new_id = str(uuid.uuid4())
    if referred_by == new_id:
        referred_by = None  # no self-invite
    if not use_postgres():
        with _mem_lock:
            for u in _users.values():
                if u["email"] == email:
                    return u, False
            u = {"id": new_id, "email": email, "created_at": now().isoformat()}
            _users[u["id"]] = u
            if source or referred_by:
                _signup[new_id] = {"source": dict(source or {}), "referred_by": referred_by if referred_by in _users else None}
            return u, True
    from psycopg.types.json import Jsonb

    with connect() as conn:
        row = conn.execute(
            "insert into users (id, email, signup_source, referred_by) values (%s, %s, %s, %s)"
            " on conflict (email) do nothing returning id, email, created_at",
            (new_id, email, Jsonb(source) if source else None, referred_by),
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
            _signup.pop(user_id, None)
            for s in _signup.values():
                if s["referred_by"] == user_id:
                    s["referred_by"] = None
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


def create_session(token_hash: str, user_id: str, ttl: timedelta, impersonated_by: str | None = None) -> datetime:
    """Returns expires_at. impersonated_by = the admin's user id for an impersonation session."""
    t = now()
    if not use_postgres():
        _sessions[token_hash] = {"user_id": user_id, "expires_at": t + ttl, "created_at": t, "impersonated_by": impersonated_by}
        return t + ttl
    with connect() as conn:
        conn.execute(
            "insert into sessions (token_hash, user_id, created_at, expires_at, impersonated_by) values (%s, %s, %s, %s, %s)",
            (token_hash, user_id, t, t + ttl, impersonated_by),
        )
    return t + ttl


def session_user(token_hash: str) -> dict | None:
    """The session's user; an impersonation session adds `_imp` (the admin's user id), others have `_imp` None."""
    t = now()
    if not use_postgres():
        s = _sessions.get(token_hash)
        u = get_user(s["user_id"]) if s and s["expires_at"] > t else None
        return {**u, "_imp": s.get("impersonated_by")} if u else None
    with connect() as conn:
        row = conn.execute(
            "select u.id, u.email, u.created_at, s.impersonated_by from sessions s join users u on u.id = s.user_id"
            " where s.token_hash = %s and s.expires_at > %s",
            (token_hash, t),
        ).fetchone()
        return {**_user(row), "_imp": str(row[3]) if row[3] else None} if row else None


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
        _devices[token] = {"user_id": user_id, "platform": platform, "last_ok_at": old["last_ok_at"] if same else None,
                           "created_at": old["created_at"] if same else now()}
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


# --- admin console -----------------------------------------------------------

_USER_COLS = (
    "u.id, u.email, u.created_at, u.language, u.profile_slug, u.signup_source, r.email,"
    " case when jsonb_typeof(d.people) = 'array' then jsonb_array_length(d.people) else 0 end,"
    " case when jsonb_typeof(d.profile->'wishes') = 'array' then jsonb_array_length(d.profile->'wishes') else 0 end,"
    " (select count(*) from devices v where v.user_id = u.id),"
    " (select count(*) from results x where x.user_id = u.id),"
    " greatest(u.created_at, d.updated_at,"
    "  (select max(s.created_at) from sessions s where s.user_id = u.id and s.impersonated_by is null),"
    "  (select max(x.created_at) from results x where x.user_id = u.id)),"
    " (select count(*) from users c where c.referred_by = u.id)"
)
_USER_FROM = "from users u left join user_data d on d.user_id = u.id left join users r on r.id = u.referred_by"


def _admin_user_row(row) -> dict:
    return {
        "id": str(row[0]), "email": row[1], "created_at": row[2].isoformat(), "language": row[3],
        "profile_slug": row[4], "signup_source": row[5], "referred_by_email": row[6],
        "people": row[7], "wishes": row[8], "devices": row[9], "results": row[10],
        "last_seen_at": row[11].isoformat() if row[11] else None, "referrals": row[12],
    }


def admin_users(query: str = "", limit: int = 50, offset: int = 0, user_id: str | None = None) -> tuple[list[dict], int]:
    """Users newest first with counters. `query` is a case-insensitive part of the e-mail address."""
    q = query.strip().lower()
    if not use_postgres():
        with _mem_lock:
            rows = []
            for u in sorted(_users.values(), key=lambda x: x["created_at"], reverse=True):
                if user_id and u["id"] != user_id or q not in u["email"]:
                    continue
                uid = u["id"]
                data = _data.get(uid) or {}
                people, profile = data.get("people"), data.get("profile")
                wishes = profile.get("wishes") if isinstance(profile, dict) else None
                sign = _signup.get(uid) or {"source": None, "referred_by": None}
                inviter = _users.get(sign["referred_by"]) if sign["referred_by"] else None
                seen = [datetime.fromisoformat(u["created_at"])]
                seen += [datetime.fromisoformat(data["updated_at"])] if data.get("updated_at") else []
                seen += [s["created_at"] for s in _sessions.values() if s["user_id"] == uid and not s.get("impersonated_by")]
                seen += [_result_at[rid] for rid, r in _results.items() if r[2] == uid and rid in _result_at]
                rows.append({
                    "id": uid, "email": u["email"], "created_at": u["created_at"], "language": _langs.get(uid),
                    "profile_slug": _slugs.get(uid), "signup_source": sign["source"] or None,
                    "referred_by_email": inviter["email"] if inviter else None,
                    "people": len(people) if isinstance(people, list) else 0,
                    "wishes": len(wishes) if isinstance(wishes, list) else 0,
                    "devices": sum(d["user_id"] == uid for d in _devices.values()),
                    "results": sum(r[2] == uid for r in _results.values()),
                    "last_seen_at": max(seen).isoformat(),
                    "referrals": sum(s["referred_by"] == uid for s in _signup.values()),
                })
            return rows[offset:offset + limit], len(rows)
    where, args = "position(%s in lower(u.email)) > 0", [q]
    if user_id:
        where += " and u.id = %s"
        args.append(user_id)
    with connect() as conn:
        total = conn.execute(f"select count(*) from users u where {where}", args).fetchone()[0]
        rows = conn.execute(
            f"select {_USER_COLS} {_USER_FROM} where {where} order by u.created_at desc limit %s offset %s",
            [*args, limit, offset],
        ).fetchall()
        return [_admin_user_row(r) for r in rows], total


def admin_devices(user_id: str) -> list[dict]:
    if not use_postgres():
        return [
            {"token": t, "platform": d["platform"], "created_at": d["created_at"].isoformat() if d.get("created_at") else None,
             "last_ok_at": d["last_ok_at"].isoformat() if d["last_ok_at"] else None}
            for t, d in _devices.items() if d["user_id"] == user_id
        ]
    with connect() as conn:
        rows = conn.execute(
            "select token, platform, created_at, last_ok_at from devices where user_id = %s order by created_at", (user_id,)
        ).fetchall()
        return [{"token": r[0], "platform": r[1], "created_at": r[2].isoformat(), "last_ok_at": r[3].isoformat() if r[3] else None}
                for r in rows]


_RESULT_COLS = (
    "x.id, x.created_at, x.user_id, u.email, x.response->>'status', x.response->>'model',"
    " (select coalesce(sum((c->>'duration_ms')::numeric), 0) from jsonb_array_elements("
    "  case when jsonb_typeof(x.trace->'model_calls') = 'array' then x.trace->'model_calls' else '[]'::jsonb end) c),"
    " x.trace->>'error'"
)


def admin_results(user_id: str | None = None, limit: int = 50) -> list[dict]:
    """Newest results first. duration_ms = the model calls' time from the trace; error is only set when a trace carries one."""
    if not use_postgres():
        out = []
        for rid, (resp, trace, uid) in _results.items():
            if user_id and uid != user_id:
                continue
            calls = trace.get("model_calls") if isinstance(trace, dict) else None
            out.append({
                "id": rid, "created_at": (_result_at.get(rid) or now()).isoformat(), "user_id": uid,
                "email": _users[uid]["email"] if uid in _users else None,
                "status": resp.get("status"), "model": resp.get("model"),
                "duration_ms": sum(c.get("duration_ms") or 0 for c in calls) if isinstance(calls, list) else 0,
                "error": trace.get("error") if isinstance(trace, dict) else None,
            })
        return sorted(out, key=lambda r: r["created_at"], reverse=True)[:limit]
    with connect() as conn:
        rows = conn.execute(
            f"select {_RESULT_COLS} from results x left join users u on u.id = x.user_id"
            " where (%s::uuid is null or x.user_id = %s::uuid) order by x.created_at desc limit %s",
            (user_id, user_id, limit),
        ).fetchall()
        return [{"id": r[0], "created_at": r[1].isoformat(), "user_id": str(r[2]) if r[2] else None, "email": r[3],
                 "status": r[4], "model": r[5], "duration_ms": int(r[6] or 0), "error": r[7]} for r in rows]


def add_audit(admin_id: str | None, action: str, target_user_id: str | None = None, detail: dict | None = None) -> None:
    """Admin activity log. Never put tokens, codes or request bodies in `detail`."""
    if not use_postgres():
        _audit.append({"at": now(), "admin_id": admin_id, "action": action, "target_user_id": target_user_id, "detail": detail or {}})
        return
    from psycopg.types.json import Jsonb

    with connect() as conn:
        conn.execute(
            "insert into admin_audit (admin_id, action, target_user_id, detail) values (%s, %s, %s, %s)",
            (admin_id, action, target_user_id, Jsonb(detail or {})),
        )


def list_audit(limit: int = 100) -> list[dict]:
    if not use_postgres():
        return [
            {"at": a["at"].isoformat(), "admin_email": (_users.get(a["admin_id"]) or {}).get("email"), "action": a["action"],
             "target_user_id": a["target_user_id"], "detail": a["detail"]}
            for a in reversed(_audit[-limit:])
        ]
    with connect() as conn:
        rows = conn.execute(
            "select a.at, u.email, a.action, a.target_user_id, a.detail from admin_audit a"
            " left join users u on u.id = a.admin_id order by a.at desc, a.id desc limit %s",
            (limit,),
        ).fetchall()
        return [{"at": r[0].isoformat(), "admin_email": r[1], "action": r[2],
                 "target_user_id": str(r[3]) if r[3] else None, "detail": r[4] or {}} for r in rows]


def acquisition() -> dict:
    """Sign-ups by source/medium/campaign and the accounts that brought the most users."""
    if not use_postgres():
        with _mem_lock:
            groups: dict[tuple, int] = {}
            brought: dict[str, int] = {}
            for uid in _users:
                sign = _signup.get(uid) or {"source": {}, "referred_by": None}
                src = sign["source"]
                key = (src.get("utm_source") or ("referral" if sign["referred_by"] else "direct"),
                       src.get("utm_medium"), src.get("utm_campaign"))
                groups[key] = groups.get(key, 0) + 1
                if sign["referred_by"]:
                    brought[sign["referred_by"]] = brought.get(sign["referred_by"], 0) + 1
            return {
                "by_source": [{"source": k[0], "medium": k[1], "campaign": k[2], "users": n}
                              for k, n in sorted(groups.items(), key=lambda kv: -kv[1])],
                "top_referrers": [{"user_id": uid, "email": _users[uid]["email"], "referrals": n}
                                  for uid, n in sorted(brought.items(), key=lambda kv: -kv[1])[:20] if uid in _users],
            }
    with connect() as conn:
        by = conn.execute(
            "select coalesce(signup_source->>'utm_source', case when referred_by is not null then 'referral' else 'direct' end),"
            " signup_source->>'utm_medium', signup_source->>'utm_campaign', count(*) from users group by 1, 2, 3 order by 4 desc"
        ).fetchall()
        top = conn.execute(
            "select r.id, r.email, count(*) from users u join users r on r.id = u.referred_by"
            " group by r.id, r.email order by 3 desc limit 20"
        ).fetchall()
        return {"by_source": [{"source": r[0], "medium": r[1], "campaign": r[2], "users": r[3]} for r in by],
                "top_referrers": [{"user_id": str(r[0]), "email": r[1], "referrals": r[2]} for r in top]}


def add_cost(source: str, kind: str, usd: float, units: int = 1, user_id: str | None = None,
             result_id: str | None = None, detail: dict | None = None) -> None:
    if not use_postgres():
        with _mem_lock:
            _costs.append({"at": now(), "source": source, "kind": kind, "usd": float(usd), "units": units,
                           "user_id": user_id, "result_id": result_id, "detail": detail or {}})
        return
    from psycopg.types.json import Jsonb

    with connect() as conn:
        conn.execute(
            "insert into cost_events (source, kind, usd, units, user_id, result_id, detail) values (%s, %s, %s, %s, %s, %s, %s)",
            (source, kind, usd, units, user_id, result_id, Jsonb(detail or {})),
        )


def costs_report(days: int) -> dict:
    """Daily sums per source (UTC days) for the last max(days, 30) days, cost per user for the last `days` days."""
    span = max(days, 30)
    since = now() - timedelta(days=span)
    user_since = now() - timedelta(days=days)
    if not use_postgres():
        with _mem_lock:
            rows = [c for c in _costs if c["at"] >= since]
            daily_map: dict[tuple, list] = {}
            per_user: dict[str, float] = {}
            for c in rows:
                agg = daily_map.setdefault((c["at"].date().isoformat(), c["source"]), [0.0, 0])
                agg[0] += c["usd"]
                agg[1] += c["units"]
                if c["user_id"] and c["at"] >= user_since:
                    per_user[c["user_id"]] = per_user.get(c["user_id"], 0.0) + c["usd"]
            daily = [{"day": k[0], "source": k[1], "usd": v[0], "units": v[1]} for k, v in sorted(daily_map.items())]
            by_user = [{"user_id": u, "email": (_users.get(u) or {}).get("email"), "usd": usd}
                       for u, usd in sorted(per_user.items(), key=lambda kv: -kv[1])[:50]]
            return {"daily": daily, "by_user": by_user}
    with connect() as conn:
        d = conn.execute(
            "select (at at time zone 'UTC')::date, source, sum(usd), sum(units) from cost_events where at >= %s"
            " group by 1, 2 order by 1, 2", (since,)).fetchall()
        u = conn.execute(
            "select c.user_id, u.email, sum(c.usd) from cost_events c left join users u on u.id = c.user_id"
            " where c.at >= %s and c.user_id is not null group by 1, 2 order by 3 desc limit 50", (user_since,)).fetchall()
    return {"daily": [{"day": r[0].isoformat(), "source": r[1], "usd": float(r[2]), "units": int(r[3])} for r in d],
            "by_user": [{"user_id": str(r[0]), "email": r[1], "usd": float(r[2])} for r in u]}
