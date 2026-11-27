## 1. Grundlagen (Lead)

- [x] 1.1 Neon `wishfit-db` (Free, fra1) am Vercel-Projekt `wishfit-agent-test` anlegen und verbinden
- [x] 1.2 OpenSpec-Change mit API-Vertrag (design.md) anlegen
- [x] 1.3 API-Vertrag in `docs/api.md` übernehmen
- [x] 1.4 `AUTH_SECRET` und `AUTH_DEV_CODES=1` am Test-Backend setzen

## 2. Backend: Konten und Datenbank (Paket A, `services/agent`)

- [ ] 2.1 `db.py`: Verbindung, `migrate()` mit Advisory-Lock, Schema aus design.md, In-Memory-Ersatz ohne `DATABASE_URL`
- [ ] 2.2 `storage.py` auf `db.py` umstellen, `results.user_id`
- [ ] 2.3 `mail.py`: Resend-HTTP-Versand, Testmodus mit Log und optional `dev_code`
- [ ] 2.4 `auth.py`: request-code (Rate-Limit), verify (Konto anlegen), logout, Bearer-Abhängigkeit
- [ ] 2.5 `/me`, `DELETE /me`, `GET/PUT /me/data` mit 409 und Größenlimit
- [ ] 2.6 `/recommend` mit optionalem Token, `user_id` speichern
- [ ] 2.7 `selfcheck.py` um Auth-, Sync- und Löschfälle erweitern (ohne Postgres), plus ein Lauf gegen eine echte Postgres-URL
- [ ] 2.8 Deploy auf `wishfit-agent-test`, Test mit curl (Code im Testmodus, Sync, 409, Löschen, parallele Kaltstarts)

## 3. App: Anmeldung und Sync (Paket B, `apps/mobile/src`)

- [ ] 3.1 `src/storage.ts` und `src/storage.web.ts` (JSON-Dateien bzw. localStorage; Token in `expo-secure-store` bzw. localStorage), `api.ts` darauf umstellen
- [ ] 3.2 `updatedAt` an Personen und Profil, bei jeder Änderung setzen
- [ ] 3.3 Auth-Client (request-code, verify, logout, delete) und Token im Request-Header
- [ ] 3.4 Sync: beim Start und nach Anmeldung holen, zusammenführen, Änderungen entprellt schreiben, 409 behandeln
- [ ] 3.5 Profil: Anmelden (E-Mail, Code), angemeldet-Zustand, Abmelden, Konto löschen mit Bestätigung
- [ ] 3.6 `tsc` sauber, Ablauf im Simulator gegen das Test-Backend geprüft

## 4. Webversion als PWA (Paket C, `apps/mobile` Web-Teil)

- [x] 4.1 Abhängigkeiten `react-dom`, `react-native-web`, `@expo/metro-runtime` fest eintragen
- [x] 4.2 `src/speech.web.ts` (Web Speech API), `src/platform.ts`/`.web.ts` für Links und Teilen, Einstellungen-Knopf im Web ausblenden
- [x] 4.3 `app.json` web-Abschnitt, `public/manifest.webmanifest`, Icons, `public/sw.js`, Registrierung nur im Web
- [x] 4.4 Vercel-Projekt `wishfit-web-test` (statisch, SPA-Rewrite), Deploy-Skript
- [ ] 4.5 Im Headless-Chrome mit Handy-Größe prüfen: Start, Person anlegen, neu laden, Chat gegen Test-Backend (Start, Person, Chat gegen Test-Backend geprüft; "neu laden" wartet auf storage.web.ts aus Paket B)

## 5. Abschluss (Lead)

- [ ] 5.1 PRs zusammenführen, Review (Auth: Opus-Reviewer)
- [ ] 5.2 App-Build 3 zu TestFlight intern
- [ ] 5.3 Resend-Key einspielen, `AUTH_DEV_CODES` entfernen
