"""E-mail code sign-in, sessions and account data endpoints (contract: docs/api.md, "Accounts")."""

import hashlib
import hmac
import json
import logging
import os
import re
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, TypeAdapter, ValidationError

import db
import mail

log = logging.getLogger("wishfit.auth")
router = APIRouter()

SESSION_TTL = timedelta(days=90)
MAX_BODY = 2 * 1024 * 1024
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _secret() -> bytes:
    secret = os.environ.get("AUTH_SECRET")
    if not secret:
        raise HTTPException(500, "AUTH_SECRET is not configured")
    return secret.encode()


def _code_hash(email: str, code: str) -> str:
    return hmac.new(_secret(), f"{email}:{code}".encode(), hashlib.sha256).hexdigest()


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _bearer(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    return token.strip() if scheme.lower() == "bearer" and token.strip() else None


def optional_user(request: Request) -> dict | None:
    """No Authorization header -> None; a token that is not valid -> 401."""
    token = _bearer(request)
    if token is None:
        if request.headers.get("authorization"):
            raise HTTPException(401, "invalid token")
        return None
    user = db.session_user(_token_hash(token))
    if user is None:
        raise HTTPException(401, "invalid token")
    if user.get("_imp"):
        _guard_impersonation(request, user)
    return user


def _guard_impersonation(request: Request, user: dict) -> None:
    """An impersonation session may not reach the admin API (except ending itself), delete the account or register
    devices; every other write is logged with method and path only (no body, no token)."""
    method, path = request.method, request.url.path.rstrip("/") or "/"
    if method == "DELETE" and path == "/admin/impersonate":
        return
    if path.startswith("/admin") or (method == "DELETE" and path == "/me") or (method == "POST" and path == "/me/devices"):
        raise HTTPException(403, "not allowed while viewing as a user")
    if method not in ("GET", "HEAD", "OPTIONS"):
        db.add_audit(user["_imp"], "write", user["id"], {"method": method, "path": path[:200]})


def current_user(user: dict | None = Depends(optional_user)) -> dict:
    if user is None:
        raise HTTPException(401, "sign in required")
    return user


class CodeRequest(BaseModel):
    email: str
    language: str = "de"


class VerifyRequest(BaseModel):
    email: str
    code: str
    attribution: dict | None = None


ATTRIBUTION_KEYS = ("utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "referrer", "landing", "platform")


def _attribution(raw: dict | None) -> tuple[dict, str | None]:
    """Known keys only, strings of at most 200 characters; `ref` is a profile slug resolved to the inviter's user id."""
    if not isinstance(raw, dict):
        return {}, None
    source = {k: raw[k].strip()[:200] for k in ATTRIBUTION_KEYS if isinstance(raw.get(k), str) and raw[k].strip()}
    ref = raw.get("ref")
    inviter = db.profile_owner(ref.strip()) if isinstance(ref, str) and 0 < len(ref.strip()) <= 40 else None
    return source, inviter


def _email(raw: str) -> str:
    email = raw.strip().lower()
    if len(email) > 254 or not EMAIL_RE.match(email):
        raise HTTPException(422, "email: invalid address")
    return email


@router.post("/auth/request-code")
def request_code(req: CodeRequest):
    email = _email(req.email)
    _secret()  # fail early when unconfigured
    mailing = mail.configured()
    test_mode = not mailing and os.environ.get("AUTH_DEV_CODES") == "1"  # dev_code only without a mail key
    if not mailing and not test_mode and os.environ.get("VERCEL_ENV") == "production":
        raise HTTPException(503, "mail is not configured")
    code = f"{secrets.randbelow(10**6):06d}"
    if not db.issue_code(email, _code_hash(email, code)):
        raise HTTPException(429, "too many requests, try again later")
    try:
        mail.send_code(email, code, req.language if req.language in mail.TEXTS else "de")
    except RuntimeError as e:
        log.error("mail failed: %s", e)
        raise HTTPException(502, "mail could not be sent")
    if test_mode:
        return JSONResponse({"dev_code": code})
    return Response(status_code=204)


@router.post("/auth/verify")
def verify(req: VerifyRequest):
    email = _email(req.email)
    claim = db.claim_code_attempt(email)
    code = req.code.strip()
    if claim is None or not hmac.compare_digest(claim[1], _code_hash(email, code)) or not db.consume_code(claim[0]):
        raise HTTPException(401, "invalid or expired code")
    source, inviter = _attribution(req.attribution)
    user, created = db.get_or_create_user(email, source, inviter)
    token = secrets.token_urlsafe(32)
    db.create_session(_token_hash(token), user["id"], SESSION_TTL)
    # the account's language (set on another device) travels with the sign-in; null until the app saves one
    return {"token": token, "user": {**user, "language": db.get_language(user["id"])}, "created": created}


class LogoutBody(BaseModel):
    device_token: str | None = None


@router.post("/auth/logout", status_code=204)
def logout(request: Request, body: LogoutBody | None = None, user: dict = Depends(current_user)) -> Response:
    # the app's push device goes in the same call, so a sign-out never leaves it registered
    if body and body.device_token:
        db.remove_device(body.device_token.strip().lower()[:200], user["id"])
    db.delete_session(_token_hash(_bearer(request)))
    return Response(status_code=204)


@router.get("/me")
def me(user: dict = Depends(current_user)) -> dict:
    out = {k: v for k, v in user.items() if k != "_imp"}
    if user.get("_imp"):
        admin = db.get_user(user["_imp"])
        out["impersonated_by_email"] = admin["email"] if admin else None
    return {**out, "language": db.get_language(user["id"])}


@router.delete("/me", status_code=204)
def delete_me(user: dict = Depends(current_user)) -> Response:
    db.delete_user(user["id"])
    return Response(status_code=204)


@router.get("/me/data")
def get_me_data(user: dict = Depends(current_user)) -> dict:
    return db.get_data(user["id"])


class DataBody(BaseModel):
    people: list
    profile: dict | None = None
    base_updated_at: str | None = None


@router.put("/me/data")
async def put_me_data(request: Request, user: dict = Depends(current_user)):
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > MAX_BODY:
        raise HTTPException(413, "payload too large (max 2 MB)")
    raw = await request.body()
    if len(raw) > MAX_BODY:
        raise HTTPException(413, "payload too large (max 2 MB)")
    try:
        body = TypeAdapter(DataBody).validate_python(json.loads(raw))
        base = datetime.fromisoformat(body.base_updated_at) if body.base_updated_at else None
        if base is not None and base.tzinfo is None:
            raise ValueError("base_updated_at needs a time zone")
    except (ValueError, ValidationError) as e:
        raise HTTPException(422, f"invalid body: {str(e).splitlines()[0]}")
    new = db.put_data(user["id"], body.people, body.profile, base)
    if new is None:
        return JSONResponse({"detail": "stale base_updated_at", **db.get_data(user["id"])}, status_code=409)
    return {"updated_at": new}
