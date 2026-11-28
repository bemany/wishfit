## Why

Wishfit läuft bisher nur auf dem iPhone und speichert Personen, Profil und Verläufe ausschließlich auf dem Gerät. Wer das Gerät wechselt oder am Rechner weitermachen will, verliert alles. Für die interne Testphase (TestFlight) und eine Webversion braucht es Konten, eine Datenbank und dieselbe App im Browser.

## What Changes

- **Konten im Agent-Backend** (`services/agent`): Registrierung und Anmeldung mit E-Mail und Einmalcode (6 Ziffern), Sitzungs-Token, Abmelden, Konto löschen. Versand der Codes über Resend (Absender bemany.tech); ohne Resend-Key Testmodus mit Code im Log.
- **Datenbank**: Neon Postgres (Free-Plan, Frankfurt) über den Vercel-Marketplace am Test-Backend `wishfit-agent-test`. Tabellen für Nutzer, Codes, Sitzungen, Kontodaten und Ergebnisse; Migrationen idempotent und gegen parallele Kaltstarts gesperrt.
- **Sync**: Personen (Tags), eigenes Profil und Ergebnisse hängen am Konto. App und Web sehen dieselben Daten. Ohne Anmeldung funktioniert die App weiter lokal.
- **App** (`apps/mobile`): Anmelde-Ablauf (E-Mail, Code), Token sicher gespeichert, Abgleich der lokalen Daten mit dem Konto, Abmelden und Konto löschen im Profil.
- **Webversion als PWA**: dieselbe Expo-App per react-native-web, mit Web-Varianten für Speicher, Diktat, Teilen und Links, Manifest und Service Worker. Hosting als eigenes Vercel-Projekt `wishfit-web-test` im Team fahrer-app (nur `*.vercel.app`).

## Capabilities

### New Capabilities

- `accounts`: Konten, Einmalcode-Anmeldung, Sitzungen, Kontodaten-Sync und Konto-Löschung im Agent-Backend; Vertrag in `docs/api.md`.
- `app-accounts`: Anmeldung und Sync in der Expo-App (iOS und Web).
- `pwa`: Webversion der Expo-App als installierbare PWA.

### Modified Capabilities

(keine; `agent-api` aus `mvp-gift-agent` bleibt kompatibel, `/recommend` nimmt optional ein Token an)

## Impact

- Code: `services/agent` (neue Module für Auth, Mail, Migrationen), `apps/mobile` (Login, Sync, Web-Varianten, PWA-Dateien), `docs/api.md`.
- Infrastruktur: Neon `wishfit-db` (angelegt 27.11.), Vercel-Projekte `wishfit-agent-test` und neu `wishfit-web-test`, Resend-Key (fehlt noch, Testmodus bis dahin).
- Nicht im Umfang: Passwörter, Social Login, Teilen zwischen Konten (Freunde, gemeinsame Listen), Android, eigene Domain, Umzug auf das Original-Projekt `wishfit-agent`.
