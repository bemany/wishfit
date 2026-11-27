# CLAUDE.md

Hackathon-Projekt, Abgabe 27.11.2026 um 19:45 CET. Tempo vor Vollständigkeit.

- Zuerst `docs/plan.md` lesen (Umfang, was gebaut wird und was nur in den Pitch kommt).
- Bewertungskriterien stehen in `docs/challenges.md`. Jede Arbeit sollte auf ein Kriterium einzahlen.
- Monorepo: `services/agent` (Backend), `apps/web` (Landingpage), `apps/mobile` (Expo-App, React Native).
- Der Agent ruft seine Modelle über die Nebius Token Factory auf (OpenAI-kompatibel). Die Entscheidung
  muss aus einem Live-Call kommen und im Log/Trace sichtbar sein.
- idealo-Daten kommen nur über den idealo-MCP. Das Backend ist MCP-Client.
- Norma-Challenge: Änderungen gehen über Pull Requests, nicht direkt auf `main`. Mindestens 2 PRs von
  verschiedenen Autoren, jeweils vom Norma-GitHub-App geprüft. Keinen Code löschen, nur damit ein
  Finding verschwindet.
- Keine Secrets committen. Zugangsdaten in `.env` (gitignored), Beispielwerte in `.env.example`.
- Sprache im Team: Deutsch. Code und Commits: Englisch.
- OpenSpec: Anforderungen stehen in `openspec/changes/<change>/` (aktuell `mvp-gift-agent`). Vor neuem Verhalten
  erst Spec und `tasks.md` anpassen, erledigte Aufgaben dort abhaken. API-Vertrag: `docs/api.md`.
