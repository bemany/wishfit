# Wishloop agent API

FastAPI backend implementing `docs/api.md`: `POST /recommend`, `GET /results/{id}`, `GET /trace/{id}`,
`GET /health`.

## Run

```bash
cd services/agent
cp .env.example .env        # fill in AI_GATEWAY_API_KEY
uv run uvicorn main:app --reload --port 8000
curl -s localhost:8000/recommend -H 'content-type: application/json' -d @examples/simple.request.json
```

Self-check (model client stubbed, no key needed): `uv run python selfcheck.py`

## Env

| Variable | Purpose |
|---|---|
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway key for local runs. On Vercel the OIDC token is used instead. Neither set: `/recommend` answers 502. |
| `LLM_BASE_URL`, `LLM_API_KEY` | Optional: another OpenAI-compatible endpoint instead of the gateway. |
| `LLM_MODEL` | Model that decides. Default `anthropic/claude-sonnet-5.5`. |
| `DATABASE_URL` | Postgres (table `results`, created if missing). Empty: in-memory dict. |
| `IDEALO_MCP_URL`, `IDEALO_TOKEN_URL`, `IDEALO_CLIENT_ID`, `IDEALO_CLIENT_SECRET` | idealo MCP with OAuth client credentials. Missing: requests without `demo_case` get no live data. |

## Where the model decides

`main.py`, function `decide()`: one chat completion through the Vercel AI Gateway with the `openai` SDK.
The model gets the request plus all idealo data per wish and returns the decision as JSON (top
recommendation, alternatives, action buy/wait/alternative, signals, or `needs_clarification` with reasons
and a follow-up question). The output is validated with pydantic, `total_eur` is computed in code, invalid
JSON is retried once, then 502. Every call (model, full input, raw output, start, duration, usage) is stored
with the result, returned by `GET /trace/{id}` and printed as one JSON line to stdout.

## idealo data

- With `demo_case`: `snapshots/simple.json` / `snapshots/chaotic.json`. These are hand-written demo
  snapshots (`"source": "snapshot"`), not MCP output. The model call is still live.
- Without `demo_case`: 502 `idealo MCP not configured yet`. Fill in `fetch_idealo_live()` in `main.py` once
  the tool list is known: `uv run python idealo.py` prints every tool with its input schema.

## Vercel

`main.py` exports `app`; dependencies come from `pyproject.toml`. Set the project root to `services/agent`.
