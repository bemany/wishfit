# Admin-Konsole mit Impersonation

## Why
Esref (28.11.2026) braucht eine Admin-Oberfläche, um Nutzer, Agent-Ergebnisse und Push zu überblicken und um zu Debug-Zwecken eine App-Sitzung eines Nutzers in einem Simulator zu sehen und zu bedienen.

## What Changes
- Admin-Rolle: E-Mail-Liste `ADMIN_EMAILS` im Backend (Start: the admin address from the deployment env); Admin meldet sich wie jeder Nutzer per Mail-Code an.
- Backend `/admin/*` (nur Admin): Nutzerliste mit Kennzahlen, Nutzer-Details, Ergebnisse und Traces (filterbar nach Nutzer), Test-Push an ein Gerät, täglicher Check von Hand, Impersonation-Sitzung starten/beenden, Protokoll.
- Impersonation: Admin startet für einen Nutzer eine eigene, kurzlebige Session (30 min, nicht verlängerbar), markiert mit `impersonated_by`. Volle Rechte wie der Nutzer (Esrefs Entscheidung), aber: keine Admin-Endpunkte, kein Konto-Löschen, keine Push-Registrierung des Admin-Geräts auf den Nutzer. Jeder Start, jedes Ende und jeder schreibende Aufruf landet im Protokoll `admin_audit`.
- Web-App `/admin` (Expo-Web, gleiche Domain): Anmeldung, Nutzerliste, Detailansicht, Traces, Push/Cron, und ein **Simulator**: die App in einem iPhone-Rahmen (iframe 390×844), als der gewählte Nutzer angemeldet, mit gut sichtbarem Hinweis „Ansicht als <E-Mail>“ und „Beenden“.
- Die Daten im Simulator liegen getrennt vom eigenen Admin-Konto (eigener Speicherbereich), damit nichts vermischt wird.

## Impact
services/agent (auth.py, db.py, neues admin.py, selfcheck, docs/api.md), apps/mobile (Web-Teil: Route /admin, storage.web.ts-Namensraum, Impersonations-Hinweis), Vercel-Env `ADMIN_EMAILS`. Nicht im nativen iOS sichtbar.

## Ergänzung: Herkunft und Einladungen (Esref, 28.11.2026)
- Beim ersten Besuch merkt sich die Web-App (und die Landingpage reicht weiter) UTM-Parameter (`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`), Referrer und Einstiegsseite (first touch).
- Wer über einen Profillink (`/u/<slug>`, `wishloop://u/<slug>`) oder einen Einladungslink (`?ref=<slug>`) kommt, wird dem einladenden Nutzer zugeordnet.
- Beim Anlegen eines Kontos (erstes `verify`) speichert das Backend Herkunft und Einlader einmalig am Nutzer; spätere Anmeldungen ändern nichts.
- Die Admin-Konsole zeigt je Nutzer Herkunft und Einlader, die Zahl der von ihm gebrachten Nutzer und eine Übersicht nach Quelle/Kampagne.
