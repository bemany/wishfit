# Agent API contract

Base URL: `AGENT_API_URL` (local: `http://localhost:8000`). JSON in, JSON out, CORS open.
Web and mobile build against this file and `services/agent/examples/*.json`. Change the contract here
first, then the code.

## POST /recommend

Request (`services/agent/examples/simple.request.json`, `chaotic.request.json`, `chat.request.json`):

| Field | Type | Notes |
|---|---|---|
| `input_text` | string? | anything that describes the person or their wishes: a pasted wishlist, a chat export (e.g. WhatsApp), notes, a dictated description. Up to 20,000 characters. The agent extracts gift ideas from it. |
| `wishes` | string[]? | optional, 0-10 explicit product names or free-text wishes. At least one of `input_text` and `wishes` must be given. |
| `budget_eur` | number | required, total budget including shipping |
| `occasion` | string | required |
| `recipient_name` | string? | optional |
| `preferences` | string? | optional free text (brand, colour, lifestyle) |
| `demo_case` | `"simple"` \| `"chaotic"` \| `"chat"`? | optional: use the stored idealo snapshot instead of live MCP data. The model call is always live. |

Response (`sample.response.json`, `sample.clarification.response.json`, `sample.chat.response.json`, `sample.ideas.response.json`):

| Field | Type | Notes |
|---|---|---|
| `id` | string | result id, use with `/results/{id}` and `/trace/{id}` |
| `status` | `"recommendation"` \| `"needs_clarification"` \| `"ideas_only"` | `ideas_only`: the agent understood the input and lists gift ideas, but has no idealo data for them (`top` null, `uncertainty` says why) |
| `understood` | `{summary: string, interests: string[], candidates: {idea: string, why: string}[]}` \| null | what the agent took from `input_text`; null (or absent) when only `wishes` were given. `why` quotes or paraphrases the part of the input the idea comes from. |
| `top` | Recommendation \| null | null when `needs_clarification` |
| `alternatives` | Recommendation[] | 2-3 entries, may be empty when `needs_clarification` |
| `uncertainty` | `{reasons: string[], question: string}` \| null | set when data is missing or contradictory |
| `model` | string | model that made the decision, e.g. `anthropic/claude-sonnet-5.5` |
| `trace_url` | string | relative path |
| `created_at` | ISO 8601 string | |

Recommendation:

| Field | Type | Notes |
|---|---|---|
| `wish` | string | the wish this answers |
| `product_name` | string | |
| `action` | `"buy"` \| `"wait"` \| `"alternative"` | |
| `reason` | string | German, 1-3 sentences |
| `price_eur`, `shipping_eur`, `total_eur` | number \| null | `total_eur` = price + shipping |
| `merchant` | string \| null | |
| `offer_url`, `image_url` | string \| null | |
| `available` | boolean \| null | |
| `delivery_estimate` | string \| null | |
| `signals` | `{type, label, value}[]` | the idealo data that carries the decision. `type`: `price_history`, `availability`, `offers`, `category`, `budget` |

Errors: `422` invalid request, `502` model or idealo failure, body `{"detail": string}`.

## GET /results/{id}

Returns the stored response of an earlier `POST /recommend`. `404` if unknown.

## GET /trace/{id}

```json
{
  "id": "r_...",
  "model_calls": [
    {"step": "understand | decide", "model": "...", "input": [{"role": "system", "content": "..."}], "output": "...",
     "started_at": "ISO 8601", "duration_ms": 1234, "usage": {"prompt_tokens": 0, "completion_tokens": 0}}
  ],
  "idealo_calls": [
    {"tool": "...", "arguments": {}, "result": {}, "duration_ms": 123, "source": "live"}
  ]
}
```

`source` is `"live"` or `"snapshot"`.

`sources` (optional, in the trace): inputs the agent fetched itself, currently `{type: "amazon_wishlist", url, status, items: [{title, price}]}` when `input_text` or a wish contains a public Amazon wishlist link. The items are added to the input before the first model step.

## GET /health

`{"ok": true}`
