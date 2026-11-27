"""Public profile link and wishlist import (contract: docs/api.md, "Profile link and wishlist import")."""

import math
import os
import re
import threading
import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

import amazon
import auth
import db

router = APIRouter()

DEFAULT_WEB_URL = "https://wishfit-web-test.vercel.app"
MAX_WISHES = 100
MAX_IMPORT = 50
IMPORT_LIMIT = 10  # per minute and IP, counted per instance
COLOR_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
COLOR_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9 _-]{0,19}$")

_hits: dict[str, list[float]] = {}
_hits_lock = threading.Lock()


def _url(value) -> str | None:
    if isinstance(value, str) and len(value) <= 2000 and re.fullmatch(r"https?://\S+", value, re.I):
        return value
    return None


def _price(value) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0:
        return float(value)
    return None


WISH_SOURCES = {"amazon", "snap", "typed", "link"}
TRENDS = {"down", "stable", "up"}


def _num(value) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):
        return float(value)
    return None


def _price_info(raw) -> dict | None:
    if not isinstance(raw, dict):
        return None
    count = raw.get("offer_count")
    checked = raw.get("checked_at")
    return {
        "price_eur": _price(raw.get("price_eur")),
        "offer_count": count if isinstance(count, int) and not isinstance(count, bool) and count >= 0 else None,
        "in_stock": raw["in_stock"] if isinstance(raw.get("in_stock"), bool) else None,
        "trend": raw["trend"] if raw.get("trend") in TRENDS else None,
        "change_percent": _num(raw.get("change_percent")),
        "url": _url(raw.get("url")),
        "image_url": _url(raw.get("image_url")),
        "checked_at": checked if isinstance(checked, str) and re.fullmatch(r"\d{4}-\d\d-\d\dT[\d:.+\-Z]{1,40}", checked) else None,
    }


def _wish(raw) -> dict | None:
    if isinstance(raw, str):
        raw = {"title": raw}
    if not isinstance(raw, dict) or not isinstance(raw.get("title"), str):
        return None
    title = raw["title"].strip()[:200]
    if not title:
        return None
    added = _num(raw.get("added_at"))
    return {
        "title": title,
        "price_eur": _price(raw.get("price_eur")),
        "url": _url(raw.get("url")),
        "image_url": _url(raw.get("image_url")),
        "source": raw["source"] if raw.get("source") in WISH_SOURCES else None,
        "added_at": (int(added) if added.is_integer() else added) if added is not None and added >= 0 else None,
        "price": _price_info(raw.get("price")),
    }


def public_profile(profile, updated_at: str | None) -> dict:
    """Whitelist of what leaves the server; everything else in the client's blob is dropped."""
    profile = profile if isinstance(profile, dict) else {}
    name = profile.get("name")
    color = profile.get("color")
    wishes = profile.get("wishes")
    out = [w for w in map(_wish, wishes[:MAX_WISHES])] if isinstance(wishes, list) else []
    return {
        "name": name.strip()[:60] if isinstance(name, str) else "",
        "color": color if isinstance(color, str) and (COLOR_HEX.match(color) or COLOR_NAME.match(color)) else None,
        "wishes": [w for w in out if w],
        "updated_at": updated_at,
    }


@router.post("/me/share")
def share(user: dict = Depends(auth.current_user)) -> dict:
    slug = db.share_profile(user["id"])
    base = (os.environ.get("PUBLIC_WEB_URL") or DEFAULT_WEB_URL).rstrip("/")
    return {"slug": slug, "url": f"{base}/u/{slug}"}


@router.delete("/me/share", status_code=204)
def unshare(user: dict = Depends(auth.current_user)) -> Response:
    db.unshare_profile(user["id"])
    return Response(status_code=204)


@router.get("/profiles/{slug}")
def get_profile(slug: str) -> dict:
    owner = db.profile_owner(slug) if 0 < len(slug) <= 40 else None
    if owner is None:
        raise HTTPException(404, "profile not found")
    data = db.get_data(owner)
    return public_profile(data["profile"], data["updated_at"])


class ImportRequest(BaseModel):
    url: str = Field(max_length=2000)
    language: str = Field(default="en", max_length=5)


def _limited(ip: str) -> bool:
    t = time.monotonic()
    with _hits_lock:
        for k in [k for k, v in _hits.items() if not v or v[-1] < t - 60]:
            del _hits[k]
        hits = [h for h in _hits.get(ip, []) if h > t - 60]
        if len(hits) >= IMPORT_LIMIT:
            _hits[ip] = hits
            return True
        hits.append(t)
        _hits[ip] = hits
        return False


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    first = fwd.split(",")[0].strip()
    return first or (request.client.host if request.client else "unknown")


def limited(request: Request) -> bool:
    return _limited(_client_ip(request))


@router.post("/wishlist/import")
def import_wishlist(req: ImportRequest, request: Request) -> dict:
    de = req.language == "de"
    if _limited(_client_ip(request)):
        raise HTTPException(429, "Zu viele Importe, bitte gleich nochmal versuchen." if de else "Too many imports, try again in a minute.")
    url = amazon.find_url(req.url)
    if not url:
        raise HTTPException(422, "Dieser Link wird nicht unterstützt. Nutze einen öffentlichen Amazon-Wunschlisten-Link." if de
                            else "This link is not supported. Use a public Amazon wishlist link.")
    try:
        items, status = amazon.fetch(url)
    except Exception:
        raise HTTPException(502, "Die Wunschliste konnte gerade nicht gelesen werden." if de else "The wishlist could not be read right now.")
    if status == 400:
        raise HTTPException(422, "Dieser Link wird nicht unterstützt." if de else "This link is not supported.")
    if status != 200:
        raise HTTPException(502, "Die Wunschliste konnte gerade nicht gelesen werden." if de else "The wishlist could not be read right now.")
    if not items:
        raise HTTPException(422, "In dieser Wunschliste wurden keine Produkte gefunden. Ist sie öffentlich?" if de
                            else "No products found in this wishlist. Is it public?")
    return {
        "items": [{"title": i["title"][:200], "price_eur": i.get("price_eur"), "url": i.get("url"), "image_url": i.get("image_url"),
                   "source": "amazon"}
                  for i in items[:MAX_IMPORT]],
        "source": "amazon_wishlist",
    }
