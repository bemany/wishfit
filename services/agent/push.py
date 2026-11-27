"""Push alerts: device registration, APNs sending and the daily price check (contract: docs/api.md, "Push and daily check")."""

import base64
import hmac
import logging
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Callable, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

import auth
import db
import profiles

log = logging.getLogger("wishfit.push")
router = APIRouter()

DROP_PERCENT = 10.0
OCCASION_DAYS = 7
CRON_BUDGET_S = 200  # price phase; the send phase gets its own budget
SEND_BUDGET_S = 40
SEND_WORKERS = 5
APNS_TIMEOUT_S = 8
BERLIN = ZoneInfo("Europe/Berlin")
MAX_ITEMS_PER_USER = 100
TOKEN_RE = re.compile(r"^[0-9a-fA-F]{32,200}$")
DEAD_REASONS = {"BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"}
BIRTHDAY = re.compile(r"birthday|geburtstag", re.I)


# --- device endpoints ----------------------------------------------------------


class SettingsBody(BaseModel):
    language: Literal["de", "en"]


class DeviceBody(BaseModel):
    token: str
    platform: Literal["ios"] = "ios"


@router.put("/me/settings")
def put_settings(body: SettingsBody, user: dict = Depends(auth.current_user)) -> dict:
    db.set_language(user["id"], body.language)
    return {"language": body.language}


@router.post("/me/devices", status_code=204)
def add_device(body: DeviceBody, user: dict = Depends(auth.current_user)) -> Response:
    token = body.token.strip().lower()
    if not TOKEN_RE.match(token):
        raise HTTPException(422, "token: not a device token")
    db.add_device(user["id"], token, body.platform)
    return Response(status_code=204)


@router.delete("/me/devices/{token}", status_code=204)
def remove_device(token: str, user: dict = Depends(auth.current_user)) -> Response:
    db.remove_device(token.strip().lower(), user["id"])
    return Response(status_code=204)


def cron_authorized(header: str | None) -> bool:
    secret = os.environ.get("CRON_SECRET")
    scheme, _, token = (header or "").partition(" ")
    if not secret or scheme.lower() != "bearer":
        return False
    return hmac.compare_digest(token.strip().encode(), secret.encode())


# --- APNs ------------------------------------------------------------------------

_jwt = {"value": None, "at": 0.0}
_jwt_lock = threading.Lock()
_client: httpx.Client | None = None


def _b64(raw: bytes) -> bytes:
    return base64.urlsafe_b64encode(raw).rstrip(b"=")


def apns_jwt() -> str:
    """ES256 provider token, cached for 50 minutes (Apple accepts 20 to 60)."""
    with _jwt_lock:
        if _jwt["value"] and time.time() - _jwt["at"] < 50 * 60:
            return _jwt["value"]
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
        import json

        pem = os.environ["APNS_KEY"].replace("\\n", "\n").encode()
        key = serialization.load_pem_private_key(pem, password=None)
        now = int(time.time())
        head = _b64(json.dumps({"alg": "ES256", "kid": os.environ["APNS_KEY_ID"]}, separators=(",", ":")).encode())
        claims = _b64(json.dumps({"iss": os.environ["APNS_TEAM_ID"], "iat": now}, separators=(",", ":")).encode())
        signing = head + b"." + claims
        r, s = decode_dss_signature(key.sign(signing, ec.ECDSA(hashes.SHA256())))
        sig = _b64(r.to_bytes(32, "big") + s.to_bytes(32, "big"))
        _jwt.update(value=(signing + b"." + sig).decode(), at=time.time())
        return _jwt["value"]


def apns_configured() -> bool:
    return all(os.environ.get(k) for k in ("APNS_KEY", "APNS_KEY_ID", "APNS_TEAM_ID", "APNS_TOPIC"))


def apns_send(token: str, payload: dict) -> tuple[bool, str | None]:
    """One push over HTTP/2. Returns (delivered, reason); reason is APNs' error reason or a short local one."""
    global _client
    host = "api.sandbox.push.apple.com" if os.environ.get("APNS_ENV") == "sandbox" else "api.push.apple.com"
    try:
        if _client is None:
            _client = httpx.Client(http2=True, timeout=APNS_TIMEOUT_S)
        r = _client.post(
            f"https://{host}/3/device/{token}",
            json=payload,
            headers={
                "authorization": f"bearer {apns_jwt()}",
                "apns-topic": os.environ["APNS_TOPIC"],
                "apns-push-type": "alert",
                "apns-priority": "10",
            },
        )
    except Exception as e:
        _client = None
        return False, type(e).__name__
    if r.status_code == 200:
        return True, None
    try:
        reason = r.json().get("reason")
    except Exception:
        reason = None
    if r.status_code == 410:
        reason = reason or "Unregistered"
    if r.status_code == 403 and reason in ("ExpiredProviderToken", "InvalidProviderToken"):
        _jwt["value"] = None
    return False, reason or f"http {r.status_code}"


def notify(user_id: str, title: str, body: str, extra: dict) -> int:
    """Send to every device of the account; devices APNs rejects as dead are deleted. Returns the delivered count."""
    payload = {"aps": {"alert": {"title": title, "body": body}, "sound": "default"}, **extra}
    delivered = 0
    for token in db.devices_of(user_id):
        ok, reason = apns_send(token, payload)
        if ok:
            delivered += 1
            db.mark_device_ok(token)
        elif reason in DEAD_REASONS:
            db.remove_device(token)
            log.info("device removed (%s)", reason)
        else:
            log.warning("apns failed: %s", reason)
    return delivered


# --- daily check -------------------------------------------------------------------


class PriceUnavailable(Exception):
    """idealo failed or timed out (as opposed to a lookup that found nothing)."""


def today_berlin() -> date:
    return datetime.now(BERLIN).date()


def norm(title: str) -> str:
    return " ".join(title.lower().split())


def _text(v) -> str:
    return v.strip() if isinstance(v, str) else ""


def _eur(v: float) -> str:
    return f"{v:.2f}".rstrip("0").rstrip(".") if v != int(v) else str(int(v))


def collect(user_id: str) -> tuple[list[dict], list[dict]]:
    """(watched, people). watched: {key, title, person, personId, slug, kind}; people: occasions."""
    data = db.get_data(user_id)
    watched: dict[str, dict] = {}
    persons = []
    for p in (data["people"] if isinstance(data["people"], list) else []):
        if not isinstance(p, dict):
            continue
        name, pid = _text(p.get("name")), p.get("id") if isinstance(p.get("id"), str) else None
        slug = _text(p.get("friendSlug")) or None
        persons.append(p)
        for pin in (p.get("pins") if isinstance(p.get("pins"), list) else [])[:20]:
            title = _text(pin.get("product_name")) if isinstance(pin, dict) else ""
            if title:
                key = norm(title)
                watched.setdefault(key, {"key": key, "title": title, "person": name, "personId": pid, "slug": slug, "kind": "pin"})
        if slug and 0 < len(slug) <= 40 and (owner := db.profile_owner(slug)):
            d = db.get_data(owner)
            for w in profiles.public_profile(d["profile"], d["updated_at"])["wishes"][:profiles.MAX_WISHES]:
                key = norm(w["title"])
                watched.setdefault(key, {"key": key, "title": w["title"], "person": name, "personId": pid, "slug": slug, "kind": "wish"})
    return list(watched.values())[:MAX_ITEMS_PER_USER], persons


def user_language(user_id: str) -> str:
    lang = db.get_language(user_id)
    if lang not in ("de", "en"):
        profile = db.get_data(user_id)["profile"]
        profile = profile if isinstance(profile, dict) else {}
        me = profile.get("me") if isinstance(profile.get("me"), dict) else profile
        lang = me.get("language")
    return lang if lang in ("de", "en") else "de"


def occasion_due(person: dict, today: date) -> tuple[str, int] | None:
    """(occurrence date as YYYY-MM-DD, days away) when a dated occasion falls within the next 7 days."""
    raw = _text(person.get("occasionDate"))
    try:
        d = date.fromisoformat(raw)
    except ValueError:
        return None
    if BIRTHDAY.search(_text(person.get("occasion"))):
        for year in (today.year, today.year + 1):
            try:
                cand = d.replace(year=year)
            except ValueError:  # 29 Feb in a non-leap year
                cand = date(year, 3, 1)
            if cand >= today:
                d = cand
                break
    days = (d - today).days
    return (d.isoformat(), days) if 0 <= days <= OCCASION_DAYS else None


def build(user_id: str, lang: str, events: dict[str, dict], today: date) -> list[dict]:
    """Alert candidates for one account, most important first: price drops, back in stock, occasions."""
    de = lang == "de"
    watched, persons = collect(user_id)
    items = []
    for w in watched:
        ev = events.get(w["key"])
        if not ev:
            continue
        who = w["person"]
        t = w["title"]
        if ev.get("drop"):
            old, new = ev["drop"]
            a, b = _eur(new), _eur(old)
            if de:
                text = f"{t}{' für ' + who if who else ''}: {a} € statt {b} €"
            else:
                text = f"{t}{' for ' + who if who else ''}: €{a} instead of €{b}"
            items.append({"rank": 0, "key": f"drop:{w['key']}:{_eur(new)}", "text": text, "w": w})
        if ev.get("back"):
            week = today.isocalendar()
            text = (f"{t}{' für ' + who if who else ''} ist wieder verfügbar" if de
                    else f"{t}{' for ' + who if who else ''} is available again")
            items.append({"rank": 1, "key": f"stock:{w['key']}:{week[0]}-{week[1]}", "text": text, "w": w})
    for p in persons:
        due = occasion_due(p, today)
        if not due:
            continue
        name = _text(p.get("name")) or ("jemand" if de else "someone")
        occ = _text(p.get("occasion")) or ("Anlass" if de else "occasion")
        pins = [x for x in (p.get("pins") or []) if isinstance(x, dict) and _text(x.get("product_name"))]
        idea = _text(pins[0]["product_name"]) if pins else None
        when = ("heute" if due[1] == 0 else f"in {due[1]} Tagen") if de else ("today" if due[1] == 0 else f"in {due[1]} days")
        if de:
            text = f"{occ} von {name} {when}" + (f". Idee: {idea}" if idea else ". Frag nach einer Idee.")
        else:
            text = f"{name}: {occ} {when}" + (f". Idea: {idea}" if idea else ". Ask for an idea.")
        pid = p.get("id") if isinstance(p.get("id"), str) else None
        slug = _text(p.get("friendSlug")) or None
        items.append({"rank": 2, "key": f"occ:{pid or name}:{due[0]}", "text": text, "w": {"personId": pid, "slug": slug}})
    return sorted(items, key=lambda i: i["rank"])


def compose(items: list[dict], lang: str) -> tuple[str, str, dict]:
    top = items[0]
    more = len(items) - 1
    body = top["text"]
    if more > 0:
        body += f" und {more} weitere" if lang == "de" else f" and {more} more"
    extra = {k: v for k, v in (("personId", top["w"].get("personId")), ("slug", top["w"].get("slug"))) if v}
    return "Wishfit", body, extra


def run_daily(price_fn: Callable[..., dict | None], open_session: Callable[[], str | None],
              budget_s: float = CRON_BUDGET_S, today: date | None = None, send_budget_s: float = SEND_BUDGET_S) -> dict:
    """Price phase (once per distinct wish, until budget_s), then send phase (at most one summary per account, own
    budget). price_fn returns None for "no hit" and raises PriceUnavailable on idealo errors; an error leaves the
    snapshot alone. Snapshots of wishes with an event are written only once every account that should hear about it
    has, so an aborted run does not swallow events."""
    with db.cron_lock() as got:
        if not got:
            return {"skipped": True}
        return _run_daily(price_fn, open_session, budget_s, today or today_berlin(), send_budget_s)


def _run_daily(price_fn, open_session, budget_s: float, today: date, send_budget_s: float) -> dict:
    started = time.monotonic()
    users = db.users_with_devices()
    per_user = {u: collect(u)[0] for u in users}
    keys: dict[str, str] = {}
    for items in per_user.values():
        for w in items:
            keys.setdefault(w["key"], w["title"])
    snaps = db.get_snapshots(list(keys))
    events: dict[str, dict] = {}
    pending: dict[str, tuple[float | None, bool]] = {}  # key -> snapshot to write
    if keys:
        session = open_session()
        deadline = started + budget_s

        def one(key: str) -> None:
            if time.monotonic() >= deadline:
                return
            try:
                price = price_fn(session, keys[key], deadline)
            except Exception:  # idealo error or timeout: not "no hit"; leave the snapshot as it is
                return
            old = snaps.get(key)
            new_price = price["price_eur"] if price else None
            ev = {}
            if old and price:
                if old["price_eur"] and new_price is not None and new_price <= old["price_eur"] * (1 - DROP_PERCENT / 100):
                    ev["drop"] = (old["price_eur"], new_price)
                if old["in_stock"] is False:
                    ev["back"] = True
            events[key] = ev
            pending[key] = (new_price if price else (old or {}).get("price_eur"), price is not None)

        # idealo.call_tool throttles to 3 calls/s across threads
        with ThreadPoolExecutor(max_workers=3) as pool:
            list(pool.map(one, list(keys)))
    checked = len(pending)

    send_deadline = time.monotonic() + send_budget_s
    waiting: dict[str, int] = {}  # event key -> accounts that have not heard about it yet
    lock = threading.Lock()
    sent = 0

    def serve(u: str) -> None:
        nonlocal sent
        lang = user_language(u)
        cands = build(u, lang, events, today)
        ev_keys = {c["w"]["key"] for c in cands if c["rank"] < 2}
        seen, sent_today = db.alerts_seen(u, [c["key"] for c in cands], today.isoformat())
        fresh = [c for c in cands if c["key"] not in seen]
        delivered = False
        if not sent_today and fresh and time.monotonic() < send_deadline:
            claimed = set(db.claim_alerts(u, [c["key"] for c in fresh], today.isoformat()))
            items = [c for c in fresh if c["key"] in claimed]
            if items:
                title, body, extra = compose(items, lang)
                if notify(u, title, body, extra):
                    delivered = True
                else:
                    db.release_alerts(u, list(claimed))
        # events this account is done with: delivered, or already sent earlier
        done = delivered or not fresh
        with lock:
            sent += delivered
            for k in ev_keys:
                if not done:
                    waiting[k] = waiting.get(k, 0) + 1

    with ThreadPoolExecutor(max_workers=SEND_WORKERS) as pool:
        list(pool.map(serve, users))
    for key, (price_eur, in_stock) in pending.items():
        if events.get(key) and waiting.get(key):
            continue  # keep the old snapshot so tomorrow's run sees the event again
        db.put_snapshot(key, price_eur, in_stock)
    return {"checked": checked, "alerts_sent": sent}
