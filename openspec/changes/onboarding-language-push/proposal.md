## Why

Die App ist nur englisch und hat kein Onboarding. Esref (28.11.): Beim ersten Start soll man Englisch oder Deutsch wählen. Außerdem soll der Server einmal am Tag die Preise prüfen und per Push melden, wenn sich etwas lohnt.

## What Changes

- **Onboarding beim ersten Start**: Sprache wählen (Deutsch, English), kurzer Einstieg, Erlaubnis für Mitteilungen erfragen. Später im Profil änderbar.
- **Zweisprachige Oberfläche**: alle Texte der App in Deutsch und Englisch; die gewählte Sprache geht auch als `language` an den Agenten und an das Konto (für Push-Texte und Code-Mails).
- **Täglicher Preis-Check auf dem Server** (Vercel Cron): für Wünsche von Freunden (Personen mit `friendSlug`) und gepinnte Produkte aller Konten mit Push-Erlaubnis.
- **Push-Mitteilungen** (APNs, Team-Schlüssel `Y247QD67CF` mitgenutzt): Preisfall um mindestens 10 % oder wieder verfügbar, und Erinnerung 7 Tage vor einem Anlass mit Datum. Höchstens eine zusammengefasste Mitteilung pro Konto und Tag.
- **Anlass mit Datum** an der Person (optional), damit die Erinnerung möglich ist.

## Capabilities

### New Capabilities

- `onboarding-language`: Onboarding, Sprachwahl, zweisprachige Oberfläche.
- `price-alerts`: Geräte-Registrierung, täglicher Preis-Check, Push-Mitteilungen.

### Modified Capabilities

(keine Hauptspecs; baut auf `accounts-and-web` und `profile-link-friends` auf)

## Impact

- App: Onboarding-Screen, Übersetzungstabelle, `expo-notifications` (neues natives Modul, neuer Build nötig), Push-Fähigkeit der App-ID `app.wishfit.ios`, Datum am Anlass.
- Backend: Tabellen `devices` und `alert_log`, Endpunkte `PUT /me/settings`, `POST/DELETE /me/devices`, `POST /cron/daily` (geschützt), APNs-Versand.
- Vercel: Cron-Eintrag (einmal täglich), Variablen `APNS_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_TOPIC`, `CRON_SECRET`.
- Nicht im Umfang: Android-Push, Web-Push, weitere Sprachen, Push für eigene Wünsche.
