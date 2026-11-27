## 1. Basis

- [x] 1.1 API-Vertrag in `docs/api.md` und Beispiele in `services/agent/examples`
- [x] 1.2 Expo-Vorlage in `apps/mobile`

## 2. Agent-Backend

- [x] 2.1 FastAPI-App mit `/recommend`, `/results/{id}`, `/trace/{id}`, `/health`
- [x] 2.2 Nebius-Call entscheidet, Ausgabe als JSON nach Vertrag, Trace je Call
- [x] 2.3 Zwei Demo-Fälle mit gespeichertem idealo-Snapshot
- [ ] 2.4 idealo-MCP-Client (wartet auf Endpunkt und Tool-Liste)
- [x] 2.5 Speicher: Neon Postgres, ohne `DATABASE_URL` im Arbeitsspeicher

## 3. Web

- [ ] 3.1 Seite Schenkender: Name, Budget, Anlass, teilbarer Link
- [ ] 3.2 Seite Beschenkter: Wunschliste eintragen, Agent aufrufen
- [ ] 3.3 Ergebnisseite mit Begründung, Preis inklusive Versand, Datensignalen, Rückfrage
- [ ] 3.4 Button "Jetzt selbst jemanden beschenken"

## 4. Mobile

- [ ] 4.1 Ergebnis-Screen per ID oder Deep Link
- [ ] 4.2 Simulator-Build, Test auf zwei Simulatoren
- [ ] 4.3 EAS Update und lokaler Build für TestFlight

## 5. Abgabe

- [ ] 5.1 Deploy auf Vercel, öffentlicher Demo-Link
- [ ] 5.2 Nebius-Notiz, Norma-Notiz, Pitch
