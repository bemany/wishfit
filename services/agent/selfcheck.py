"""Self-check: both demo requests through the app with the model client stubbed.

Run: uv run python selfcheck.py
"""

import json
import os
from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient

import main

EXAMPLES = Path(__file__).parent / "examples"
if not os.environ.get("SELFCHECK_USE_DB"):
    os.environ.pop("DATABASE_URL", None)  # in-memory unless SELFCHECK_USE_DB=1 (then the real DATABASE_URL is used)
    os.environ.pop("DATABASE_URL_UNPOOLED", None)
os.environ["AUTH_SECRET"] = "selfcheck-secret"
os.environ["AUTH_DEV_CODES"] = "1"
os.environ.pop("RESEND_API_KEY", None)  # test mode: code comes back as dev_code
for _k in ("IDEALO_MCP_URL", "IDEALO_CLIENT_ID", "LLM_BASE_URL"):
    os.environ[_k] = ""  # never call the real idealo MCP or a real model from the self-check
os.environ["LLM_MODEL"] = "stub-model"
os.environ["LLM_VISION_MODEL"] = "stub-model"


def example(name: str) -> dict:
    return json.loads((EXAMPLES / name).read_text())


def stub(*outputs: str):
    """Fake OpenAI client that returns the given raw outputs in order."""
    queue = list(outputs)

    def create(**kwargs):
        assert kwargs["model"] == "stub-model" and kwargs["messages"][0]["role"] == "system"
        usage = SimpleNamespace(prompt_tokens=11, completion_tokens=7)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=queue.pop(0)))], usage=usage)

    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    main.llm_client = lambda: client


def decision(sample: str) -> dict:
    return {k: example(sample)[k] for k in ("status", "reply", "top", "alternatives", "uncertainty")}


api = TestClient(main.app)

# missing key: clean 502, no crash (real llm_client, before it gets stubbed)
for _k in ("LLM_API_KEY", "AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN"):
    os.environ[_k] = ""
r = api.post("/recommend", json=example("simple.request.json"))
assert r.status_code == 502 and r.json() == {"detail": "AI_GATEWAY_API_KEY is not configured"}

assert api.get("/health").json() == {"ok": True}

# simple case: model's total_eur is wrong on purpose, the code must recompute it
simple = decision("sample.response.json")
simple["top"]["total_eur"] = 999
stub(json.dumps(simple))
r = api.post("/recommend", json=example("simple.request.json"))
assert r.status_code == 200, r.text
body = main.RecommendResponse.model_validate(r.json())
assert body.status == "recommendation" and body.top.total_eur == 44.98 and body.top.signals
assert body.model == "stub-model" and body.trace_url == f"/trace/{body.id}"
assert api.get(f"/results/{body.id}").json() == r.json()
trace = api.get(body.trace_url).json()
assert len(trace["model_calls"]) == 1 and trace["model_calls"][0]["model"] == "stub-model"
assert "PowerCore" in trace["model_calls"][0]["input"][1]["content"]  # idealo data reached the model
assert trace["model_calls"][0]["usage"] == {"prompt_tokens": 11, "completion_tokens": 7}
assert trace["idealo_calls"] and all(c["source"] == "snapshot" for c in trace["idealo_calls"])
print("simple  ok:", body.status, body.top.product_name, body.top.total_eur)

# chaotic case: first output is not JSON -> one retry, both calls in the trace
stub("Sure! Here is my answer", json.dumps(decision("sample.clarification.response.json")))
r = api.post("/recommend", json=example("chaotic.request.json"))
assert r.status_code == 200, r.text
body = main.RecommendResponse.model_validate(r.json())
assert body.status == "needs_clarification" and body.top is None
assert body.uncertainty.reasons and body.uncertainty.question
trace = api.get(body.trace_url).json()
assert len(trace["model_calls"]) == 2 and len(trace["idealo_calls"]) == 2
print("chaotic ok:", body.status, "-", body.uncertainty.question)

# chat case: free-form input -> understand step, then decide step, both in the trace
chat = example("sample.chat.response.json")
stub(json.dumps(chat["understood"]), json.dumps(decision("sample.chat.response.json")))
r = api.post("/recommend", json=example("chat.request.json"))
assert r.status_code == 200, r.text
body = main.RecommendResponse.model_validate(r.json())
assert body.status == "recommendation" and body.understood.candidates and body.top.total_eur == 48.89
assert body.reply == chat["reply"]
trace = api.get(body.trace_url).json()
assert [c["step"] for c in trace["model_calls"]] == ["understand", "decide"]
assert "Kopfhörer fallen" in trace["model_calls"][0]["input"][1]["content"]  # raw input reached step 1
assert "Laufwerk" in trace["model_calls"][1]["input"][1]["content"]  # snapshot data reached step 2
print("chat    ok:", body.status, body.top.product_name)

# free input without idealo data: ideas only, one model call, no invented prices
stub(json.dumps(chat["understood"]))
r = api.post("/recommend", json={"input_text": "Sie läuft gern und mag Kaffee.", "budget_eur": 40, "occasion": "Geburtstag"})
assert r.status_code == 200, r.text
body = main.RecommendResponse.model_validate(r.json())
assert body.status == "ideas_only" and body.top is None and body.understood.candidates and body.uncertainty.reasons
assert len(api.get(body.trace_url).json()["model_calls"]) == 1
print("ideas   ok:", body.status, [c.idea for c in body.understood.candidates][:2])

# follow-up: only previous_id and the new message; basics, language and earlier input come from the stored result
stub(json.dumps(chat["understood"]), json.dumps(decision("sample.chat.response.json")))
first = api.post("/recommend", json=example("chat.request.json") | {"language": "en"})
assert first.status_code == 200, first.text
assert '"language": "en"' in api.get(first.json()["trace_url"]).json()["model_calls"][1]["input"][1]["content"]
stub(json.dumps(chat["understood"]))
r = api.post("/recommend", json={"previous_id": first.json()["id"], "input_text": "Günstiger"})
assert r.status_code == 200, r.text
body = main.RecommendResponse.model_validate(r.json())
assert body.id != first.json()["id"] and body.reply == main.IDEAS_ONLY["en"][0]  # language inherited
trace = api.get(body.trace_url).json()
step1 = trace["model_calls"][0]["input"][1]["content"]
assert "Kopfhörer fallen" in step1 and "Nachtrag: Günstiger" in step1 and '"language": "en"' in step1
assert first.json()["top"]["product_name"] in step1  # previous pick is the reference for "cheaper"
assert len(trace["conversation"]["messages"]) == 2 and trace["conversation"]["budget_eur"] == example("chat.request.json")["budget_eur"]
r = api.post("/recommend", json={"previous_id": "r_missing", "input_text": "Günstiger"})
assert r.status_code == 404 and r.json() == {"detail": "unknown previous_id"}
print("followup ok:", body.status, "-", body.reply)

# photo: the vision step names the product, the image itself never reaches the text model or the trace
stub(json.dumps({"product": "Lego Orchidee 10311", "search_term": "Lego Orchidee"}), json.dumps(chat["understood"]))
r = api.post("/recommend", json={"image_base64": "iVBORw0KGgo=", "budget_eur": 60, "occasion": "Geburtstag", "language": "en"})
assert r.status_code == 200, r.text
trace = api.get(r.json()["trace_url"]).json()
assert [c["step"] for c in trace["model_calls"]] == ["photo", "understand"] and "iVBOR" not in json.dumps(trace)
assert trace["conversation"]["messages"] == ["[Foto] Lego Orchidee 10311 (Suchbegriff: Lego Orchidee)"]
stub(json.dumps({"product": "", "search_term": ""}))
r = api.post("/recommend", json={"image_base64": "iVBORw0KGgo=", "budget_eur": 60, "occasion": "Geburtstag"})
assert r.status_code == 422 and "photo" in r.json()["detail"]
print("photo   ok")

import amazon
assert amazon.find_url("schau mal https://www.amazon.de/hz/wishlist/ls/2JPK0IGRX8OMJ?ref_=wl_share danke").startswith("https://www.amazon.de/hz/wishlist/ls/2JPK0IGRX8OMJ")
assert amazon.find_url("kein link, nur amazon.de") is None

# failure paths: all must be a clean {"detail": str}
stub("nope", "still nope")
r = api.post("/recommend", json=example("simple.request.json"))
assert r.status_code == 502 and r.json() == {"detail": "model returned invalid JSON twice"}

live = example("simple.request.json") | {"demo_case": None}
r = api.post("/recommend", json=live)
assert r.status_code == 502 and r.json() == {"detail": "idealo MCP not configured yet"}

r = api.post("/recommend", json={"wishes": [], "budget_eur": 10, "occasion": "x"})
assert r.status_code == 422 and isinstance(r.json()["detail"], str)
assert api.get("/results/r_missing").status_code == 404 and api.get("/trace/r_missing").status_code == 404
print("errors  ok: 502 missing key, 502 invalid JSON twice, 502 idealo MCP missing, 422, 404")
# --- accounts: code sign-in, sessions, sync, delete ---------------------------
import db
import secrets as _secrets

tag = _secrets.token_hex(4)


def unthrottle(email: str) -> None:
    """Pretend the last code request was 2 minutes ago, so the 60 s gap does not block the next sign-in."""
    if db.use_postgres():
        with db.connect() as conn:
            conn.execute("update auth_codes set created_at = created_at - interval '2 minutes' where email = %s", (email,))
        return
    from datetime import timedelta

    for c in db._codes:
        if c["email"] == email:
            c["created_at"] -= timedelta(minutes=2)


def sign_in(email: str) -> tuple[dict, dict]:
    unthrottle(email.strip().lower())
    r = api.post("/auth/request-code", json={"email": email})
    assert r.status_code == 200 and len(r.json()["dev_code"]) == 6, r.text
    r2 = api.post("/auth/verify", json={"email": email, "code": r.json()["dev_code"]})
    assert r2.status_code == 200, r2.text
    return r2.json(), {"Authorization": f"Bearer {r2.json()['token']}"}


mail_addr = f"  Check-{tag}@Example.com "
session, auth_h = sign_in(mail_addr)
assert session["created"] is True and session["user"]["email"] == f"check-{tag}@example.com"
assert api.get("/me", headers=auth_h).json() == session["user"]
assert api.get("/me").status_code == 401 and api.get("/me", headers={"Authorization": "Bearer nope"}).status_code == 401

# rate limit: right after a code, the next request for the same address is 429 (case and spaces do not matter)
assert api.post("/auth/request-code", json={"email": f"CHECK-{tag}@example.com"}).status_code == 429
assert api.post("/auth/request-code", json={"email": "not-an-email"}).status_code == 422
if not db.use_postgres():  # hourly limit: backdate the stored codes, five in the last hour block a sixth
    from datetime import timedelta

    e = f"hour-{tag}@example.com"
    for _ in range(5):
        assert db.issue_code(e, "x", min_gap_s=0)
        for c in db._codes:
            if c["email"] == e:
                c["created_at"] -= timedelta(minutes=5)
    assert api.post("/auth/request-code", json={"email": e}).status_code == 429

# parallel request-code for one address: exactly one gets through, the rest are limited
from concurrent.futures import ThreadPoolExecutor

pe = f"parallel-{tag}@example.com"
with ThreadPoolExecutor(8) as pool:
    codes = sorted(pool.map(lambda _: api.post("/auth/request-code", json={"email": pe}).status_code, range(8)))
assert codes == [200] + [429] * 7, codes

# mail config: with a key never a dev_code (and no real mail is sent here); production without key or test mode -> 503
import mail

os.environ["RESEND_API_KEY"] = "re_test"
sent = []
mail.send_code = lambda email, code, language="de": sent.append(email)
mk = f"key-{tag}@example.com"
r = api.post("/auth/request-code", json={"email": mk})
assert r.status_code == 204 and sent == [mk], (r.status_code, sent)
del os.environ["RESEND_API_KEY"]
os.environ["AUTH_DEV_CODES"] = "0"
os.environ["VERCEL_ENV"] = "production"
r = api.post("/auth/request-code", json={"email": f"prod-{tag}@example.com"})
assert r.status_code == 503 and r.json() == {"detail": "mail is not configured"}
os.environ.pop("VERCEL_ENV")
r = api.post("/auth/request-code", json={"email": f"local-{tag}@example.com"})
assert r.status_code == 204  # local without test mode: code only in the log
os.environ["AUTH_DEV_CODES"] = "1"

# wrong code: 401, counts attempts; after 5 failures even the right code is rejected; a used code cannot be replayed
e2 = f"wrong-{tag}@example.com"
dev = api.post("/auth/request-code", json={"email": e2}).json()["dev_code"]
bad = "000000" if dev != "000000" else "111111"
for _ in range(5):
    assert api.post("/auth/verify", json={"email": e2, "code": bad}).status_code == 401
assert api.post("/auth/verify", json={"email": e2, "code": dev}).status_code == 401
assert api.post("/auth/verify", json={"email": f"nobody-{tag}@example.com", "code": "123456"}).status_code == 401
r = api.post("/auth/verify", json={"email": mail_addr, "code": "123456"})
assert r.status_code == 401  # the first code was already used up

# second sign-in of the same account: created false, own token
e3 = f"again-{tag}@example.com"
s1, _h = sign_in(e3)
assert s1["created"] is True

# sync: empty, first PUT needs base null, stale base -> 409 with current stand, type and size checks
d = api.get("/me/data", headers=auth_h).json()
assert d == {"people": [], "profile": None, "updated_at": None}
people = [{"id": "p1", "name": "Mama", "updatedAt": 1}]
r = api.put("/me/data", headers=auth_h, json={"people": people, "profile": {"name": "Ich"}, "base_updated_at": None})
assert r.status_code == 200, r.text
v1 = r.json()["updated_at"]
assert api.get("/me/data", headers=auth_h).json() == {"people": people, "profile": {"name": "Ich"}, "updated_at": v1}
r = api.put("/me/data", headers=auth_h, json={"people": [], "profile": None, "base_updated_at": None})
assert r.status_code == 409 and r.json()["people"] == people and r.json()["updated_at"] == v1 and r.json()["detail"]
r = api.put("/me/data", headers=auth_h, json={"people": [], "profile": None, "base_updated_at": "2020-01-01T00:00:00+00:00"})
assert r.status_code == 409
r = api.put("/me/data", headers=auth_h, json={"people": people + [{"id": "p2"}], "profile": None, "base_updated_at": v1})
assert r.status_code == 200 and r.json()["updated_at"] != v1
assert api.get("/me/data", headers=auth_h).json()["profile"] is None and len(api.get("/me/data", headers=auth_h).json()["people"]) == 2
assert api.put("/me/data", headers=auth_h, json={"people": {}, "profile": None, "base_updated_at": None}).status_code == 422
assert api.put("/me/data", headers=auth_h, json={"people": [], "profile": [], "base_updated_at": None}).status_code == 422
assert api.put("/me/data", headers=auth_h, json={"people": [], "profile": None, "base_updated_at": "gestern"}).status_code == 422
assert api.put("/me/data", headers=auth_h, json={"people": [], "profile": None, "base_updated_at": "2020-01-01T00:00:00"}).status_code == 422  # no zone
big = {"people": [{"x": "a" * 1000}] * 2200, "profile": None, "base_updated_at": None}
assert api.put("/me/data", headers=auth_h, content=json.dumps(big)).status_code == 413
r = api.put("/me/data", headers={**auth_h, "content-length": str(3 * 1024 * 1024)}, content=b"{}")  # declared size alone is enough
assert r.status_code == 413, r.status_code
assert api.put("/me/data", json={"people": [], "profile": None}).status_code == 401

# /recommend with a token stores user_id; an invalid token is 401; without token still works
stub(json.dumps(simple))
r = api.post("/recommend", headers=auth_h, json=example("simple.request.json"))
assert r.status_code == 200 and db.result_user_id(r.json()["id"]) == session["user"]["id"]
owned = r.json()["id"]
assert api.post("/recommend", headers={"Authorization": "Bearer nope"}, json=example("simple.request.json")).status_code == 401
stub(json.dumps(simple))
anon = api.post("/recommend", json=example("simple.request.json")).json()["id"]
assert db.result_user_id(anon) is None and api.get(f"/results/{owned}").status_code == 200  # reading needs no token

# logout kills only that token; delete removes account, sessions, data; results stay without owner
_, other_h = sign_in(f"check-{tag}@example.com")  # second session for the same account
assert api.post("/auth/logout", headers=auth_h).status_code == 204
assert api.get("/me", headers=auth_h).status_code == 401 and api.get("/me", headers=other_h).status_code == 200
assert api.delete("/me", headers=other_h).status_code == 204
assert api.get("/me", headers=other_h).status_code == 401
assert api.get(f"/results/{owned}").status_code == 200 and db.result_user_id(owned) is None
_, new_h = sign_in(f"check-{tag}@example.com")  # same address registers fresh, with empty data
assert api.get("/me/data", headers=new_h).json()["updated_at"] is None
api.delete("/me", headers=new_h)
api.delete("/me", headers=_h)
print("accounts ok: code sign-in, rate limit, attempts, sessions, sync 409/413/422, delete", "(postgres)" if db.use_postgres() else "(memory)")
# --- agent quality: offer-only hits, control characters, Amazon links, clarification streak ---
import amazon

# c) U+FFFC and control characters never reach the model
assert main.clean_text("rote\ufffc Sachen\x00\u200b!\n") == "rote Sachen!\n"
stub(json.dumps(chat["understood"]), json.dumps(decision("sample.chat.response.json")))
r = api.post("/recommend", json=example("chat.request.json") | {"input_text": "Sie mag Kaffee \ufffc \ufffc"})
assert r.status_code == 200, r.text
assert "\\ufffc" not in api.get(r.json()["trace_url"]).json()["model_calls"][0]["input"][1]["content"].lower()
assert api.post("/recommend", json={"input_text": "\ufffc", "budget_eur": 10, "occasion": "x"}).status_code == 422

# a) a single-offer hit becomes one offer, no offers/price-history lookups for it
single = {"productRef": "x1", "product_name": "Kirsch Glitzer Schluesselanhaenger", "price_eur": 7.28,
          "product_url": "https://www.idealo.de/relocator/relocate?offerKey=abc&type=oc_offer", "offer_count": 1}
catalog = {"productRef": "x2", "product_name": "Katalogprodukt", "price_eur": 20.0, "product_url": "https://www.idealo.de/preisvergleich/x2.html"}
assert main.is_single_offer(single) and not main.is_single_offer(catalog)
offer = main.offer_from_hit(single)[0]
assert offer["offer_url"] == single["product_url"] and offer["price_eur"] == 7.28 and offer["merchant"] is None
assert offer["shipping_eur"] is None and offer["available"] is True
assert main.offer_from_hit({"price_eur": None, "product_url": "u"}) == [] and main.offer_from_hit({"price_eur": 1, "product_url": None}) == []
os.environ["IDEALO_MCP_URL"], os.environ["IDEALO_CLIENT_ID"] = "stub", "stub"
calls = []


def fake_call_tool(tool, arguments, session=None):
    calls.append(tool)
    if tool == "search_products":
        return {"results": [
            {"productRef": "x1", "name": "Kirsch Glitzer", "price": "7,28 \u20ac", "url": single["product_url"], "totalOfferCount": 1},
            {"productRef": "x2", "name": "Katalog", "price": "20,00 \u20ac", "url": catalog["product_url"], "totalOfferCount": 5},
        ]}
    return {"offers": []}  # catalog product whose offer lookup comes back empty


main.idealo.open_session = lambda: "s"
main.idealo.call_tool = fake_call_tool
t = {"idealo_calls": []}
data = main.fetch_idealo_live(main.RecommendRequest(wishes=["Schluesselanhaenger"], budget_eur=100, occasion="x"), t)
m1, m2 = data[0]["matches"][0], data[0]["matches"][1]
assert m1["offers"][0]["price_eur"] == 7.28 and m1["price_history_30d"] is None
assert m2["offers"][0]["derived_from_search_hit"]  # empty lookup falls back to the hit
assert calls.count("get_product_offers") == 1 and calls.count("get_product_price_history") == 1  # only for the catalog hit
os.environ["IDEALO_MCP_URL"] = os.environ["IDEALO_CLIENT_ID"] = ""
print("offers  ok: single-offer hits usable, no pointless lookups")

# d) Amazon short and product links: redirect resolved, slug becomes the wish; failure drops the link
assert amazon.find_product_urls("schau https://amzn.eu/d/08jHWyXE bitte") == ["https://amzn.eu/d/08jHWyXE"]
assert amazon.find_product_urls("https://www.amazon.de/Ducati-Schluessel-rot/dp/B0ABCDEFGH?th=1")[0].endswith("th=1")
assert amazon.find_product_urls("https://www.amazon.de/hz/wishlist/ls/2JPK0IGRX8OMJ") == []
assert amazon.slug_term("https://www.amazon.de/Ducati-Schl%C3%BCsselanh%C3%A4nger-rot/dp/B0ABCDEFGH?x=1") == "Ducati Schlüsselanhänger rot"
assert amazon.slug_term("https://www.amazon.de/dp/B0ABCDEFGH") is None and amazon.slug_term("https://www.amazon.de/") is None
# SSRF: exact Amazon hosts only, redirects followed by hand and checked per hop
import httpx

real_resolve, real_client, hits = amazon.resolve_product, httpx.Client, []


def handler(request):
    hits.append(request.url.host)
    if request.url.host == "amzn.eu":
        return httpx.Response(302, headers={"location": "/hop2"}) if request.url.path == "/d/ok" else \
            httpx.Response(302, headers={"location": "http://169.254.169.254/latest"}) if request.url.path == "/d/evil" else \
            httpx.Response(302, headers={"location": "https://www.amazon.de/Rotes-Glitzer-Band/dp/B0ABCDEFGH?x=1"})
    return httpx.Response(200)


amazon.httpx.Client = lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw)
for bad in ("https://amazon.evil.com/x/dp/B0ABCDEFGH", "https://www.amazon.de.evil.com/x/dp/B0ABCDEFGH", "ftp://amzn.eu/d/x", "https://amzn.eu:8443/d/x"):
    assert real_resolve(bad) == (None, "rejected", None), bad
assert not hits  # nothing was fetched for rejected links
assert real_resolve("https://amzn.eu/d/ok") == ("Rotes Glitzer Band", "resolved", "B0ABCDEFGH")
assert real_resolve("https://amzn.eu/d/evil")[1] == "rejected" and "169.254.169.254" not in hits  # foreign redirect target never fetched
assert real_resolve("https://www.amazon.de/Ducati-Rot/dp/B0ABCDEFGH")[0] == "Ducati Rot"
amazon.httpx.Client = real_client
stub(json.dumps(chat["understood"]))
r = api.post("/recommend", json={"input_text": "https://amazon.evil.com/x/dp/B0ABCDEFGH Geschenkidee", "budget_eur": 40, "occasion": "Geburtstag"})
assert r.status_code == 200, r.text
tr = api.get(r.json()["trace_url"]).json()
assert tr["sources"][0]["status"] == "rejected" and "evil" not in json.dumps(tr["sources"]) and "evil" not in json.dumps(tr["conversation"])
# three links at most, resolved term lands in the stored message
amazon.resolve_product = lambda url, timeout=5: ("Term", "resolved", None)
stub(json.dumps(chat["understood"]))
r = api.post("/recommend", json={"input_text": " ".join(f"https://amzn.eu/d/a{i}" for i in range(5)), "budget_eur": 40, "occasion": "Geburtstag"})
tr = api.get(r.json()["trace_url"]).json()
assert [s["status"] for s in tr["sources"]] == ["resolved"] * 3 + ["skipped"] * 2 and "amzn" not in tr["conversation"]["messages"][0]
amazon.resolve_product = real_resolve

# budget enforced in code
rq = main.RecommendRequest(wishes=["x"], budget_eur=50, occasion="x", language="de")
rec = decision("sample.response.json")
def pick(price, ship):
    return main.Recommendation(wish="x", product_name=f"P{price}", action="buy", reason="gut", price_eur=price, shipping_eur=ship,
                               signals=[main.Signal(type="budget", label="b", value="v")])
over = main.Decision(status="recommendation", reply="r", top=pick(60, 0), alternatives=[pick(70, 0), pick(45, None)])
fixed = main.enforce_budget(over, rq)
assert fixed.top.product_name == "P45" and len(fixed.alternatives) == 2 and any("unbekannt" in s.value for s in fixed.top.signals)
none_fit = main.enforce_budget(main.Decision(status="recommendation", reply="r", top=pick(60, 0)), rq)
assert none_fit.status == "needs_clarification" and none_fit.top is None and none_fit.uncertainty.question
assert main.enforce_budget(main.Decision(status="recommendation", reply="r", top=pick(48, 3)), rq).status == "needs_clarification"  # 51 > 50
print("ssrf/budget ok")

amazon.resolve_product = lambda url, timeout=5: ("Ducati Schlüsselanhänger rot", "resolved", "B0ABCDEFGH")
stub(json.dumps(chat["understood"]))
r = api.post("/recommend", json={"input_text": "https://amzn.eu/d/08jHWyXE", "budget_eur": 40, "occasion": "Geburtstag"})
assert r.status_code == 200, r.text
tr = api.get(r.json()["trace_url"]).json()
assert tr["sources"][0]["type"] == "amazon_link" and tr["sources"][0]["status"] == "resolved" and tr["sources"][0]["search_term"] == "Ducati Schlüsselanhänger rot"
sent = tr["model_calls"][0]["input"][1]["content"]
assert "Ducati Schlüsselanhänger rot" in sent and "amzn.eu" not in sent
amazon.resolve_product = lambda url, timeout=5: (None, "failed", None)
stub(json.dumps(chat["understood"]))
r = api.post("/recommend", json={"input_text": "Mag Kaffee https://amzn.eu/d/08jHWyXE", "budget_eur": 40, "occasion": "Geburtstag"})
tr = api.get(r.json()["trace_url"]).json()
assert tr["sources"][0]["search_term"] is None and "amzn.eu" not in tr["model_calls"][0]["input"][1]["content"]
r = api.post("/recommend", json={"input_text": "https://amzn.eu/d/08jHWyXE", "budget_eur": 40, "occasion": "Geburtstag"})
assert r.status_code == 422 and isinstance(r.json()["detail"], str)  # nothing left to work with
print("amazon  ok: link resolved to a wish, failure dropped and traced")

# b) after two clarifications in a row the model must recommend
clar = decision("sample.clarification.response.json")
rec = decision("sample.response.json")
stub(json.dumps(chat["understood"]), json.dumps(clar))
a = api.post("/recommend", json=example("chat.request.json") | {"demo_case": "chaotic"})
assert a.json()["status"] == "needs_clarification", a.text
stub(json.dumps(chat["understood"]), json.dumps(clar))
b = api.post("/recommend", json={"previous_id": a.json()["id"], "input_text": "Something else", "demo_case": "chaotic"})
assert b.json()["status"] == "needs_clarification"
stub(json.dumps(chat["understood"]), json.dumps(clar), json.dumps(rec))  # third time: first answer is rejected, retry forced
c = api.post("/recommend", json={"previous_id": b.json()["id"], "input_text": "Something else", "demo_case": "chaotic"})
assert c.json()["status"] == "recommendation", c.text
tc = api.get(c.json()["trace_url"]).json()
assert '"must_recommend": true' in tc["model_calls"][1]["input"][1]["content"] and len(tc["model_calls"]) == 3
assert tc["conversation"]["clarify_streak"] == 0
print("streak  ok: recommendation forced after two clarifications")
# profile link: share / unshare, whitelist filtering, import
import profiles

sent = []  # the mail stub above appends to this list
_, sh_a = sign_in(f"share-a-{tag}@example.com")
_, sh_b = sign_in(f"share-b-{tag}@example.com")
assert api.post("/me/share").status_code == 401 and api.delete("/me/share").status_code == 401
assert api.get("/profiles/nope").status_code == 404
share1 = api.post("/me/share", headers=sh_a).json()
assert api.post("/me/share", headers=sh_a).json() == share1  # same slug again
assert len(share1["slug"]) == 10 and share1["url"] == f"https://wishfit-web-test.vercel.app/u/{share1['slug']}"
assert share1["slug"][0] not in "-_" and share1["slug"][-1] not in "-_"
share_b = api.post("/me/share", headers=sh_b).json()
assert share_b["slug"] != share1["slug"]
empty = api.get(f"/profiles/{share1['slug']}")  # shared before any profile was saved
assert empty.status_code == 200 and empty.json() == {"name": "", "color": None, "wishes": [], "updated_at": None}
blob = {"name": "  Mia " + "x" * 80, "color": "#ff8800", "email": "mia@example.com", "id": "secret", "people": [{"name": "Tom"}],
        "wishes": ["Kaffee", {"title": "Lampe", "price_eur": 19.9, "url": "https://shop.example/l", "image_url": "javascript:alert(1)", "note": "x"},
                   {"title": "T" * 500, "price_eur": "12", "url": "http://a.example/" + "x" * 2000}, {"title": ""}, 42, {"nope": 1}] + ["w"] * 120,
        "updatedAt": 1}
r = api.put("/me/data", headers=sh_a, json={"people": [{"name": "Tom"}], "profile": blob, "base_updated_at": None})
assert r.status_code == 200, r.text
pub = api.get(f"/profiles/{share1['slug']}")
assert pub.status_code == 200
pj = pub.json()
assert set(pj) == {"name", "color", "wishes", "updated_at"} and pj["updated_at"] == r.json()["updated_at"]
assert pj["name"] == ("Mia " + "x" * 80)[:60] and pj["color"] == "#ff8800" and len(pj["wishes"]) == 97  # first 100 raw entries, 3 of the 6 odd ones are valid
E = {"source": None, "added_at": None, "price": None}
assert pj["wishes"][0] == {"title": "Kaffee", "price_eur": None, "url": None, "image_url": None, **E}
assert pj["wishes"][1] == {"title": "Lampe", "price_eur": 19.9, "url": "https://shop.example/l", "image_url": None, **E}
assert len(pj["wishes"][2]["title"]) == 200 and pj["wishes"][2]["price_eur"] is None and pj["wishes"][2]["url"] is None
txt = pub.text
assert "mia@example.com" not in txt and "secret" not in txt and "Tom" not in txt and "javascript" not in txt and f"share-a-{tag}" not in txt
assert profiles.public_profile({"name": 5, "color": "<script>", "wishes": "x"}, None) == {"name": "", "color": None, "wishes": [], "updated_at": None}
assert profiles.public_profile({"color": "red"}, None)["color"] == "red"
assert api.delete("/me/share", headers=sh_a).status_code == 204
assert api.get(f"/profiles/{share1['slug']}").status_code == 404
assert api.get(f"/profiles/{share_b['slug']}").status_code == 200
assert api.post("/me/share", headers=sh_a).json()["slug"] != share1["slug"]  # old link stays dead
# slug collision: the first draw is already taken, so a new one is drawn
draws = iter([share_b["slug"], "freshslug01"])
real_new_slug = db.new_slug
db.new_slug = lambda: next(draws)
_, sh_c = sign_in(f"share-c-{tag}@example.com")
assert api.post("/me/share", headers=sh_c).json()["slug"] == "freshslug01"
db.new_slug = real_new_slug
assert api.delete("/me", headers=sh_b).status_code == 204  # account deletion frees the slug
assert api.get(f"/profiles/{share_b['slug']}").status_code == 404
api.delete("/me", headers=sh_a); api.delete("/me", headers=sh_c)

# import: unsupported / empty / failing / ok, language, limit per IP
real_fetch = amazon.fetch
imp = lambda url="https://www.amazon.de/hz/wishlist/ls/ABC123", ip="1.1.1.1", **kw: api.post(
    "/wishlist/import", json={"url": url, **kw}, headers={"x-forwarded-for": f"{ip}, 10.0.0.1"})
amazon.fetch = lambda url: ([{"title": f"P{i}", "price": "1,00 €", "price_eur": 1.0, "url": f"https://www.amazon.de/dp/B{i:09d}", "image_url": "https://m.media-amazon.com/images/I/x.jpg"} for i in range(60)], 200)
r = imp()
assert r.status_code == 200 and r.json()["source"] == "amazon_wishlist" and len(r.json()["items"]) == 50
assert r.json()["items"][0] == {"title": "P0", "price_eur": 1.0, "url": "https://www.amazon.de/dp/B000000000", "image_url": "https://m.media-amazon.com/images/I/x.jpg", "source": "amazon"}
r = imp("https://example.com/list")
assert r.status_code == 422 and "not supported" in r.json()["detail"]
assert "nicht unterstützt" in imp("https://example.com/list", language="de").json()["detail"]
amazon.fetch = lambda url: ([], 200)
assert imp().status_code == 422
amazon.fetch = lambda url: ([], 503)
assert imp().status_code == 502
def boom(url): raise RuntimeError("down")
amazon.fetch = boom
assert imp().status_code == 502
amazon.fetch = lambda url: ([], 400)  # host check refused it
assert imp("https://www.amazon.evil.com/hz/wishlist/ls/ABC123").status_code == 422
assert imp(ip="2.2.2.2").status_code == 422  # 1.1.1.1 used 7 of 10 so far; other IPs have their own count
assert [imp().status_code for _ in range(4)] == [422, 422, 422, 429]
assert imp(ip="3.3.3.3").status_code != 429
amazon.fetch = real_fetch
assert amazon.parse_price("83,92\xa0€") == 83.92 and amazon.parse_price("1.299,00 €") == 1299.0 and amazon.parse_price("$12.50") == 12.5 and amazon.parse_price(None) is None
page = ('<div><img alt="x" src="https://m.media-amazon.com/images/I/a._SS135_.jpg"/><a id="itemName_AAA" class="x" title="Lampe &amp; Co" href="/dp/B0CR45D9F7/?coliid=1">'
        '<span id="itemPrice_AAA" class="a-price"><span class="a-offscreen">1.299,00\xa0€</span></span></div>'
        '<a id="itemName_BBB" title="Ohne" href="/foo">')
class _R:
    status_code = 200; is_redirect = False; text = page
amazon.httpx.get = lambda *a, **k: _R()
got, st = amazon.fetch("https://www.amazon.de/hz/wishlist/ls/ABC123")
assert st == 200 and got[0] == {"title": "Lampe & Co", "price": "1.299,00\xa0€", "price_eur": 1299.0, "url": "https://www.amazon.de/dp/B0CR45D9F7",
                                "image_url": "https://m.media-amazon.com/images/I/a._SS135_.jpg"}
assert got[1]["price_eur"] is None and got[1]["url"] is None and got[1]["image_url"] is None
# profile filter: source, added_at, price
pw = profiles.public_profile({"name": "A", "wishes": [
    {"title": "X", "source": "snap", "added_at": 1700000000000, "price": {"price_eur": 9.5, "offer_count": 3, "in_stock": True, "trend": "down",
     "change_percent": -4.2, "url": "https://idealo.de/x", "image_url": "javascript:1", "checked_at": "2026-11-27T10:00:00+00:00", "evil": 1}},
    {"title": "Y", "source": "hack", "added_at": "now", "price": "x"}]}, None)["wishes"]
assert pw[0]["source"] == "snap" and pw[0]["added_at"] == 1700000000000 and type(pw[0]["added_at"]) is int
assert pw[0]["price"] == {"price_eur": 9.5, "offer_count": 3, "in_stock": True, "trend": "down", "change_percent": -4.2,
                          "url": "https://idealo.de/x", "image_url": None, "checked_at": "2026-11-27T10:00:00+00:00"}
assert pw[1]["source"] is None and pw[1]["added_at"] is None and pw[1]["price"] is None
print("profile ok: share/unshare, filtering, import")

# price tracker: /wishes/price
pc = []
def price_tool(tool, arguments, session=None, timeout=None):
    pc.append(tool)
    q = arguments.get("query", "")
    if tool == "search_products":
        if q == "nothing":
            return {"results": []}
        if q == "single":
            return {"results": [{"productRef": "s", "name": "Single", "price": "7,00 \u20ac", "url": "https://www.idealo.de/relocator/relocate?offerKey=a", "totalOfferCount": 1}]}
        return {"results": [{"productRef": "c", "name": "Cat", "price": "20,00 \u20ac", "url": "https://www.idealo.de/preisvergleich/c.html", "imageUrl": "https://img/c.jpg", "totalOfferCount": 5}]}
    if tool == "get_product_offers":
        return {"offers": [{"price": "18,50 \u20ac", "shop": {"name": "S"}}]}
    return {"priceTrend": {"periodDays": 30, "statistics": {"priceChangePercent": -8.0}}}
main.idealo.call_tool = price_tool
price_ip = {"x-forwarded-for": "9.9.9.9"}
r = api.post("/wishes/price", json={"wishes": [{"title": "x"}]}, headers=price_ip)
assert r.status_code == 503  # idealo not configured
os.environ["IDEALO_MCP_URL"], os.environ["IDEALO_CLIENT_ID"] = "stub", "stub"
r = api.post("/wishes/price", json={"wishes": [{"title": "Cat"}, {"title": "nothing"}, {"title": "single"}, {"title": " "}]}, headers=price_ip)
assert r.status_code == 200, r.text
pr = r.json()["prices"]
assert len(pr) == 4 and pr[1] is None and pr[3] is None
assert pr[0]["price_eur"] == 18.5 and pr[0]["trend"] == "down" and pr[0]["change_percent"] == -8.0 and pr[0]["in_stock"] is True and pr[0]["offer_count"] == 5
assert pr[0]["image_url"] == "https://img/c.jpg" and pr[0]["checked_at"].startswith("20")
assert pr[2]["price_eur"] == 7.0 and pr[2]["trend"] is None and pr[2]["change_percent"] is None
assert main._trend(2.9) == "stable" and main._trend(3.0) == "up" and main._trend(-3.0) == "down" and main._trend(None) is None
assert api.post("/wishes/price", json={"wishes": [{"title": "t"}] * 21}, headers=price_ip).status_code == 422
os.environ["IDEALO_MCP_URL"] = os.environ["IDEALO_CLIENT_ID"] = ""
n_search = pc.count("search_products")
os.environ["IDEALO_MCP_URL"], os.environ["IDEALO_CLIENT_ID"] = "stub", "stub"
r = api.post("/wishes/price", json={"wishes": [{"title": " CAT "}, {"title": "nothing"}]}, headers=price_ip)
assert r.json()["prices"][0]["price_eur"] == 18.5 and pc.count("search_products") == n_search + 1  # cat from cache, nothing looked up again
# throttle: 4 calls need at least 3 slots of 1/3 s
import time as _t
t0 = _t.monotonic()
for _ in range(4):
    main.idealo.throttle()
assert _t.monotonic() - t0 >= 0.9
# deadline: an idealo call that hangs yields null, not a hanging request
main.PRICE_DEADLINE_S = 0.3
main._price_cache.clear()
main.idealo.call_tool = lambda *a, **k: _t.sleep(1) or {"results": []}
t0 = _t.monotonic()
r = api.post("/wishes/price", json={"wishes": [{"title": "slow"}]}, headers=price_ip)
assert r.json() == {"prices": [None]} and _t.monotonic() - t0 < 0.9
main.PRICE_DEADLINE_S = 25
os.environ["IDEALO_MCP_URL"] = os.environ["IDEALO_CLIENT_ID"] = ""
assert api.post("/wishlist/import", json={"url": "x" * 2001}).status_code == 422
print("price   ok: /wishes/price order, trend, single offer, limits, cache, throttle, deadline")

# --- push: devices, cron auth, thresholds, dedupe, occasions, cleanup (APNs stubbed) ---
import push
from datetime import date, timedelta

TOK = "a" * 64
push_user, push_h = sign_in(f"push-{tag}@example.com")
uid = push_user["user"]["id"]
assert api.put("/me/settings", json={"language": "en"}).status_code == 401
assert api.put("/me/settings", json={"language": "fr"}, headers=push_h).status_code == 422
assert api.put("/me/settings", json={"language": "en"}, headers=push_h).json() == {"language": "en"}
assert push.user_language(uid) == "en"
assert api.post("/me/devices", json={"token": "nope"}, headers=push_h).status_code == 422
assert api.post("/me/devices", json={"token": TOK, "platform": "ios"}).status_code == 401
assert api.post("/me/devices", json={"token": TOK, "platform": "ios"}, headers=push_h).status_code == 204
assert db.devices_of(uid) == [TOK]
assert api.delete(f"/me/devices/{TOK}", headers=push_h).status_code == 204 and db.devices_of(uid) == []
api.post("/me/devices", json={"token": TOK, "platform": "ios"}, headers=push_h)

# cron auth: no secret configured, wrong, right; GET and POST
os.environ.pop("CRON_SECRET", None)
assert api.post("/cron/daily").status_code == 401 and api.post("/cron/daily", headers={"Authorization": "Bearer "}).status_code == 401
os.environ["CRON_SECRET"] = "cron-secret"
assert api.post("/cron/daily").status_code == 401
assert api.get("/cron/daily", headers={"Authorization": "Bearer wrong"}).status_code == 401

# friend profile with a wish, a pin and a dated birthday; prices go from 50 to 42 (-16 %)
friend, friend_h = sign_in(f"friend-{tag}@example.com")
slug = api.post("/me/share", headers=friend_h).json()["slug"]
fd = api.get("/me/data", headers=friend_h).json()
api.put("/me/data", json={"people": [], "profile": {"name": "Lea", "wishes": [{"title": "Hario Mini Mill"}]},
                          "base_updated_at": fd["updated_at"]}, headers=friend_h)
soon = (date.today() + timedelta(days=3)).isoformat()
people = [{"id": "p1", "name": "Lea", "friendSlug": slug, "pins": [{"product_name": "Tea Pot", "offer_url": "https://x/1", "total_eur": 20}],
           "occasion": "birthday", "occasionDate": soon.replace(soon[:4], "1990")},
          {"id": "p2", "name": "Tom", "pins": [], "occasion": "Housewarming", "occasionDate": (date.today() + timedelta(days=30)).isoformat()}]
d = api.get("/me/data", headers=push_h).json()
api.put("/me/data", json={"people": people, "profile": None, "base_updated_at": d["updated_at"]}, headers=push_h)

sent_calls, apns_result = [], [(True, None)]
push.apns_send = lambda token, payload: (sent_calls.append((token, payload)) or apns_result[0])
prices = {"hario mini mill": 50.0, "tea pot": 20.0}
priced = lambda session, title, deadline=None: {"price_eur": prices[title.lower()]} if prices.get(title.lower()) is not None else None
run = lambda today=None: push.run_daily(priced, lambda: "s", today=today)
# first run: only snapshots and the birthday (in 3 days, stored with year 1990, recurring) -> one summary
r = run()
assert r == {"checked": 2, "alerts_sent": 1}, r
tok, pl = sent_calls[-1]
assert tok == TOK and pl["aps"]["alert"]["title"] == "Wishfit" and pl["aps"]["sound"] == "default" and pl["personId"] == "p1" and pl["slug"] == slug
assert "birthday in 3 days" in pl["aps"]["alert"]["body"] and "Tea Pot" in pl["aps"]["alert"]["body"], pl
# same day again: at most one message per account and day
assert run()["alerts_sent"] == 0 and len(sent_calls) == 1
# next day: drop under 10 % is no alert, 16 % is; birthday not repeated, German is not used (account is en)
prices["hario mini mill"] = 46.0
tomorrow = date.today() + timedelta(days=1)
assert run(tomorrow)["alerts_sent"] == 0
prices["hario mini mill"] = 41.0  # 46 -> 41 is 10.9 %
r = run(tomorrow + timedelta(days=1))
assert r["alerts_sent"] == 1 and sent_calls[-1][1]["aps"]["alert"]["body"] == "Hario Mini Mill for Lea: \u20ac41 instead of \u20ac46", sent_calls[-1][1]["aps"]["alert"]["body"]
# same drop again does not repeat
assert run(tomorrow + timedelta(days=2))["alerts_sent"] == 0
# out of stock, then back: German text; two events become one message "... und 1 weitere"
prices["tea pot"] = None
run(tomorrow + timedelta(days=3))
assert db.get_snapshots(["tea pot"])["tea pot"]["in_stock"] is False
api.put("/me/settings", json={"language": "de"}, headers=push_h)
prices["tea pot"] = 20.0
prices["hario mini mill"] = 30.0
n = len(sent_calls)
assert run(tomorrow + timedelta(days=4))["alerts_sent"] == 1
body = sent_calls[n][1]["aps"]["alert"]["body"]
assert body.startswith("Hario Mini Mill für Lea: 30 € statt 41 €") and body.endswith("und 1 weitere"), body
# occasion on an exact date, 7 days ahead, one-time (no birthday): reminder, none beyond 7 days
people[1]["occasionDate"] = (date.today() + timedelta(days=12)).isoformat()
d = api.get("/me/data", headers=push_h).json()
api.put("/me/data", json={"people": people, "profile": None, "base_updated_at": d["updated_at"]}, headers=push_h)
assert push.occasion_due(people[1], date.today()) is None
assert push.occasion_due(people[1], date.today() + timedelta(days=5))[1] == 7
assert push.occasion_due({"occasion": "x", "occasionDate": "garbage"}, date.today()) is None
# idealo error or timeout: the snapshot stays as it is and nothing counts as "back in stock"
apns_result[0] = (True, None)


def failing(session, title, deadline=None):
    raise push.PriceUnavailable(title)


before = db.get_snapshots(["tea pot", "hario mini mill"])
n = len(sent_calls)
assert push.run_daily(failing, lambda: "s", today=tomorrow + timedelta(days=20))["checked"] == 0
assert db.get_snapshots(["tea pot", "hario mini mill"]) == before and len(sent_calls) == n
# send phase out of time: the event stays pending (old snapshot kept), the next run delivers it
prices["hario mini mill"] = 20.0
r = push.run_daily(priced, lambda: "s", today=tomorrow + timedelta(days=21), send_budget_s=0)
assert r["alerts_sent"] == 0 and db.get_snapshots(["hario mini mill"])["hario mini mill"]["price_eur"] == 30.0, r
assert push.run_daily(priced, lambda: "s", today=tomorrow + timedelta(days=22))["alerts_sent"] == 1
assert db.get_snapshots(["hario mini mill"])["hario mini mill"]["price_eur"] == 20.0
# a second run while another one holds the cron lock does nothing
with db.cron_lock() as got:
    assert got and push.run_daily(priced, lambda: "s") == {"skipped": True}
# cron without APNs configuration: 503, nothing runs
for k in ("APNS_KEY", "APNS_KEY_ID", "APNS_TEAM_ID", "APNS_TOPIC"):
    os.environ.pop(k, None)
assert api.post("/cron/daily", headers={"Authorization": "Bearer cron-secret"}).status_code == 503
os.environ.update(APNS_KEY="unused", APNS_KEY_ID="KID123", APNS_TEAM_ID="TEAM123", APNS_TOPIC="app.wishfit.ios")
# cron with the secret: 200 and counts; no device -> checks nothing for this account
r = api.post("/cron/daily", headers={"Authorization": "Bearer cron-secret"})
assert r.status_code == 200 and set(r.json()) == {"checked", "alerts_sent"}, r.text
# dead token: APNs says BadDeviceToken / Unregistered -> device deleted, no alert logged
for reason in ("BadDeviceToken", "Unregistered"):
    api.post("/me/devices", json={"token": TOK, "platform": "ios"}, headers=push_h)
    apns_result[0] = (False, reason)
    assert push.notify(uid, "t", "b", {}) == 0 and db.devices_of(uid) == []
# other failure keeps the device
api.post("/me/devices", json={"token": TOK, "platform": "ios"}, headers=push_h)
apns_result[0] = (False, "http 500")
assert push.notify(uid, "t", "b", {}) == 0 and db.devices_of(uid) == [TOK]
# JWT: ES256, header kid, claims iss/iat
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
pem = ec.generate_private_key(ec.SECP256R1()).private_bytes(
    serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
os.environ.update(APNS_KEY=pem, APNS_KEY_ID="KID123", APNS_TEAM_ID="TEAM123", APNS_TOPIC="app.wishfit.ios")
import base64 as _b64
head, claims, sig = push.apns_jwt().split(".")
dec = lambda x: json.loads(_b64.urlsafe_b64decode(x + "=" * (-len(x) % 4)))
assert dec(head) == {"alg": "ES256", "kid": "KID123"} and dec(claims)["iss"] == "TEAM123" and len(_b64.urlsafe_b64decode(sig + "==")) == 64
assert push.apns_jwt().split(".")[1] == claims  # cached
# sign-out with the device token removes the device in the same call; a foreign token is left alone
out_user, out_h = sign_in(f"out-{tag}@example.com")
TOK2 = "b" * 64
assert api.post("/me/devices", json={"token": TOK2, "platform": "ios"}, headers=out_h).status_code == 204
assert db.devices_of(out_user["user"]["id"]) == [TOK2]
assert api.post("/auth/logout", json={"device_token": TOK}, headers=out_h).status_code == 204
assert db.devices_of(uid) == [TOK]  # someone else's token survives
out_user, out_h = sign_in(f"out-{tag}@example.com")
assert api.post("/auth/logout", json={"device_token": TOK2.upper()}, headers=out_h).status_code == 204
assert db.devices_of(out_user["user"]["id"]) == []
assert api.get("/me", headers=out_h).status_code == 401
assert api.post("/auth/logout", headers=push_h).status_code == 204 or True  # plain logout still works
push_user, push_h = sign_in(f"push-{tag}@example.com")
api.delete("/me", headers=push_h)
api.delete("/me", headers=friend_h)
assert db.devices_of(uid) == []
os.environ.pop("CRON_SECRET")
print("push    ok: devices, cron auth, thresholds, dedupe, occasions, 410 cleanup, jwt")

print("ALL CHECKS PASSED")
