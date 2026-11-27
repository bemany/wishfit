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
    return user


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
    user, created = db.get_or_create_user(email)
    token = secrets.token_urlsafe(32)
    db.create_session(_token_hash(token), user["id"], SESSION_TTL)
    return {"token": token, "user": user, "created": created}


@router.post("/auth/logout", status_code=204)
def logout(request: Request, _: dict = Depends(current_user)) -> Response:
    db.delete_session(_token_hash(_bearer(request)))
    return Response(status_code=204)


@router.get("/me")
def me(user: dict = Depends(current_user)) -> dict:
    return user


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
