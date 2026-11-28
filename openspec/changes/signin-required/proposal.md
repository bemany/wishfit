# Anmeldung ist Pflicht

## Why
Esref (28.11.2026): Nutzer sollen sich direkt registrieren oder anmelden; die App soll nicht ohne Konto nutzbar sein. Ohne Konto gibt es keinen Profillink, keinen Sync und keine Push-Mitteilungen – also fehlt der Kern der App.

## What Changes
- Onboarding: Sprache → kurzer Einstieg → **Registrieren/Anmelden per E-Mail-Code** (ein Weg für neue und bestehende Nutzer) → Mitteilungen erlauben (nur iOS) → App.
- Ohne gültige Session zeigt die App nur den Anmelde-Bildschirm (auch nach Abmelden, Konto löschen oder abgelaufener Session/401). Deep Links (`/u/<slug>`, Push) werden gemerkt und nach der Anmeldung geöffnet; ein fremdes Profil darf vorher als Vorschau sichtbar sein, „Als Freund hinzufügen" verlangt Anmeldung.
- Bestehende lokale Daten (Personen, Profil) werden beim ersten Anmelden mit dem Konto zusammengeführt (vorhandene Sync-Logik), nichts geht verloren.
- Texte wie „Deine Anhänger bleiben auf diesem Handy" und „Anmelden und synchronisieren" entfallen bzw. werden zu Konto-Texten; unter „Ich" bleiben Abmelden und Konto löschen.
- Gilt für iOS und Web-App gleich.

## Impact
apps/mobile (App.tsx, src/onboarding.tsx, src/account*.ts(x), src/screens.tsx, src/profile.tsx, src/i18n.ts). Kein Backend-Umbau (Endpunkte existieren). Hinweis: Für eine spätere App-Store-Einreichung (nicht interner Test) verlangt Apple bei Pflichtkonto die Konto-Löschung in der App – ist vorhanden.
