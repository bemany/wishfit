# Wishloop agent API

FastAPI backend implementing `docs/api.md`: `POST /recommend`, `GET /results/{id}`, `GET /trace/{id}`,
`GET /health`.

## Run

```bash
cd services/agent
cp .env.example .env        # fill in NEBIUS_API_KEY and NEBIUS_MODEL
uv run uvicorn main:app --reload --port 8000
curl -s localhost:8000/recommend -H 'content-type: application/json' -d @examples/simple.request.json
```

Self-check (Nebius client stubbed, no key needed): `uv run python selfcheck.py`

## Env

| Variable | Purpose |
|---|---|
| `NEBIUS_API_KEY` | Token Factory key. Missing: `/recommend` answers 502. |
| `NEBIUS_BASE_URL` | OpenAI-compatible endpoint, see `.env.example`. |
| `NEBIUS_MODEL` | Model that decides. Missing: 502. |
| `DATABASE_URL` | Postgres (table `results`, created if missing). Empty: in-memory dict. |
| `IDEALO_MCP_URL`, `IDEALO_MCP_TOKEN` | idealo MCP, so far only used by `list_idealo_tools.py`. |

## Where the model decides (Nebius note)

`main.py`, function `decide()`: one chat completion on the Nebius Token Factory through the `openai` SDK.
The model gets the request plus all idealo data per wish and returns the decision as JSON (top
recommendation, alternatives, action buy/wait/alternative, signals, or `needs_clarification` with reasons
and a follow-up question). The output is validated with pydantic, `total_eur` is computed in code, invalid
JSON is retried once, then 502. Every call (model, full input, raw output, start, duration, usage) is stored
with the result, returned by `GET /trace/{id}` and printed as one JSON line to stdout.

## idealo data

- With `demo_case`: `snapshots/simple.json` / `snapshots/chaotic.json`. These are hand-written demo
  snapshots (`"source": "snapshot"`), not MCP output. The model call is still live.
- Without `demo_case`: 502 `idealo MCP not configured yet`. Fill in `fetch_idealo_live()` in `main.py` once
  the tool list is known: `uv run python list_idealo_tools.py` prints every tool with its input schema.

## Vercel

`main.py` exports `app`; dependencies come from `pyproject.toml`. Set the project root to `services/agent`.
