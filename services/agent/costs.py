"""Cost events: what the model, Apify, Resend and APNs cost per request (table cost_events, shown in the admin console).
Recording never raises: a failed insert must not break the request that caused the cost."""

import contextvars
import json
import logging
import os

import db

log = logging.getLogger("wishfit.costs")

# who the cost belongs to; set by the request handler, copied into worker threads by bound()
ctx: contextvars.ContextVar[dict] = contextvars.ContextVar("cost_ctx", default={})

# USD per 1M tokens (input, output). Unknown models fall back to DEFAULT_PRICE; MODEL_PRICES='{"model": [in, out]}' overrides.
MODEL_PRICES = {
    "anthropic/claude-sonnet-5.5": (3.0, 15.0),
    "anthropic/claude-opus-5.5": (15.0, 75.0),
    "anthropic/claude-haiku-5.5": (1.0, 5.0),
    "google/gemma-3-27b-it": (0.1, 0.3),
}
DEFAULT_PRICE = (3.0, 15.0)
RESEND_MAIL_USD = 0.0004  # 20 USD per 50k mails


def bound(fn):
    """fn runs in a copy of the caller's context (thread pools do not inherit it); one copy per call."""
    snapshot = contextvars.copy_context()

    def run(*args, **kwargs):
        return snapshot.copy().run(fn, *args, **kwargs)

    return run


def record(source: str, kind: str, usd: float, units: int = 1, detail: dict | None = None,
           user_id: str | None = None, result_id: str | None = None) -> None:
    c = ctx.get()
    try:
        db.add_cost(source, kind, round(float(usd), 6), int(units), user_id or c.get("user_id"),
                    result_id or c.get("result_id"), detail)
    except Exception as exc:
        log.warning("cost event not stored: %s", type(exc).__name__)


def price_of(model: str) -> tuple[tuple[float, float], bool]:
    try:
        override = json.loads(os.environ.get("MODEL_PRICES") or "{}")
    except ValueError:
        override = {}
    if model in override:
        return (float(override[model][0]), float(override[model][1])), True
    if model in MODEL_PRICES:
        return MODEL_PRICES[model], True
    return DEFAULT_PRICE, False


def model_cost(model: str, usage: dict, input_text: str, output_text: str) -> tuple[float, int, dict]:
    """(usd, tokens, detail). Without usage tokens from the endpoint the cost is estimated from characters / 4."""
    tin, tout = usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0)
    estimated = not (tin or tout)
    if estimated:
        tin, tout = len(input_text) // 4, len(output_text) // 4
    (pin, pout), known = price_of(model)
    detail = {"model": model, "input_tokens": tin, "output_tokens": tout}
    if estimated:
        detail["estimated"] = True
    if not known:
        detail["price_unknown"] = True
    return (tin * pin + tout * pout) / 1_000_000, tin + tout, detail


def record_model_call(call: dict) -> None:
    text = json.dumps(call.get("input"), ensure_ascii=False, default=str)
    usd, tokens, detail = model_cost(call["model"], call.get("usage") or {}, text, call.get("output") or "")
    record("model", call.get("step") or "call", usd, tokens, {**detail, "step": call.get("step")})
