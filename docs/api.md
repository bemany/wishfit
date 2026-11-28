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
| `budget_eur` | number | required (optional with `previous_id`), total budget including shipping |
| `occasion` | string | required (optional with `previous_id`) |
| `recipient_name` | string? | optional |
| `preferences` | string? | optional free text (brand, colour, lifestyle) |
| `language` | `"de"` \| `"en"`? | language of everything the agent writes (`reply`, reasons, signal labels, questions). Default `de`. |
| `previous_id` | string? | follow-up in a conversation: id of the earlier result for the same person. The server prepends that request's input and earlier follow-ups, so the client sends only the new message in `input_text`. `budget_eur`, `occasion`, `recipient_name` are taken from the earlier request when omitted. Unknown id: 404. |
| `image_base64` | string? | photo of a product (JPEG or PNG, base64 without a `data:` prefix, up to about 4 MB). A vision model (`LLM_VISION_MODEL`, default `google/gemma-3-27b-it`) names the product in an extra model call (`step: "photo"` in the trace); the name goes on as text, so a photo alone is valid input. No recognizable product: 422. |
| `demo_case` | `"simple"` \| `"chaotic"` \| `"chat"`? | optional: use the stored idealo snapshot instead of live MCP data. The model call is always live. |

Response (`sample.response.json`, `sample.clarification.response.json`, `sample.chat.response.json`, `sample.ideas.response.json`):

| Field | Type | Notes |
|---|---|---|
| `id` | string | result id, use with `/results/{id}` and `/trace/{id}` |
| `status` | `"recommendation"` \| `"needs_clarification"` \| `"ideas_only"` | `ideas_only`: the agent understood the input and lists gift ideas, but has no idealo data for them (`top` null, `uncertainty` says why) |
| `reply` | string | the agent's chat message for this turn, 1-2 sentences in `language`, spoken to the giver (what it picked and why, or what it needs). Always present. |
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

## Accounts (change `accounts-and-web`)

Sign-in with e-mail and a one-time code. The first successful code creates the account. Protected
endpoints need `Authorization: Bearer <token>`; without a valid token they answer 401. E-mail addresses
are trimmed and lower-cased.

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/auth/request-code` | no | `{email, language?}` (`"de"` default, `"en"`) | 204. Test mode (`AUTH_DEV_CODES=1`, no mail key): 200 `{dev_code}`. 422 invalid address, 429 more than once per 60 s or 5 per hour, 502 mail could not be sent, 503 mail not configured (production without mail key and without test mode) |
| POST | `/auth/verify` | no | `{email, code}` | 200 `{token, user: {id, email, created_at}, created}`; 401 wrong, expired or used code (5 attempts per code) |
| POST | `/auth/logout` | yes | `{device_token?}` | 204, the token is invalid afterwards; a given push `device_token` of this account is removed in the same call |
| GET | `/me` | yes | – | 200 `{id, email, created_at}` |
| DELETE | `/me` | yes | – | 204, deletes account, sessions and synced data; results lose their owner |
| GET | `/me/data` | yes | – | 200 `{people, profile, updated_at}`; empty account: `{people: [], profile: null, updated_at: null}` |
| PUT | `/me/data` | yes | `{people, profile, base_updated_at}` | 200 `{updated_at}`; 409 `{detail, people, profile, updated_at}` when `base_updated_at` is not the stored one (use `null` for an empty account); 413 over 2 MB; 422 wrong types or a `base_updated_at` without time zone. Send `updated_at` back unchanged as `base_updated_at` (do not parse it) |

- Codes: 6 digits, valid 10 minutes, a new request replaces the open code. Tokens are valid 90 days.
- `people` is the app's list of persons (each with `id` and `updatedAt` in ms), `profile` the app's own
  profile object (with `updatedAt`) or null. The server stores both as given.
- `POST /recommend` accepts an optional token; with a valid token the result belongs to the account.
  An invalid token answers 401. `GET /results/{id}` and `GET /trace/{id}` stay public.

## Profile link, wishlist import, price tracker (change `profile-link-friends`)

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/wishlist/import` | no | `{url, language?}` (`"en"` default, `"de"` for the error text) | 200 `{items: [{title, price_eur, url, image_url, source: "amazon"}], source: "amazon_wishlist"}` (max 50 items); 422 unsupported link or empty list; 429 more than 10 per minute per IP (first `x-forwarded-for` address); 502 Amazon blocked or unreachable |
| POST | `/me/share` | yes | – | 200 `{slug, url}`; same slug on repeat; `url` = `PUBLIC_WEB_URL` (default `https://wishfit-web-test.vercel.app`) + `/u/<slug>` |
| DELETE | `/me/share` | yes | – | 204, the old link answers 404 afterwards (a new share draws a new slug) |
| GET | `/profiles/{slug}` | no | – | 200 `{name, color, wishes, updated_at}`; 404 unknown or unshared. No e-mail, no id |
| POST | `/wishes/price` | no | `{wishes: [{title, url?}]}` (max 20) | 200 `{prices: [price \| null]}` in request order; 422 more than 20; 429 same IP limit as import; 503 idealo not configured |

- Public profile is filtered server-side from the synced profile: `name` (max 60), `color` (`#rrggbb` or a
  known name up to 20 characters, else null), `wishes` (max 100; a string becomes `{title}`; each wish has
  `title` (max 200), `price_eur` (number or null), `url`, `image_url` (http(s) only, max 2000),
  `source` (`amazon|snap|typed|link` or null), `added_at` (number or null), `price` (price object or null)).
  A shared account without a saved profile returns `{name: "", color: null, wishes: [], updated_at: null}`.
- `price` = `{price_eur, offer_count, in_stock, trend: "down"|"stable"|"up"|null, change_percent, url, image_url, checked_at}`.
  Trend threshold is ±3 % over 30 days. Best idealo hit per wish (`search_products` with `availableOnly`,
  then offers and 30-day history for a catalog hit; single-merchant hits have no history, so trend is null).
  At most 3 parallel idealo calls, no model call.
- `DELETE /me` removes the slug with the account.

## Push and daily check (change `onboarding-language-push`)

All `/me/*` endpoints need `Authorization: Bearer <session token>`.

- `PUT /me/settings` `{"language": "de"|"en"}` → `{"language"}`. Language of push texts (fallback: profile language, then `de`).
- `POST /me/devices` `{"token": "<hex APNs token>", "platform": "ios"}` → 204. Registers or refreshes a device.
- `DELETE /me/devices/{token}` → 204.
- `GET|POST /cron/daily` with `Authorization: Bearer $CRON_SECRET` (401 otherwise). Triggered by Vercel Cron (`0 7 * * *`, `vercel.json`). Response `{"checked": n, "alerts_sent": n}`.

Daily check per account: price drop on friends' wishes and pins, item back in stock, occasion within 0–7 days (birthdays recur yearly). At most one notification per account and day; each event is sent once (`alert_log`). Invalid tokens (`BadDeviceToken`, `Unregistered`, `DeviceTokenNotForTopic`) are deleted.

Payload: `aps.alert {title, body}` in the user's language, plus `personId` and `slug` of the top item for deep links.

Env: `APNS_KEY` (p8 PEM), `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_TOPIC`, `APNS_ENV` (`sandbox`|`production`), `CRON_SECRET`.
