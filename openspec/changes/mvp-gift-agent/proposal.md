## Why

Wer etwas verschenken will, kennt selten den richtigen Preis, die Verfügbarkeit oder eine gute Alternative. Für den Hackathon (Abgabe 27.11.2026, 19:45) bauen wir den kleinsten Ablauf, der zeigt, dass idealo-Daten und ein Nebius-Modell diese Entscheidung treffen können.

## What Changes

- Agent-Backend (`services/agent`): nimmt Wunschliste, Budget, Anlass und Vorlieben an, holt idealo-Daten über den idealo-MCP und lässt ein Modell auf der Nebius Token Factory entscheiden (kaufen, warten, Alternative). Jeder Modell-Call wird als Trace gespeichert.
- Web (`apps/web`): Seite für den Schenkenden (teilbarer Link), Seite für den Beschenkten (Wunschliste), Ergebnisseite.
- Mobile (`apps/mobile`): Expo-App, die dasselbe Ergebnis anzeigt.

## Capabilities

### New Capabilities

- `agent-api`: HTTP-API des Agenten, Vertrag in `docs/api.md`.
- `web`: Landingpage und Ergebnisseite.
- `mobile`: Expo-App mit Ergebnis-Screen.

## Impact

Neuer Code in `services/agent`, `apps/web`, `apps/mobile`. Externe Dienste: idealo-MCP, Nebius Token Factory, Vercel, Neon Postgres. Nicht im Umfang: Login, E-Mail-Versand, zuverlässiger Amazon-Import, Wichtel-Modus, Android.
