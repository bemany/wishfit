"""Admin console API (contract: docs/api.md, "Admin console"). Admin = ADMIN_EMAILS and not an impersonation session."""

import os
import secrets
import uuid
from datetime import timedelta
from typing import Callable

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

import auth
import db
import push
import storage

router = APIRouter(prefix="/admin")

IMPERSONATION_TTL = timedelta(minutes=30)  # fixed, never extended
RUN_CRON: Callable[[], dict] | None = None  # set by main (needs the price lookup)


def admin_emails() -> set[str]:
    return {e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()}


def current_admin(user: dict = Depends(auth.current_user)) -> dict:
    if user.get("_imp") or user["email"].lower() not in admin_emails():
        raise HTTPException(403, "admin only")
    return user


def _uuid(value: str | None) -> str | None:
    if value is None or value == "":
        return None
    try:
        return str(uuid.UUID(value))
    except ValueError:
        raise HTTPException(404, "unknown id")


def _user_out(u: dict) -> dict:
    src = u.get("signup_source") or {}
    return {**u, "source": src.get("utm_source") or ("referral" if u.get("referred_by_email") else "direct")}


@router.get("/me")
def admin_me(admin: dict = Depends(current_admin)) -> dict:
    return {"email": admin["email"]}


@router.get("/users")
def users(query: str = "", limit: int = 50, offset: int = 0, admin: dict = Depends(current_admin)) -> dict:
    rows, total = db.admin_users(query[:200], max(1, min(limit, 200)), max(0, offset))
    return {"users": [_user_out(u) for u in rows], "total": total}


@router.get("/users/{user_id}")
def user_detail(user_id: str, admin: dict = Depends(current_admin)) -> dict:
    uid = _uuid(user_id)
    rows, _ = db.admin_users(user_id=uid)
    if not rows:
        raise HTTPException(404, "unknown user")
    devices = [{"token_tail": d["token"][-6:], "platform": d["platform"], "created_at": d["created_at"], "last_ok_at": d["last_ok_at"]}
               for d in db.admin_devices(uid)]
    results = [{k: r[k] for k in ("id", "created_at", "status", "model")} for r in db.admin_results(uid, 50)]
    return {"user": _user_out(rows[0]), "data": db.get_data(uid), "devices": devices, "results": results}


@router.get("/results")
def results(user_id: str | None = None, limit: int = 50, admin: dict = Depends(current_admin)) -> dict:
    return {"results": db.admin_results(_uuid(user_id), max(1, min(limit, 200)))}


@router.get("/results/{result_id}")
def result(result_id: str, admin: dict = Depends(current_admin)) -> dict:
    row = storage.get(result_id)
    if row is None:
        raise HTTPException(404, "unknown result id")
    return {"response": row[0], "trace": row[1]}


class PushTest(BaseModel):
    user_id: str
    title: str | None = None
    body: str | None = None


@router.post("/push-test")
def push_test(req: PushTest, admin: dict = Depends(current_admin)) -> dict:
    uid = _uuid(req.user_id)
    if db.get_user(uid) is None:
        raise HTTPException(404, "unknown user")
    if not push.apns_configured():
        raise HTTPException(503, "apns not configured")
    devices = len(db.devices_of(uid))
    sent = push.notify(uid, (req.title or "Wishfit")[:100], (req.body or "Test notification")[:300], {}) if devices else 0
    db.add_audit(admin["id"], "push_test", uid, {"sent": sent, "devices": devices})
    return {"sent": sent, "devices": devices}


@router.post("/cron")
def cron(admin: dict = Depends(current_admin)) -> dict:
    if not push.apns_configured():
        raise HTTPException(503, "apns not configured")
    if RUN_CRON is None:
        raise HTTPException(503, "cron is not available")
    out = RUN_CRON()
    db.add_audit(admin["id"], "cron_run", None, {})
    return out


class Impersonate(BaseModel):
    user_id: str


@router.post("/impersonate")
def impersonate_start(req: Impersonate, admin: dict = Depends(current_admin)) -> dict:
    uid = _uuid(req.user_id)
    target = db.get_user(uid)
    if target is None:
        raise HTTPException(404, "unknown user")
    token = secrets.token_urlsafe(32)
    expires = db.create_session(auth._token_hash(token), uid, IMPERSONATION_TTL, impersonated_by=admin["id"])
    db.add_audit(admin["id"], "impersonate_start", uid, {"expires_at": expires.isoformat()})
    return {"token": token, "user": {"id": uid, "email": target["email"], "language": db.get_language(uid)},
            "expires_at": expires.isoformat()}


@router.delete("/impersonate", status_code=204)
def impersonate_end(request: Request, user: dict = Depends(auth.current_user)) -> Response:
    if not user.get("_imp"):
        raise HTTPException(400, "not an impersonation session")
    db.delete_session(auth._token_hash(auth._bearer(request)))
    db.add_audit(user["_imp"], "impersonate_end", user["id"], {})
    return Response(status_code=204)


@router.get("/audit")
def audit(limit: int = 100, admin: dict = Depends(current_admin)) -> dict:
    return {"entries": db.list_audit(max(1, min(limit, 500)))}


@router.get("/acquisition")
def acquisition(admin: dict = Depends(current_admin)) -> dict:
    return db.acquisition()
