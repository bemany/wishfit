## 1. Umsetzung
- [ ] 1.1 Messung: wo geht die Zeit hin (Trace einer kalten Empfehlung), Ergebnis in design.md notieren
- [ ] 1.2 Postgres-Such-Cache (24 h), Fallback Speicher-Cache, Selfcheck
- [ ] 1.3 Höchstens 2 Suchen im Apify-Pfad, Ideen zusammenlegen, Selfcheck
- [ ] 1.4 Actor-Aufruf beschleunigen (sync-Endpunkt oder kürzeres Polling)
- [ ] 1.5 `timings_ms` im Trace, docs/api.md
## 2. Prüfung
- [ ] 2.1 selfcheck grün, openspec validate --all
- [ ] 2.2 Live: dieselbe Empfehlung kalt und warm, Zeiten im PR (höchstens 6 Empfehlungen)
