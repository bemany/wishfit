"""Wishloop agent API. Contract: docs/api.md. The deciding model call is `decide()`."""

import json
import os
import secrets
import time
from concurrent.futures import ThreadPoolExecutor
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

import idealo
import storage

HERE = Path(__file__).parent
load_dotenv(HERE / ".env")

app = FastAPI(title="Wishloop Agent")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def vercel_oidc(request, call_next):
    # On Vercel the OIDC token for the AI Gateway arrives per request as a header, not as an env var.
    # ponytail: copied into the process env, it is the same project token for every request.
    token = request.headers.get("x-vercel-oidc-token")
    if token:
        os.environ["VERCEL_OIDC_TOKEN"] = token
    return await call_next(request)


@app.exception_handler(RequestValidationError)
def invalid_request(_, exc: RequestValidationError):
    # Contract: error body is {"detail": string}.
    detail = "; ".join(f"{'.'.join(map(str, e['loc'][1:]))}: {e['msg']}" for e in exc.errors())
    return JSONResponse({"detail": detail}, status_code=422)


# --- contract models -------------------------------------------------------


class RecommendRequest(BaseModel):
    input_text: str | None = Field(default=None, max_length=20000)
    wishes: list[str] = Field(default_factory=list, max_length=10)
    budget_eur: float = Field(gt=0)
    occasion: str
    recipient_name: str | None = None
    preferences: str | None = None
    demo_case: Literal["simple", "chaotic", "chat"] | None = None

    @model_validator(mode="after")
    def some_input(self):
        if not self.wishes and not (self.input_text or "").strip():
            raise ValueError("give input_text or at least one wish")
        return self


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


class Candidate(BaseModel):
    idea: str
    why: str


class Understood(BaseModel):
    """What the agent took from free-form input (first model step)."""

    summary: str
    interests: list[str] = Field(default_factory=list)
    candidates: list[Candidate] = Field(min_length=1, max_length=5)


class Decision(BaseModel):
    """What the model must return. The response adds id, model, trace_url, created_at."""

    status: Literal["recommendation", "needs_clarification", "ideas_only"]
    top: Recommendation | None = None
    alternatives: list[Recommendation] = Field(default_factory=list, max_length=3)
    uncertainty: Uncertainty | None = None

    @model_validator(mode="after")
    def consistent(self):
        if self.status == "recommendation" and self.top is None:
            raise ValueError("status 'recommendation' requires 'top'")
        if self.status != "recommendation":
            if self.uncertainty is None:
                raise ValueError(f"status '{self.status}' requires 'uncertainty'")
            self.top = None  # contract: top is null unless there is a recommendation
        return self


class RecommendResponse(Decision):
    understood: Understood | None = None
    id: str
    model: str
    trace_url: str
    created_at: str


# --- idealo data -----------------------------------------------------------


def _eur(text: str | None) -> float | None:
    """'1.019,90 €' -> 1019.9. idealo returns formatted strings; the model gets numbers."""
    if not text:
        return None
    try:
        return float(text.replace("€", "").replace("\xa0", "").replace(".", "").replace(",", ".").strip())
    except ValueError:
        return None


def _idealo_call(session: str | None, tool: str, arguments: dict, trace: dict, summarize) -> dict | list | None:
    started = time.perf_counter()
    try:
        result = summarize(idealo.call_tool(tool, arguments, session))
    except Exception as exc:  # one failed lookup must not sink the whole request; the model sees the gap
        result = {"error": f"{type(exc).__name__}: {exc}"[:200]}
    trace["idealo_calls"].append({
        "tool": tool,
        "arguments": arguments,
        "result": result,
        "duration_ms": round((time.perf_counter() - started) * 1000),
        "source": "live",
    })
    return result


def _search_summary(raw: dict) -> list[dict]:
    return [
        {
            "productRef": r.get("productRef"),
            "product_name": " ".join(x for x in (r.get("name"), r.get("nameDelta")) if x),
            "price_eur": _eur(r.get("price")),
            "product_url": r.get("url"),
            "image_url": r.get("imageUrl"),
            "user_rating": r.get("userReviewsSummary"),
            "test_grade": (r.get("testReportsSummary") or {}).get("grade"),
            "offer_count": r.get("totalOfferCount"),
            "bargain_discount_percent": ((r.get("badges") or {}).get("bargain") or {}).get("discountRate"),
        }
        for r in (raw.get("results") or [])[:3]
    ]


def _offers_summary(raw: dict) -> list[dict]:
    return [
        {
            "merchant": (o.get("shop") or {}).get("name"),
            "price_eur": _eur(o.get("price")),
            "shipping_eur": 0.0 if o.get("hasAlwaysFreeShipping") else _eur(o.get("minShippingCost")),
            "delivery_estimate": (o.get("delivery") or {}).get("deliveryText"),
            "delivery_status": (o.get("delivery") or {}).get("deliveryStatus"),
            "free_return_days": o.get("freeReturnDays"),
            "offer_url": o.get("relocatorUrl"),
        }
        for o in (raw.get("offers") or [])[:5]
    ]


def _history_summary(raw: dict) -> dict | None:
    trend = raw.get("priceTrend")
    if not trend:
        return None
    s = trend.get("statistics") or {}
    return {
        "period_days": trend.get("periodDays"),
        "current_eur": _eur(s.get("currentPrice")),
        "lowest_eur": _eur(s.get("minPrice")),
        "highest_eur": _eur(s.get("maxPrice")),
        "average_eur": _eur(s.get("avgPrice")),
        "change_percent": round(s["priceChangePercent"], 1) if isinstance(s.get("priceChangePercent"), (int, float)) else None,
        "lowest_date": (s.get("lowestPriceDate") or "")[:10] or None,
    }


def fetch_idealo_live(req: RecommendRequest, trace: dict) -> list[dict]:
    """Live idealo data over the idealo MCP: per wish a catalog search within budget, then offers
    (with shipping and delivery) and the 30-day price history for the two best matches."""
    if not os.environ.get("IDEALO_MCP_URL") or not os.environ.get("IDEALO_CLIENT_ID"):
        raise HTTPException(502, "idealo MCP not configured yet")
    try:
        session = idealo.open_session()
    except Exception as exc:
        raise HTTPException(502, f"idealo MCP not reachable: {type(exc).__name__}") from exc
    wishes = req.wishes[:5]
    # ponytail: 3 workers = the trial tier's 3 req/s; raise with a partner-tier key
    with ThreadPoolExecutor(max_workers=3) as pool:
        searches = list(pool.map(
            lambda w: _idealo_call(session, "search_products",
                                   {"query": w, "filters": {"maxPrice": req.budget_eur, "availableOnly": True}},
                                   trace, _search_summary),
            wishes,
        ))
        data = []
        jobs = []
        for wish, found in zip(wishes, searches):
            matches = found if isinstance(found, list) else []
            data.append({"wish": wish, "matches": matches, **({"search_error": found["error"]} if isinstance(found, dict) else {})})
            for m in matches[:2]:
                ref = {"productRef": m["productRef"]}
                jobs.append((m, "offers", pool.submit(_idealo_call, session, "get_product_offers", ref, trace, _offers_summary)))
                jobs.append((m, "price_history_30d", pool.submit(_idealo_call, session, "get_product_price_history", ref, trace, _history_summary)))
        for match, key, future in jobs:
            match[key] = future.result()
    return data


def fetch_idealo(req: RecommendRequest, trace: dict) -> list[dict]:
    if not req.demo_case:
        return fetch_idealo_live(req, trace)  # req.wishes already holds the extracted ideas
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

SYSTEM_PROMPT = """You are Wishloop, a gift-buying agent. Step 2: decide. You get a gift request (wishes, total budget \
including shipping, occasion, recipient, preferences) and idealo data for every wish (products, offers per \
merchant, price history, availability, category). Decide what to buy. Use ONLY the idealo data given; never \
invent products, prices, merchants or URLs. Unknown values are null.

The data is live from idealo unless marked as snapshot. Per wish you get up to 3 catalog matches; the first \
two carry "offers" (merchant, price_eur, shipping_eur, delivery_estimate, offer_url) and "price_history_30d" \
(current, lowest, highest, average, change_percent). "understood" (may be null) is what step 1 took from the \
giver's free-form input: prefer ideas that fit the person, not just the cheapest item. Take offer_url, \
image_url, merchant, price and shipping from ONE concrete offer. Price history covers 30 days; say so. \
A missing shipping_eur is null, not 0.

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
 Address the giver informally with "du", never "Sie".
- Prefer a recommendation: if at least one match fits the budget and the person, recommend it and put remaining \
doubts into uncertainty. Use needs_clarification only when no match is usable at all."""


GATEWAY_URL = "https://ai-gateway.vercel.sh/v1"
DEFAULT_MODEL = "anthropic/claude-sonnet-5.5"


def llm_client() -> OpenAI:
    """OpenAI-compatible client. Default: Vercel AI Gateway (API key locally, OIDC token on Vercel).
    LLM_BASE_URL + LLM_API_KEY point it at any other OpenAI-compatible endpoint, e.g. Nebius Token Factory."""
    key = os.environ.get("LLM_API_KEY") or os.environ.get("AI_GATEWAY_API_KEY") or os.environ.get("VERCEL_OIDC_TOKEN")
    if not key:
        raise HTTPException(502, "AI_GATEWAY_API_KEY is not configured")
    return OpenAI(api_key=key, base_url=os.environ.get("LLM_BASE_URL") or GATEWAY_URL, timeout=60)


UNDERSTAND_PROMPT = """You are Wishloop, a gift-buying agent. Step 1: understand the input. You get whatever \
the giver knows about a person: a pasted wishlist, a chat export, notes, interests, a dictated description, \
plus occasion, budget and optional preferences. Return ONE JSON object and nothing else:
{"summary": string, "interests": [string], "candidates": [{"idea": string, "why": string}]}
- summary: one German sentence about the person as far as the input supports it.
- interests: up to 6 short German keywords found in the input.
- candidates: 1-5 concrete gift ideas, each phrased as a product search term a price-comparison site would \
understand (German), most promising first, realistic for the budget. why: the part of the input the idea comes \
from, quoted or closely paraphrased in German. Respect dislikes and constraints stated in the input.
- Lines starting with "Nachtrag:" are follow-up instructions from the giver after an earlier answer (for \
example cheaper, something completely different, the person already owns it). Apply them: adjust or replace the \
candidates accordingly instead of repeating the earlier ones.
- Use only what the input says. Do not invent facts about the person. If the input names explicit products, \
keep them as candidates."""


def call_model(step: str, messages: list[dict], schema: type[BaseModel], trace: dict) -> tuple[BaseModel, str]:
    """One chat completion through the Vercel AI Gateway, validated against schema, retried once on invalid JSON."""
    model = os.environ.get("LLM_MODEL") or DEFAULT_MODEL
    client = llm_client()
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
            "step": step,
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
            return schema.model_validate_json(output), model
        except ValidationError as exc:
            messages = messages + [
                {"role": "assistant", "content": output},
                {"role": "user", "content": f"Invalid output, return only the corrected JSON object. Errors: {exc}"},
            ]
    raise HTTPException(502, "model returned invalid JSON twice")


def understand(req: RecommendRequest, trace: dict) -> Understood:
    """Step 1: turn free-form input into gift ideas."""
    user = req.model_dump(exclude={"demo_case"})
    messages = [
        {"role": "system", "content": UNDERSTAND_PROMPT},
        {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
    ]
    return call_model("understand", messages, Understood, trace)[0]


def decide(req: RecommendRequest, understood: Understood | None, idealo: list[dict], trace: dict) -> tuple[Decision, str]:
    """Step 2, the deciding call: buy, wait or alternative, from the request plus the idealo data."""
    user = {
        "request": req.model_dump(exclude={"demo_case", "input_text"}),
        "understood": understood.model_dump() if understood else None,
        "idealo_data": idealo,
    }
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
    ]
    return call_model("decide", messages, Decision, trace)


# --- endpoints -------------------------------------------------------------


@app.post("/recommend")
def recommend(req: RecommendRequest) -> RecommendResponse:
    result_id = "r_" + secrets.token_hex(6)
    trace = {"id": result_id, "model_calls": [], "idealo_calls": []}
    understood = understand(req, trace) if (req.input_text or "").strip() else None
    if understood:
        # the extracted ideas are researched like explicit wishes
        req = req.model_copy(update={"wishes": (req.wishes + [c.idea for c in understood.candidates])[:10]})
    try:
        idealo = fetch_idealo(req, trace)
    except HTTPException:
        if not understood:
            raise
        # No idealo data for free input (MCP not connected): say so instead of inventing prices.
        idealo = None
    if idealo is None:
        decision = Decision(
            status="ideas_only",
            uncertainty=Uncertainty(
                reasons=["Für diese Geschenkideen liegen noch keine idealo-Daten vor (Preise, Verfügbarkeit, Angebote)."],
                question="Welche der Ideen soll ich genauer prüfen, sobald Preisdaten verfügbar sind?",
            ),
        )
        model = trace["model_calls"][-1]["model"]
    else:
        decision, model = decide(req, understood, idealo, trace)
    response = RecommendResponse(
        **decision.model_dump(),
        understood=understood,
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
