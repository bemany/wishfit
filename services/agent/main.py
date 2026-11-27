"""Wishloop agent API. Contract: docs/api.md. The deciding model call is `decide()`."""

import json
import os
import secrets
import re
import threading
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, wait
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from openai import OpenAI, OpenAIError
from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator

import amazon
import auth
import idealo
import profiles
import storage

HERE = Path(__file__).parent
load_dotenv(HERE / ".env")

app = FastAPI(title="Wishloop Agent")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(auth.router)
app.include_router(profiles.router)


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


def clean_text(text: str | None) -> str | None:
    """Drop control and placeholder characters (iOS pastes U+FFFC for an attachment in the text field)."""
    if text is None:
        return None
    return "".join(
        ch for ch in text
        if ch in "\n\t" or (unicodedata.category(ch) not in ("Cc", "Cs", "Co") and ch not in "\ufffc\ufffd\ufff9\ufffa\ufffb\u200b\ufeff")
    )


# --- contract models -------------------------------------------------------


class RecommendRequest(BaseModel):
    input_text: str | None = Field(default=None, max_length=20000)
    wishes: list[str] = Field(default_factory=list, max_length=10)
    budget_eur: float | None = Field(default=None, gt=0)
    occasion: str | None = None
    recipient_name: str | None = None
    preferences: str | None = None
    language: Literal["de", "en"] | None = None  # effective default: the earlier request's, else "de"
    previous_id: str | None = None
    demo_case: Literal["simple", "chaotic", "chat"] | None = None
    # a photo of a product (JPEG or PNG, base64 without a data: prefix); a vision model names what it shows
    image_base64: str | None = Field(default=None, max_length=6_000_000)

    @field_validator("input_text", "wishes", "preferences", "occasion", "recipient_name", mode="after")
    @classmethod
    def clean(cls, value):
        return [clean_text(v) for v in value] if isinstance(value, list) else clean_text(value)

    @model_validator(mode="after")
    def some_input(self):
        if not self.wishes and not (self.input_text or "").strip() and not self.image_base64:
            raise ValueError("give input_text, a photo or at least one wish")
        if not self.previous_id and (self.budget_eur is None or self.occasion is None):
            raise ValueError("budget_eur and occasion are required without previous_id")
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
    reply: str = Field(min_length=1)
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


def _idealo_call(session: str | None, tool: str, arguments: dict, trace: dict, summarize, timeout: float | None = None) -> dict | list | None:
    started = time.perf_counter()
    try:
        extra = {} if timeout is None else {"timeout": timeout}
        result = summarize(idealo.call_tool(tool, arguments, session, **extra))
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


def is_single_offer(match: dict) -> bool:
    """idealo search also returns single merchant offers (redirect link, no catalog product):
    they have no offer list and no price history."""
    url = match.get("product_url") or ""
    return "offerKey=" in url or "oc_offer" in url or "relocator/relocate" in url


def offer_from_hit(match: dict) -> list[dict]:
    """A hit with price and link but no merchant offers becomes one offer; unknown merchant and shipping stay null."""
    if match.get("price_eur") is None or not match.get("product_url"):
        return []
    return [{
        "merchant": None,
        "price_eur": match["price_eur"],
        "shipping_eur": None,
        "delivery_estimate": None,
        "delivery_status": None,
        "free_return_days": None,
        "offer_url": match["product_url"],
        "available": True,  # the search ran with availableOnly
        "derived_from_search_hit": True,
    }]


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
                if is_single_offer(m):
                    m["offers"], m["price_history_30d"] = offer_from_hit(m), None  # nothing to look up for these
                    continue
                ref = {"productRef": m["productRef"]}
                jobs.append((m, "offers", pool.submit(_idealo_call, session, "get_product_offers", ref, trace, _offers_summary)))
                jobs.append((m, "price_history_30d", pool.submit(_idealo_call, session, "get_product_price_history", ref, trace, _history_summary)))
        for match, key, future in jobs:
            match[key] = future.result()
    for entry in data:
        for m in entry["matches"][:2]:
            if not m.get("offers") or isinstance(m["offers"], dict):  # empty or failed lookup
                m["offers"] = offer_from_hit(m)
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


# --- price tracker for wishes (POST /wishes/price, no model call) -------------

MAX_PRICE_WISHES = 20
TREND_THRESHOLD = 3.0  # percent over 30 days
PRICE_DEADLINE_S = 25  # whole request; wishes not done by then come back as null
PRICE_CALL_TIMEOUT_S = 8  # per idealo call
PRICE_CACHE_TTL_S = 30 * 60
PRICE_CACHE_MAX = 500
_price_cache: dict[str, tuple[float, dict]] = {}  # normalized title -> (monotonic time, price); per instance
_price_cache_lock = threading.Lock()


def _cache_get(key: str) -> dict | None:
    with _price_cache_lock:
        hit = _price_cache.get(key)
        if hit and time.monotonic() - hit[0] < PRICE_CACHE_TTL_S:
            return hit[1]
        _price_cache.pop(key, None)
    return None


def _cache_put(key: str, price: dict) -> None:
    with _price_cache_lock:
        if len(_price_cache) >= PRICE_CACHE_MAX:
            _price_cache.pop(min(_price_cache, key=lambda k: _price_cache[k][0]))
        _price_cache[key] = (time.monotonic(), price)


class PriceWish(BaseModel):
    title: str = Field(max_length=300)
    url: str | None = Field(default=None, max_length=2000)


class PriceRequest(BaseModel):
    wishes: list[PriceWish] = Field(max_length=MAX_PRICE_WISHES)


def _trend(change_percent: float | None) -> str | None:
    if change_percent is None:
        return None
    return "down" if change_percent <= -TREND_THRESHOLD else "up" if change_percent >= TREND_THRESHOLD else "stable"


def price_for(session: str | None, title: str, deadline: float | None = None) -> dict | None:
    """Best idealo hit for one wish: search (available only), then offers and 30-day history for a catalog hit.
    Single-merchant hits have neither offers list nor history (as in the recommend flow)."""
    trace = {"idealo_calls": []}  # the shared helper logs into a trace; not kept here

    def call(tool: str, arguments: dict, summarize):
        left = PRICE_CALL_TIMEOUT_S if deadline is None else min(PRICE_CALL_TIMEOUT_S, deadline - time.monotonic())
        if left <= 0:
            return None
        return _idealo_call(session, tool, arguments, trace, summarize, timeout=left)

    hits = call("search_products", {"query": title.strip(), "filters": {"availableOnly": True}}, _search_summary)
    if not isinstance(hits, list) or not hits:
        return None
    hit = hits[0]
    if hit.get("price_eur") is None:
        return None
    price, count, change = hit["price_eur"], hit.get("offer_count"), None
    if not is_single_offer(hit) and hit.get("productRef"):
        ref = {"productRef": hit["productRef"]}
        offers = call("get_product_offers", ref, _offers_summary)
        history = call("get_product_price_history", ref, _history_summary)
        prices = [o["price_eur"] for o in offers if o.get("price_eur") is not None] if isinstance(offers, list) else []
        if prices:
            price = min(prices + [price])
        if isinstance(history, dict):
            change = history.get("change_percent")
    return {
        "price_eur": price,
        "offer_count": count if isinstance(count, int) else 1,
        "in_stock": True,  # the search ran with availableOnly
        "trend": _trend(change),
        "change_percent": change,
        "url": hit.get("product_url"),
        "image_url": hit.get("image_url"),
        "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


@app.post("/wishes/price")
def wishes_price(req: PriceRequest, request: Request) -> dict:
    if len(req.wishes) > MAX_PRICE_WISHES:
        raise HTTPException(422, f"wishes: at most {MAX_PRICE_WISHES} per request")
    if profiles.limited(request):
        raise HTTPException(429, "too many requests, try again in a minute")
    if not os.environ.get("IDEALO_MCP_URL") or not os.environ.get("IDEALO_CLIENT_ID"):
        raise HTTPException(503, "idealo MCP not configured")
    titles = [w.title for w in req.wishes]
    if not any(t.strip() for t in titles):
        return {"prices": [None] * len(titles)}
    try:
        session = idealo.open_session()
    except Exception as exc:
        raise HTTPException(502, f"idealo MCP not reachable: {type(exc).__name__}") from exc

    deadline = time.monotonic() + PRICE_DEADLINE_S

    def one(title: str) -> dict | None:
        key = " ".join(title.lower().split())
        if not key:
            return None
        cached = _cache_get(key)
        if cached:
            return cached
        try:
            price = price_for(session, title, deadline)
        except Exception:  # one wish failing must not sink the others
            return None
        if price:
            _cache_put(key, price)
        return price

    # ponytail: 3 workers; idealo.call_tool also throttles per instance to 3 calls/s across all requests
    pool = ThreadPoolExecutor(max_workers=3)
    futures = [pool.submit(one, t) for t in titles]
    done, _ = wait(futures, timeout=PRICE_DEADLINE_S)
    pool.shutdown(wait=False, cancel_futures=True)
    return {"prices": [f.result() if f in done else None for f in futures]}


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
A missing shipping_eur is null, not 0. A match can carry a single offer derived from the search hit \
("derived_from_search_hit": true): price and link are real, merchant, shipping and delivery are unknown (null) \
and there is no price history. That is a usable offer: recommend it, keep the unknowns null and name them \
openly in reason and in a signal (for example "merchant and shipping not known, check on idealo").

Return exactly one JSON object, no prose, no markdown:
{
  "status": "recommendation" | "needs_clarification",
  "reply": string,
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
- "recommendation": exactly one top and up to 3 alternatives (fewer if the data has fewer usable matches). Price plus shipping of the top must fit the budget.
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
- Write every human-readable string in the language given in "language": "de" = German, addressing the \
giver informally with "du", never "Sie"; "en" = English.
- "follow_up" (may be null) is the giver's new message after the earlier turn. Your answer must satisfy it; if \
no match does, say so in reply and uncertainty instead of ignoring it.
- reply: your chat message for this turn, 1-2 sentences, spoken to the giver: what you picked and why in plain \
words, or what you need to know. Never empty.
- "previous_pick" (may be null) is the product you recommended in the earlier turn of this conversation \
(product name, total, action): it is the reference for follow-ups like "cheaper" or "something else". \
Do not return the same product again unless the giver asks for it. "Cheaper" means a total clearly below \
previous_pick.total_eur.
- Prefer a recommendation: if at least one match fits the budget and the person, recommend it and put remaining \
doubts into uncertainty. Use needs_clarification only when nothing fits the person at all or the budget is not \
enough for any match. An unknown merchant or shipping cost is NOT a reason to ask.
- Prefer matches that fit ALL named traits (for example red AND glittery). A brand or theme the giver mentions \
(for example a motorcycle brand) is a soft wish: use it when a match fits, otherwise recommend the best match \
for the other traits and say that the theme is missing.
- "must_recommend" true means you already asked twice in this conversation: you MUST return status \
"recommendation" now with the best available match (and 2-3 alternatives if there are any), however imperfect; \
state the doubts in reason and uncertainty. Also for follow-ups like "something else": give the next best match, \
do not ask again.
- Alternatives are different products than top, taken from the matches; if fewer than 2 other matches exist, \
give fewer."""


GATEWAY_URL = "https://ai-gateway.vercel.sh/v1"
DEFAULT_MODEL = "anthropic/claude-sonnet-5.5"
VISION_MODEL = "google/gemma-3-27b-it"  # on Nebius Token Factory; LLM_VISION_MODEL overrides it


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
- summary: one sentence about the person as far as the input supports it.
- interests: up to 6 short keywords found in the input.
- candidates: 1-5 concrete gift ideas, each phrased as a product search term a price-comparison site would \
understand (always German: the catalog is idealo.de), most promising first, realistic for the budget. why: the \
part of the input the idea comes from, quoted or closely paraphrased. Respect dislikes and constraints stated in the input.
- "[Foto] <product> (Suchbegriff: <term>)" is a product the giver photographed, named by a vision model. The \
last "[Foto]" in the input is what the giver is asking about now: make that product the first candidate, whatever \
came earlier in the conversation, unless the giver's words next to it say otherwise (for example "something like this, but cheaper").
- Lines starting with "Nachtrag:" are follow-up instructions from the giver after an earlier answer (for \
example cheaper, something completely different, the person already owns it). Apply them: adjust or replace the \
candidates accordingly instead of repeating the earlier ones.
- Write every human-readable string in the language given in "language": "de" = German, addressing the \
giver informally with "du", never "Sie"; "en" = English.
- "previous_pick" (may be null) is the product you recommended in the earlier turn of this conversation \
(product name, total, action): it is the reference for follow-ups like "cheaper" or "something else". \
Do not return the same product again unless the giver asks for it. "Cheaper" means a total clearly below \
previous_pick.total_eur.
- Use only what the input says. Do not invent facts about the person. If the input names explicit products, \
keep them as candidates."""


def call_model(step: str, messages: list[dict], schema: type[BaseModel], trace: dict,
               model: str | None = None) -> tuple[BaseModel, str]:
    """One chat completion through the Vercel AI Gateway, validated against schema, retried once on invalid JSON."""
    model = model or os.environ.get("LLM_MODEL") or DEFAULT_MODEL
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
            # a photo is logged as a placeholder, not as megabytes of base64
            "input": [m if isinstance(m["content"], str) else {**m, "content": "[text + photo]"} for m in messages],
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


class Photo(BaseModel):
    product: str  # empty when the photo shows no recognizable product
    search_term: str


PHOTO_PROMPT = """The giver photographed something as a gift idea. Return ONE JSON object and nothing else:
{"product": string, "search_term": string}
- product: what the photo shows, as precisely as it is visible: kind of product, brand, model, colour, size. \
Read brand and model from logos, labels and packaging; do not guess a model that is not visible.
- search_term: the German search term a price-comparison site (idealo.de) would need to find this product.
- If the photo shows no recognizable product, return both as empty strings."""


def with_photo(req: RecommendRequest, trace: dict) -> RecommendRequest:
    """Step 0, only with a photo: a vision model names the product, which then goes on as text."""
    if not req.image_base64:
        return req
    mime = "image/png" if req.image_base64.startswith("iVBOR") else "image/jpeg"
    messages = [
        {"role": "system", "content": PHOTO_PROMPT},
        {"role": "user", "content": [
            {"type": "text", "text": req.input_text or "What is this?"},
            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{req.image_base64}"}},
        ]},
    ]
    photo = call_model("photo", messages, Photo, trace, os.environ.get("LLM_VISION_MODEL") or VISION_MODEL)[0]
    if not photo.product.strip():
        raise HTTPException(422, "I could not recognize a product in the photo. Try another photo or describe it.")
    trace["sources"].append({"type": "photo", "product": photo.product, "search_term": photo.search_term})
    # one line, photo first, so it stays one message in the conversation
    line = f"[Foto] {photo.product} (Suchbegriff: {photo.search_term})"
    return req.model_copy(update={"image_base64": None, "input_text": " ".join(filter(None, [line, (req.input_text or "").strip()]))[:20000]})


def understand(req: RecommendRequest, trace: dict, previous_pick: dict | None = None) -> Understood:
    """Step 1: turn free-form input into gift ideas."""
    user = req.model_dump(exclude={"demo_case", "previous_id", "image_base64"}) | {"previous_pick": previous_pick}
    messages = [
        {"role": "system", "content": UNDERSTAND_PROMPT},
        {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
    ]
    return call_model("understand", messages, Understood, trace)[0]


def decide(req: RecommendRequest, understood: Understood | None, idealo: list[dict], trace: dict,
           previous_pick: dict | None = None, follow_up: str | None = None,
           must_recommend: bool = False) -> tuple[Decision, str]:
    """Step 2, the deciding call: buy, wait or alternative, from the request plus the idealo data."""
    user = {
        "request": req.model_dump(exclude={"demo_case", "input_text", "previous_id", "image_base64"}),
        "previous_pick": previous_pick,
        "follow_up": follow_up,
        "must_recommend": must_recommend,
        "understood": understood.model_dump() if understood else None,
        "idealo_data": idealo,
    }
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
    ]
    decision, model = call_model("decide", messages, Decision, trace)
    if must_recommend and decision.status != "recommendation":
        messages = messages + [
            {"role": "assistant", "content": decision.model_dump_json()},
            {"role": "user", "content": 'You already asked twice. Return status "recommendation" now with the best match from the data.'},
        ]
        decision, model = call_model("decide", messages, Decision, trace)
    return decision, model


def with_amazon_wishlist(req: RecommendRequest, trace: dict) -> RecommendRequest:
    """If the input contains a public Amazon wishlist link, read it and add its items to the input text."""
    url = amazon.find_url(req.input_text) or amazon.find_url(" ".join(req.wishes))
    if not url:
        return req
    try:
        items, status = amazon.fetch(url)
    except Exception as exc:
        items, status = [], type(exc).__name__
    trace["sources"].append({"type": "amazon_wishlist", "url": url, "status": status, "items": items})
    if items:
        block = "Amazon-Wunschliste der Person:\n" + "\n".join(f"- {i['title'][:160]}" + (f" ({i['price']})" if i["price"] else "") for i in items[:30])
    else:
        block = f"Hinweis: Die verlinkte Amazon-Wunschliste konnte nicht gelesen werden ({status})."
    text = ((req.input_text or "") + "\n\n" + block)[:20000]
    return req.model_copy(update={"input_text": text, "wishes": [w for w in req.wishes if not amazon.find_url(w)]})


MAX_AMAZON_LINKS = 3
AMAZON_BUDGET_S = 6.0


def with_amazon_link(req: RecommendRequest, trace: dict) -> RecommendRequest:
    """Amazon short links and product links in the new message: resolve the redirect (only Amazon hosts),
    use the product slug as the wish. Without a slug the link is dropped (never handed to the model); the trace
    keeps only resolved/rejected/failed and the ASIN. Runs before the message is stored, so follow-ups do not resolve again."""
    deadline = time.monotonic() + AMAZON_BUDGET_S
    done = 0

    def replace(text: str) -> str:
        nonlocal done
        for url in amazon.find_product_urls(text):
            if done >= MAX_AMAZON_LINKS or time.monotonic() >= deadline:
                term, status, asin = None, "skipped", None
            else:
                done += 1
                term, status, asin = amazon.resolve_product(url, max(0.5, min(5.0, deadline - time.monotonic())))
            entry = {"type": "amazon_link", "status": status, "asin": asin, "search_term": term}
            if status != "rejected":
                entry["url"] = url.split("?")[0]
            trace["sources"].append(entry)
            text = text.replace(url, f"Amazon-Produkt (aus Link): {term}" if term else "")
        return text.strip()

    update = {}
    if req.input_text and amazon.find_product_urls(req.input_text):
        update["input_text"] = replace(req.input_text)
    if any(amazon.find_product_urls(w) for w in req.wishes):
        update["wishes"] = [w for w in (replace(w) for w in req.wishes) if w]
    return req.model_copy(update=update) if update else req


def enforce_budget(decision: Decision, req: RecommendRequest) -> Decision:
    """Never trust the model on the budget: a top pick over budget is replaced by the first alternative that fits,
    else the answer becomes a clarification. Unknown shipping is always named."""
    de = req.language != "en"
    if decision.status != "recommendation" or decision.top is None:
        return decision

    def total(rec: Recommendation) -> float | None:
        return None if rec.price_eur is None else rec.price_eur + (rec.shipping_eur or 0)

    def fits(rec: Recommendation) -> bool:
        t = total(rec)
        return t is None or req.budget_eur is None or t <= req.budget_eur

    def name_shipping(rec: Recommendation) -> None:
        text = (rec.reason + " " + " ".join(f"{s.label} {s.value}" for s in rec.signals)).lower()
        if rec.shipping_eur is None and not re.search(r"versand[^.]*(unbekannt|nicht bekannt)|shipping[^.]*(unknown|not known)", text):
            rec.signals.append(Signal(type="budget", label="Versand" if de else "Shipping", value="Versand unbekannt" if de else "Shipping unknown"))

    if not fits(decision.top):
        ok = next((a for a in decision.alternatives if fits(a)), None)
        if ok is None:
            reason = (f"Kein Treffer passt ins Budget von {req.budget_eur:g} €." if de else f"No match fits the budget of {req.budget_eur:g} EUR.")
            question = ("Darf das Budget etwas höher sein oder soll ich etwas anderes suchen?" if de else "Can the budget be a bit higher, or should I look for something else?")
            return Decision(status="needs_clarification", reply=f"{reason} {question}",
                            uncertainty=Uncertainty(reasons=[reason], question=question))
        rest = [a for a in [decision.top, *decision.alternatives] if a is not ok][:3]
        note = ("Der erste Vorschlag lag über dem Budget, deshalb dieser: " if de else "The first pick was over budget, so this one instead: ")
        decision = decision.model_copy(update={"top": ok, "alternatives": rest, "reply": note + ok.product_name})
    for rec in [decision.top, *decision.alternatives]:
        name_shipping(rec)
    return decision


# --- endpoints -------------------------------------------------------------

IDEAS_ONLY = {  # language -> (reply, reason, question)
    "de": ("Ich habe ein paar Ideen gefunden, aber noch keine Preisdaten dazu. Welche soll ich genauer prüfen?",
           "Für diese Geschenkideen liegen noch keine idealo-Daten vor (Preise, Verfügbarkeit, Angebote).",
           "Welche der Ideen soll ich genauer prüfen, sobald Preisdaten verfügbar sind?"),
    "en": ("I found a few ideas but have no price data for them yet. Which one should I look into?",
           "There is no idealo data for these gift ideas yet (prices, availability, offers).",
           "Which of the ideas should I check in detail once price data is available?"),
}
BASICS = ("budget_eur", "occasion", "recipient_name", "preferences", "language")


def continue_conversation(req: RecommendRequest) -> tuple[RecommendRequest, dict, dict | None]:
    """Resolve previous_id: fill omitted basics from the earlier request and prepend the earlier messages.
    Returns the effective request, the conversation to store with this result, and the previous pick."""
    message = req.input_text or ", ".join(req.wishes)  # ponytail: a wishes-only turn is kept as one text line
    earlier, previous_pick = {"messages": []}, None
    if req.previous_id:
        row = storage.get(req.previous_id)
        if row is None:
            raise HTTPException(404, "unknown previous_id")
        earlier = row[1].get("conversation") or earlier  # results stored before conversations existed
        top = row[0].get("top")
        previous_pick = top and {k: top.get(k) for k in ("product_name", "total_eur", "action")}
    basics = {k: getattr(req, k) if getattr(req, k) is not None else earlier.get(k) for k in BASICS}
    basics["language"] = basics["language"] or "de"
    if basics["budget_eur"] is None or basics["occasion"] is None:
        raise HTTPException(422, "budget_eur and occasion are required")  # earlier result carries no basics
    messages = earlier["messages"] + [message]
    update = dict(basics)
    if len(messages) > 1:
        update["input_text"] = "\n".join([messages[0]] + [f"Nachtrag: {m}" for m in messages[1:]])
    return req.model_copy(update=update), {"messages": messages, **basics, "clarify_streak": earlier.get("clarify_streak", 0)}, previous_pick



@app.post("/recommend")
def recommend(req: RecommendRequest, user: dict | None = Depends(auth.optional_user)) -> RecommendResponse:
    result_id = "r_" + secrets.token_hex(6)
    trace = {"id": result_id, "sources": [], "model_calls": [], "idealo_calls": []}
    req = with_photo(req, trace)  # before the conversation, so the named product is part of the stored message
    req = with_amazon_link(req, trace)  # likewise: the stored message holds the resolved term, not the link
    if not req.wishes and not (req.input_text or "").strip():
        raise HTTPException(422, "I could not read that link. Describe what you are looking for in a few words."
                            if req.language == "en" else
                            "Den Link kann ich keinem Produkt zuordnen. Beschreib kurz, wonach du suchst.")
    req, conversation, previous_pick = continue_conversation(req)
    trace["conversation"] = conversation
    req = with_amazon_wishlist(req, trace)
    understood = understand(req, trace, previous_pick) if (req.input_text or "").strip() else None
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
        reply, reason, question = IDEAS_ONLY[req.language]
        decision = Decision(status="ideas_only", reply=reply, uncertainty=Uncertainty(reasons=[reason], question=question))
        model = trace["model_calls"][-1]["model"]
    else:
        follow_up = conversation["messages"][-1] if req.previous_id else None
        decision, model = decide(req, understood, idealo, trace, previous_pick, follow_up,
                                 must_recommend=conversation["clarify_streak"] >= 2)
        decision = enforce_budget(decision, req)
        conversation["clarify_streak"] = conversation["clarify_streak"] + 1 if decision.status == "needs_clarification" else 0
    response = RecommendResponse(
        **decision.model_dump(),
        understood=understood,
        id=result_id,
        model=model,
        trace_url=f"/trace/{result_id}",
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    storage.save(result_id, response.model_dump(), trace, user["id"] if user else None)
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
