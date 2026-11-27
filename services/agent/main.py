"""Wishloop agent API. Contract: docs/api.md. The deciding model call is `decide()`."""

import json
import os
import secrets
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from openai import OpenAI, OpenAIError
from pydantic import BaseModel, Field, ValidationError, model_validator

import storage

HERE = Path(__file__).parent
load_dotenv(HERE / ".env")

app = FastAPI(title="Wishloop Agent")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(RequestValidationError)
def invalid_request(_, exc: RequestValidationError):
    # Contract: error body is {"detail": string}.
    detail = "; ".join(f"{'.'.join(map(str, e['loc'][1:]))}: {e['msg']}" for e in exc.errors())
    return JSONResponse({"detail": detail}, status_code=422)


# --- contract models -------------------------------------------------------


class RecommendRequest(BaseModel):
    wishes: list[str] = Field(min_length=1, max_length=10)
    budget_eur: float = Field(gt=0)
    occasion: str
    recipient_name: str | None = None
    preferences: str | None = None
    demo_case: Literal["simple", "chaotic"] | None = None


class Signal(BaseModel):
    type: Literal["price_history", "availability", "offers", "category", "budget"]
    label: str
    value: str


class Recommendation(BaseModel):
    wish: str
    product_name: str
    action: Literal["buy", "wait", "alternative"]
    reason: str
    price_eur: float | None = None
    shipping_eur: float | None = None
    total_eur: float | None = None
    merchant: str | None = None
    offer_url: str | None = None
    image_url: str | None = None
    available: bool | None = None
    delivery_estimate: str | None = None
    signals: list[Signal] = Field(min_length=1)

    @model_validator(mode="after")
    def compute_total(self):
        # Never trust the model's arithmetic: total is always computed here.
        known = self.price_eur is not None and self.shipping_eur is not None
        self.total_eur = round(self.price_eur + self.shipping_eur, 2) if known else None
        return self


class Uncertainty(BaseModel):
    reasons: list[str] = Field(min_length=1)
    question: str = Field(min_length=1)


class Decision(BaseModel):
    """What the model must return. The response adds id, model, trace_url, created_at."""

    status: Literal["recommendation", "needs_clarification"]
    top: Recommendation | None = None
    alternatives: list[Recommendation] = Field(default_factory=list, max_length=3)
    uncertainty: Uncertainty | None = None

    @model_validator(mode="after")
    def consistent(self):
        if self.status == "recommendation" and self.top is None:
            raise ValueError("status 'recommendation' requires 'top'")
        if self.status == "needs_clarification":
            if self.uncertainty is None:
                raise ValueError("status 'needs_clarification' requires 'uncertainty'")
            self.top = None  # contract: top is null when needs_clarification
        return self


class RecommendResponse(Decision):
    id: str
    model: str
    trace_url: str
    created_at: str


# --- idealo data -----------------------------------------------------------


def fetch_idealo_live(req: RecommendRequest, trace: dict) -> list[dict]:
    """TODO(idealo-mcp): the ONE place to fill in once the idealo MCP tool list is known.

    Run `uv run python list_idealo_tools.py` to see the real tool names, then call them here
    (mcp.Client, see that script), append one entry per call to trace["idealo_calls"] with
    source "live" and return the results. No tool names are guessed until then.
    """
    raise HTTPException(502, "idealo MCP not configured yet")


def fetch_idealo(req: RecommendRequest, trace: dict) -> list[dict]:
    if not req.demo_case:
        return fetch_idealo_live(req, trace)
    started = time.perf_counter()
    snapshot = json.loads((HERE / "snapshots" / f"{req.demo_case}.json").read_text())
    duration_ms = round((time.perf_counter() - started) * 1000)
    for entry in snapshot["wishes"]:
        trace["idealo_calls"].append({
            "tool": "snapshot",
            "arguments": {"demo_case": req.demo_case, "wish": entry["wish"]},
            "result": entry,
            "duration_ms": duration_ms,
            "source": "snapshot",
        })
    return snapshot["wishes"]


# --- the deciding model call (Vercel AI Gateway) ----------------------------

SYSTEM_PROMPT = """You are Wishloop, a gift-buying agent. You get a gift request (wishes, total budget \
including shipping, occasion, recipient, preferences) and idealo data for every wish (products, offers per \
merchant, price history, availability, category). Decide what to buy. Use ONLY the idealo data given; never \
invent products, prices, merchants or URLs. Unknown values are null.

Return exactly one JSON object, no prose, no markdown:
{
  "status": "recommendation" | "needs_clarification",
  "top": Recommendation | null,
  "alternatives": [Recommendation],
  "uncertainty": {"reasons": [string], "question": string} | null
}
Recommendation = {
  "wish": string (the wish this answers, verbatim),
  "product_name": string,
  "action": "buy" | "wait" | "alternative",
  "reason": string,
  "price_eur": number | null, "shipping_eur": number | null,
  "merchant": string | null, "offer_url": string | null, "image_url": string | null,
  "available": boolean | null, "delivery_estimate": string | null,
  "signals": [{"type": "price_history" | "availability" | "offers" | "category" | "budget",
               "label": string, "value": string}]
}

Rules:
- "recommendation": exactly one top and 2-3 alternatives. Price plus shipping of the top must fit the budget.
- action "buy": good price now and available. "wait": price history says it is clearly above its usual level \
or it is temporarily unavailable. "alternative": a different product than the one wished for.
- signals: at least one per recommendation, the concrete idealo data points that carry the decision \
(numbers from price history, merchant/offer counts, availability, category, budget share).
- If the data is missing or contradictory (a wish matches several different products, the likely product is \
sold out at most merchants, merchants state strongly different prices, a wish is too vague to map to a \
product, nothing fits the budget) do NOT guess: set status "needs_clarification", top null, list every \
concrete reason in uncertainty.reasons and ask ONE follow-up question in uncertainty.question that would \
resolve the most important ambiguity. Alternatives may be empty then.
- If you can recommend but some doubt remains, keep status "recommendation" and still fill uncertainty.
- All human-readable strings (reason, signal label/value, reasons, question, delivery_estimate) in German, \
reason 1-3 sentences."""


GATEWAY_URL = "https://ai-gateway.vercel.sh/v1"
DEFAULT_MODEL = "anthropic/claude-sonnet-5.5"


def llm_client() -> OpenAI:
    """OpenAI-compatible client. Default: Vercel AI Gateway (API key locally, OIDC token on Vercel).
    LLM_BASE_URL + LLM_API_KEY point it at any other OpenAI-compatible endpoint, e.g. Nebius Token Factory."""
    key = os.environ.get("LLM_API_KEY") or os.environ.get("AI_GATEWAY_API_KEY") or os.environ.get("VERCEL_OIDC_TOKEN")
    if not key:
        raise HTTPException(502, "AI_GATEWAY_API_KEY is not configured")
    return OpenAI(api_key=key, base_url=os.environ.get("LLM_BASE_URL") or GATEWAY_URL, timeout=60)


def decide(req: RecommendRequest, idealo: list[dict], trace: dict) -> tuple[Decision, str]:
    """The deciding call: one chat completion through the Vercel AI Gateway (retried once on invalid JSON)."""
    model = os.environ.get("LLM_MODEL") or DEFAULT_MODEL
    client = llm_client()
    user = {"request": req.model_dump(exclude={"demo_case"}), "idealo_data": idealo}
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
    ]
    for _attempt in range(2):
        started_at = datetime.now(timezone.utc).isoformat()
        t0 = time.perf_counter()
        try:
            completion = client.chat.completions.create(
                model=model, messages=messages, response_format={"type": "json_object"}
            )
        except OpenAIError as exc:
            raise HTTPException(502, f"Model call failed: {type(exc).__name__}") from exc
        output = completion.choices[0].message.content or ""
        usage = completion.usage
        call = {
            "model": model,
            "input": [dict(m) for m in messages],
            "output": output,
            "started_at": started_at,
            "duration_ms": round((time.perf_counter() - t0) * 1000),
            "usage": {
                "prompt_tokens": getattr(usage, "prompt_tokens", 0) or 0,
                "completion_tokens": getattr(usage, "completion_tokens", 0) or 0,
            },
        }
        trace["model_calls"].append(call)
        print(json.dumps({"event": "model_call", **call}, ensure_ascii=False), flush=True)
        try:
            return Decision.model_validate_json(output), model
        except ValidationError as exc:
            messages += [
                {"role": "assistant", "content": output},
                {"role": "user", "content": f"Invalid output, return only the corrected JSON object. Errors: {exc}"},
            ]
    raise HTTPException(502, "model returned invalid JSON twice")


# --- endpoints -------------------------------------------------------------


@app.post("/recommend")
def recommend(req: RecommendRequest) -> RecommendResponse:
    result_id = "r_" + secrets.token_hex(6)
    trace = {"id": result_id, "model_calls": [], "idealo_calls": []}
    idealo = fetch_idealo(req, trace)
    decision, model = decide(req, idealo, trace)
    response = RecommendResponse(
        **decision.model_dump(),
        id=result_id,
        model=model,
        trace_url=f"/trace/{result_id}",
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    storage.save(result_id, response.model_dump(), trace)
    return response


def _stored(result_id: str) -> tuple[dict, dict]:
    row = storage.get(result_id)
    if row is None:
        raise HTTPException(404, "unknown result id")
    return row


@app.get("/results/{result_id}")
def results(result_id: str) -> RecommendResponse:
    return _stored(result_id)[0]


@app.get("/trace/{result_id}")
def trace(result_id: str) -> dict:
    return _stored(result_id)[1]


@app.get("/health")
def health() -> dict:
    return {"ok": True}
