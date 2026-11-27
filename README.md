# wishloop (Arbeitstitel)

Geschenk-Agent für den Agentic Hackathon "From Research to Commerce" (AI Agents Berlin, 27.11.2026).

Jemand will einer Person etwas schenken, bekommt deren Wunschliste und ein Budget. Der Agent prüft
über den idealo-MCP Preise, Preisverlauf, Verfügbarkeit und Alternativen und empfiehlt ein bestes
Geschenk plus 2–3 Alternativen, jeweils mit Begründung.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `services/agent` | Backend-Agent: Nebius Token Factory entscheidet, idealo-MCP liefert die Daten |
| `apps/web` | Landingpage: Schenkender (Name, Budget, Anlass), Beschenkter (Wunschliste), Ergebnis |
| `apps/ios` | Swift-App (interner TestFlight-Build), zeigt dieselben Ergebnisse |
| `docs/plan.md` | Plan, Umfang für heute, Zeitplan, Abgabe-Checkliste |
| `docs/challenges.md` | Bewertungskriterien der Partner-Challenges |

Abgabe: Freitag 27.11.2026, 19:45 CET.
