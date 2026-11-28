"""Price source on Apify actors (PRICE_SOURCE=apify), test backend only.
Search + shop offers: memo23/idealo-scraper (one run, fetchOffers). Price history: ahmed_jasarevic/idealo-scraper.
Output is mapped to the same internal fields the idealo MCP path produces. Accounts come from APIFY_TOKENS
(comma separated), runs rotate round-robin; an account that is out of credit (402/403/429) is skipped.
Tokens are never logged or returned; accounts are only ever called "Konto 1..n"."""

import itertools
from urllib.parse import quote
import os
import threading
import time

import httpx

import costs
import db

API = "https://api.apify.com/v2"
SEARCH_ACTOR = "memo23~idealo-scraper"
HISTORY_ACTOR = "ahmed_jasarevic~idealo-scraper"
SEARCH_HITS = 3  # maxItems of a search run: few hits per wish keep the bill small
SEARCH_MEMORY_MB = 512
HISTORY_MEMORY_MB = 2048  # the actor needs 2 GB for its browser fallback
SEARCH_MAX_CHARGE_USD = 0.10
HISTORY_MAX_CHARGE_USD = 0.25  # price history is charged per data point
OFFER_CACHE_TTL_S = 30 * 60
CREDIT_MESSAGES = ("monthly usage", "usage limit", "not enough credit", "insufficient", "payment required")  # clear limit errors only
DAILY_USD_DEFAULT = 0.50

_rr = itertools.count()
_rr_lock = threading.Lock()
_offer_cache: dict[str, tuple[float, dict]] = {}  # productId -> (time, {"url", "offers"}); per instance
_offer_lock = threading.Lock()


class ApifyError(RuntimeError):
    pass


class _OutOfCredit(Exception):
    pass


def tokens() -> list[str]:
    return [t.strip() for t in (os.environ.get("APIFY_TOKENS") or "").split(",") if t.strip()]


def configured() -> bool:
    return bool(tokens())


def _accounts() -> list[tuple[int, str]]:
    toks = tokens()
    if not toks:
        raise ApifyError("APIFY_TOKENS not configured")
    with _rr_lock:
        start = next(_rr) % len(toks)
    return [((start + i) % len(toks), toks[(start + i) % len(toks)]) for i in range(len(toks))]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _check(r: httpx.Response) -> None:
    if r.status_code in (402, 403, 429):
        raise _OutOfCredit(r.status_code)
    if r.status_code >= 400:
        raise ApifyError(f"apify returned {r.status_code}")


def _run_on(token: str, actor: str, run_input: dict, memory: int, max_charge: float, max_items: int, deadline: float, box: dict | None = None) -> tuple[list[dict], dict]:
    left = deadline - time.monotonic()
    if left < 3:
        raise ApifyError("no time left")
    with httpx.Client(headers=_auth(token), timeout=min(70, left + 5)) as http:
        r = http.post(f"{API}/acts/{actor}/runs", json=run_input, params={
            "timeout": int(left), "memory": memory, "maxTotalChargeUsd": max_charge, "waitForFinish": int(min(55, left))})
        _check(r)
        run = r.json()["data"]
        if box is not None:
            box["run_id"] = run["id"]
        while run["status"] in ("READY", "RUNNING"):
            left = deadline - time.monotonic()
            if left < 1:
                http.post(f"{API}/actor-runs/{run['id']}/abort")
                raise ApifyError("actor run timed out")
            r = http.get(f"{API}/actor-runs/{run['id']}", params={"waitForFinish": int(min(55, left))})
            _check(r)
            run = r.json()["data"]
        if run["status"] != "SUCCEEDED":
            message = (run.get("statusMessage") or "").lower()
            if any(w in message for w in CREDIT_MESSAGES):
                raise _OutOfCredit(message[:60])
            raise ApifyError(f"actor run {run['status'].lower()}")
        r = http.get(f"{API}/datasets/{run['defaultDatasetId']}/items", params={"limit": max_items, "clean": 1})
        _check(r)
        items = r.json()
        # the run's usage lags behind the last charged events by a moment
        final = http.get(f"{API}/actor-runs/{run['id']}").json()["data"]
        for _ in range(3):  # charged events land a moment after the run ends: wait until the figure is stable
            if time.monotonic() > deadline - 3:
                break
            time.sleep(2)
            again = http.get(f"{API}/actor-runs/{run['id']}").json()["data"]
            stable = (again.get("usageTotalUsd") or 0) == (final.get("usageTotalUsd") or 0)
            final = again
            if stable and (final.get("usageTotalUsd") or 0) > 0:
                break
    return items if isinstance(items, list) else [], final


def daily_budget_usd() -> float:
    try:
        return float(os.environ.get("APIFY_DAILY_USD") or DAILY_USD_DEFAULT)
    except ValueError:
        return DAILY_USD_DEFAULT


def _settle(token: str, run_id: str) -> dict:
    """Usage of a run that did not finish normally (timeout, abort, failure): read once, after a short wait."""
    time.sleep(2)
    try:
        r = httpx.get(f"{API}/actor-runs/{run_id}", headers=_auth(token), timeout=8)
        return r.json()["data"] if r.status_code < 400 else {}
    except Exception:
        return {}


def run_actor(actor: str, run_input: dict, *, memory: int, max_charge: float, max_items: int, timeout_s: float, kind: str) -> list[dict]:
    """Run an actor on the next account that still has credit; records the run's cost (also for failed or aborted
    runs). Raises ApifyError, also when today's budget (APIFY_DAILY_USD, UTC day) is used up."""
    if db.apify_spend_today() >= daily_budget_usd():
        raise ApifyError("apify daily budget used up")
    deadline = time.monotonic() + timeout_s
    exhausted = 0
    for idx, token in _accounts():
        started = time.monotonic()
        box: dict = {}

        def book(run: dict, items: int, outcome: str) -> None:
            costs.record("apify", kind, run.get("usageTotalUsd") or 0, 1, {
                "actor": actor.replace("~", "/"), "account": f"Konto {idx + 1}", "items": items, "outcome": outcome,
                "events": run.get("chargedEventCounts"), "duration_s": round(time.monotonic() - started, 1)})

        try:
            items, run = _run_on(token, actor, run_input, memory, max_charge, max_items, deadline, box)
        except _OutOfCredit:
            if box.get("run_id"):
                book(_settle(token, box["run_id"]), 0, "credit")
            exhausted += 1
            continue
        except Exception as exc:  # timeout, abort, failed run, network: the run may still have been charged
            if box.get("run_id"):
                book(_settle(token, box["run_id"]), 0, "failed")
            if isinstance(exc, httpx.HTTPError):
                raise ApifyError(f"apify unreachable: {type(exc).__name__}") from exc
            raise
        book(run, len(items), "ok")
        return items
    raise ApifyError(f"all {exhausted} apify accounts are out of credit")


# --- mapping to the internal format ---------------------------------------------------------


def _num(v) -> float | None:
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _offers_from(item: dict) -> list[dict]:
    out = []
    for i, o in enumerate((item.get("offers") or [])[:5]):
        price, total = _num(o.get("price")), _num(o.get("totalPrice"))
        base = price if price is not None else total
        shipping = round(total - price, 2) if price is not None and total is not None else None
        key, sid = quote(str(o.get("offerKey") or ""), safe=""), quote(str(o.get("shopId") or ""), safe="")
        # idealo's own links carry the price with two decimals ("122.30"), as the actor's leadoutUrl does
        link = f"https://www.idealo.de/relocator/relocate?offerKey={key}&price={base:.2f}&sid={sid}&type=offer&pos={i + 1}" if o.get("offerKey") and base is not None else None
        if _http(item.get("leadoutUrl")) and o.get("offerKey") and str(o["offerKey"]) in item["leadoutUrl"]:
            link = item["leadoutUrl"]  # the actor's own link for this offer, unchanged
        out.append({
            "merchant": o.get("shopName"),
            "price_eur": base,
            "shipping_eur": shipping,
            "delivery_estimate": o.get("deliveryTime"),
            "delivery_status": None,
            "free_return_days": None,
            "offer_url": link,
        })
    return out


def _http(url) -> str | None:
    return url if isinstance(url, str) and url.lower().startswith(("http://", "https://")) else None


def _in_stock(item: dict) -> bool | None:
    """From the actor's availability fields; None when it says nothing."""
    for k in ("inStock", "available", "isAvailable"):
        if isinstance(item.get(k), bool):
            return item[k]
    text = str(item.get("availability") or "").lower()
    if not text:
        return None
    if any(w in text for w in ("out of stock", "outofstock", "nicht verfügbar", "ausverkauft", "nicht lieferbar")):
        return False
    return True if any(w in text for w in ("instock", "in stock", "verfügbar", "lieferbar", "available")) else None


def _match_from(item: dict) -> dict:
    return {
        "productRef": str(item.get("productId")),
        "product_name": item.get("title"),
        "price_eur": _num(item.get("price")),
        "product_url": _http(item.get("url")),
        "image_url": _http(item.get("imageUrl")),
        "in_stock": _in_stock(item),
        "user_rating": item.get("rating"),
        "test_grade": item.get("testRating"),
        "offer_count": item.get("offerCount"),
        "bargain_discount_percent": None,
    }


def _history_from(item: dict) -> dict | None:
    points = [(p.get("x"), _num(p.get("y"))) for p in ((item.get("priceHistory") or {}).get("data") or [])]
    points = [(x, y) for x, y in points if x and y is not None]
    if not points:
        return None
    ys = [y for _, y in points]
    first, last = ys[0], ys[-1]
    lowest = min(points, key=lambda p: p[1])
    from datetime import date

    try:
        days = (date.fromisoformat(points[-1][0][:10]) - date.fromisoformat(points[0][0][:10])).days
    except ValueError:
        days = None
    return {
        "period_days": days,
        "current_eur": last,
        "lowest_eur": lowest[1],
        "highest_eur": max(ys),
        "average_eur": round(sum(ys) / len(ys), 2),
        "change_percent": round((last - first) / first * 100, 1) if first else None,
        "lowest_date": lowest[0][:10],
    }


def _cache_offers(match: dict, offers: list[dict]) -> None:
    with _offer_lock:
        if len(_offer_cache) >= 200:
            _offer_cache.pop(min(_offer_cache, key=lambda k: _offer_cache[k][0]))
        _offer_cache[match["productRef"]] = (time.monotonic(), {"url": match["product_url"], "offers": offers})


def _cached(ref: str) -> dict | None:
    with _offer_lock:
        hit = _offer_cache.get(ref)
        return hit[1] if hit and time.monotonic() - hit[0] < OFFER_CACHE_TTL_S else None


# --- the three operations (names as in the idealo MCP) -------------------------------------


def search_products(arguments: dict, timeout: float) -> list[dict]:
    max_price = (arguments.get("filters") or {}).get("maxPrice")
    items = run_actor(SEARCH_ACTOR, {"searchQuery": arguments["query"], "country": "DE", "maxItems": SEARCH_HITS,
                                     "fetchOffers": True}, memory=SEARCH_MEMORY_MB, max_charge=SEARCH_MAX_CHARGE_USD,
                      max_items=SEARCH_HITS, timeout_s=timeout, kind="search")
    matches = []
    for item in items[:SEARCH_HITS]:
        if not item.get("productId"):
            continue
        m = _match_from(item)
        if m["price_eur"] is None or (max_price and m["price_eur"] > max_price):
            continue
        _cache_offers(m, _offers_from(item))
        matches.append(m)
    return matches


def get_product_offers(arguments: dict, timeout: float) -> list[dict]:
    hit = _cached(str(arguments["productRef"]))
    return hit["offers"] if hit else []  # the search run already fetched them


def get_product_price_history(arguments: dict, timeout: float) -> dict | None:
    if not os.environ.get("APIFY_HISTORY"):
        return None  # a history run takes ~90 s and costs more than the search: off unless APIFY_HISTORY=1 (daily cron or batch use)
    ref = str(arguments["productRef"])
    hit = _cached(ref)
    run_input = {"productUrls": [hit["url"]]} if hit and hit.get("url") else {"productIds": [ref]}
    run_input |= {"country": "DE", "maxResults": 1, "maxOffersPerProduct": 1, "includePriceHistory": True,
                  "priceHistoryPeriod": os.environ.get("APIFY_HISTORY_PERIOD") or "1M"}
    items = run_actor(HISTORY_ACTOR, run_input, memory=HISTORY_MEMORY_MB, max_charge=HISTORY_MAX_CHARGE_USD,
                      max_items=1, timeout_s=timeout, kind="history")
    return _history_from(items[0]) if items else None


TOOLS = {"search_products": search_products, "get_product_offers": get_product_offers,
         "get_product_price_history": get_product_price_history}


# --- remaining credit -----------------------------------------------------------------------


def accounts_status() -> list[dict]:
    """Per account (Konto 1..n) used and remaining monthly USD; an unreachable account shows an error, never the token."""
    out = []
    for i, token in enumerate(tokens()):
        entry = {"account": f"Konto {i + 1}", "remaining_usd": None, "used_usd": None, "limit_usd": None}
        try:
            r = httpx.get(f"{API}/users/me/limits", headers=_auth(token), timeout=10)
            r.raise_for_status()
            d = r.json()["data"]
            limit, used = d["limits"]["maxMonthlyUsageUsd"], d["current"]["monthlyUsageUsd"]
            entry |= {"limit_usd": limit, "used_usd": round(used, 4), "remaining_usd": round(limit - used, 4)}
        except Exception as exc:
            entry["error"] = type(exc).__name__
        out.append(entry)
    return out
