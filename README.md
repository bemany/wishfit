# wishloop (Arbeitstitel)

Geschenk-Agent für den Agentic Hackathon "From Research to Commerce" (AI Agents Berlin, 27.11.2026).

Jemand will einer Person etwas schenken, bekommt deren Wunschliste und ein Budget. Der Agent prüft
über den idealo-MCP Preise, Preisverlauf, Verfügbarkeit und Alternativen und empfiehlt ein bestes
Geschenk plus 2–3 Alternativen, jeweils mit Begründung.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `services/agent` | Backend-Agent: ein Modell über das Vercel AI Gateway entscheidet, idealo-MCP liefert die Daten |
| `apps/web` | Landingpage: Schenkender (Name, Budget, Anlass), Beschenkter (Wunschliste), Ergebnis |
| `apps/mobile` | Expo-App (React Native, interner TestFlight-Build, OTA über EAS Update), zeigt dieselben Ergebnisse |
| `docs/api.md` | API-Vertrag des Agent-Backends, Beispiele in `services/agent/examples` |
| `docs/plan.md` | Plan, Umfang für heute, Zeitplan, Abgabe-Checkliste |
| `docs/challenges.md` | Bewertungskriterien der Partner-Challenges |

Abgabe: Freitag 27.11.2026, 19:45 CET.
