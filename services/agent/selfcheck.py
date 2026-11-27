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
os.environ.pop("DATABASE_URL", None)  # always in-memory here
for _k in ("IDEALO_MCP_URL", "IDEALO_CLIENT_ID", "LLM_BASE_URL"):
    os.environ[_k] = ""  # never call the real idealo MCP or a real model from the self-check
os.environ["LLM_MODEL"] = "stub-model"


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
    return {k: example(sample)[k] for k in ("status", "top", "alternatives", "uncertainty")}


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
stub(json.dumps(chat["understood"]), json.dumps({k: chat[k] for k in ("status", "top", "alternatives", "uncertainty")}))
r = api.post("/recommend", json=example("chat.request.json"))
assert r.status_code == 200, r.text
body = main.RecommendResponse.model_validate(r.json())
assert body.status == "recommendation" and body.understood.candidates and body.top.total_eur == 48.89
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
print("ALL CHECKS PASSED")
