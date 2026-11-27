# Wishfit

**Drop anything in. Get the one gift that fits.**

Wishfit is a gift agent. You add a person (name, budget, occasion) and give the agent whatever you know about
them: a WhatsApp chat export, an Amazon wishlist link, notes, or a dictated description. The agent reads the
input, derives concrete gift ideas, researches each one live through the idealo MCP and recommends one pick in
your budget, with the data it is based on.

Built in one day at the Agentic Hackathon Berlin ("From Research to Commerce", 27 November 2026) by team
Unexpected. Landing page and films: https://wishfit.vercel.app

## How it works

1. **Understand.** A model on the Nebius Token Factory reads the free-form input and returns gift ideas, each
   tied to the part of the input it came from. A public Amazon wishlist link in the input is fetched and read.
2. **Research.** For every idea the agent calls the idealo MCP: catalog search within the budget, offers with
   shipping and delivery dates, and the 30-day price history. A typical request makes about 16 calls.
3. **Decide.** A second model call picks one gift plus alternatives. Each pick carries the total price including
   shipping and the idealo signals behind it (price trend, number of offers, delivery, budget fit). The total is
   computed in code, not by the model.
4. **Keep chatting.** "Cheaper" or "Something else" continues the thread; the agent knows the earlier input and
   the previous pick.

If the data is missing or contradictory, the agent says why it is unsure and asks instead of guessing. Without
idealo data it returns ideas only and never invents prices. Every model call and every idealo call is stored in a
trace per result.

## What is in this repo

| Path | What |
|---|---|
| `services/agent` | Agent backend: Python, FastAPI. Model calls through an OpenAI-compatible client (Nebius Token Factory), idealo MCP client, Amazon wishlist reader, traces. |
| `apps/mobile` | iPhone app: Expo / React Native, in the "gift tags" design. People as coloured tags, chat with the agent, pick with data stamps. The same codebase can target Android; no Android build exists yet. |
| `apps/web` | Next.js: landing page at `/`, a web version of the tool at `/try`, result and trace views. |
| `docs/api.md` | API contract of the agent, with example payloads in `services/agent/examples`. |
| `docs/design` | Design direction and screen mockups. |
| `openspec` | Requirements and task list (OpenSpec, written in German). |

## Run it locally

Agent (needs [uv](https://docs.astral.sh/uv/)):

```bash
cd services/agent
cp .env.example .env   # add the idealo MCP credentials and a model key
uv run uvicorn main:app --port 8000
```

`uv run python selfcheck.py` runs the agent against stubbed services, without any credentials.

Web:

```bash
cd apps/web
npm ci   # needs HEROUI_AUTH_TOKEN for the HeroUI Pro package
npm run dev
```

Mobile (iOS simulator, needs Xcode):

```bash
cd apps/mobile
npm install
npx expo run:ios
```

The app talks to `EXPO_PUBLIC_API_URL` (default `http://localhost:8000`).

## Status

Working today: the full agent flow with live idealo data and a Nebius model, the iPhone app on a simulator and
on a physical device, the web version against a local backend.

Not there yet: the public deployment of the backend has no credentials, so the hosted `/try` page cannot answer.
There are no accounts, no friends or shared wishlists, no photo search and no Android build; those exist as
design only. Results are kept in memory unless a Postgres `DATABASE_URL` is set.

## Notes

- No secrets are in this repository. Credentials live in a local, gitignored `.env`.
- Demo snapshots in `services/agent/snapshots` are hand-written sample data, clearly marked, used only by the
  `demo_case` requests and the self-check.
- The Amazon wishlist reader follows the approach of
  [christian-draeger/amazon-wishlist-webservice](https://github.com/christian-draeger/amazon-wishlist-webservice).
