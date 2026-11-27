# CLAUDE.md

Hackathon project (Agentic Hackathon Berlin, 27 November 2026). Product name: Wishfit. Speed over completeness.

- Read `README.md` first, then `docs/api.md` (the agent's API contract). `docs/plan.md` and `docs/challenges.md`
  are the original planning notes in German and partly outdated.
- Monorepo: `services/agent` (backend), `apps/web` (landing page and web tool), `apps/mobile` (Expo app, React
  Native).
- The agent calls its model through an OpenAI-compatible client. Default locally: Nebius Token Factory via
  `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`; without those it falls back to the Vercel AI Gateway. The decision
  must come from a live call and be visible in the trace.
- idealo data comes only through the idealo MCP (`services/agent/idealo.py`). The backend is the MCP client.
- Changes go through pull requests, not directly to `main`. CI (GitHub Actions) runs the agent self-check, the web
  lint and build, the mobile typecheck and the OpenSpec validation.
- No secrets in the repo. Credentials in `.env` (gitignored), names only in `.env.example`.
- OpenSpec: requirements live in `openspec/changes/<change>/` (currently `mvp-gift-agent`, written in German).
  Adjust spec and `tasks.md` before adding new behaviour.
- Team language: German. Code, commits, README and UI: English.
