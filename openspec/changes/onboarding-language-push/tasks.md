## 1. App: Sprache und Onboarding (Paket G, nach Paket F)

- [ ] 1.1 `src/i18n.ts` (en/de) und alle sichtbaren Texte umstellen
- [ ] 1.2 Onboarding-Screen: Sprache, Einstieg, Mitteilungen
- [ ] 1.3 Sprachwechsel im Profil, `language` an `/recommend` und `PUT /me/settings`
- [ ] 1.4 `occasionDate` an der Person (optional, Eingabe beim Anlegen/Bearbeiten)

## 2. Backend: Push und täglicher Check (Paket H)

- [x] 2.1 Tabellen `devices`, `price_snapshots`, `alert_log`, Spalte `users.language`; Endpunkte `/me/settings`, `/me/devices`
- [x] 2.2 APNs-Versand (JWT ES256, HTTP/2), Aufräumen ungültiger Tokens
- [x] 2.3 `POST /cron/daily`: Freundes-Wünsche, Pins, Anlässe in 7 Tagen; Schwellen; eine Mitteilung pro Konto und Tag
- [x] 2.4 Vercel-Cron und Variablen (`APNS_*`, `CRON_SECRET`), Deploy, Test mit Testkonto (Cron manuell, Versand an Testtoken)

## 3. App: Push (Paket G)

- [ ] 3.1 `expo-notifications`, Plugin, Erlaubnis im Onboarding, Token registrieren/entfernen
- [ ] 3.2 Tippen auf Mitteilung öffnet Person bzw. Profil
- [ ] 3.3 Push-Fähigkeit der App-ID aktivieren (Lead, ASC-API)

## 4. Abschluss (Lead)

- [ ] 4.1 Build 3 zu TestFlight intern, Push Ende-zu-Ende auf Esrefs iPhone
