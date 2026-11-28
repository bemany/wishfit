# Gestaltete Anmelde-Mail und robustere Anmeldung

## Why
Esrefs Test mit Build 5 (28.11.2026, während eines Telefonats): Die Code-Mail ist reiner Text auf Englisch; die Anmeldung zeigte „Server nicht erreichbar", obwohl `/auth/verify` mit 200 antwortete; die App registrierte das Gerät alle 2 s neu (Wechsel Vordergrund/Hintergrund); der Platzhalter „A wish in your own words" wird auf dem Gerät ohne Leerzeichen gequetscht dargestellt.

## What Changes
- Code-Mail als HTML im Gift-Tag-Stil (Anhänger mit großem Code, Farben und Schriften der App, Fallback-Schriften), Betreff und Text auf Deutsch oder Englisch nach `language`, Text-Teil bleibt.
- Push-Registrierung nur, wenn sich Token oder Session geändert haben (höchstens einmal pro Session und Token, kein POST bei jedem Vordergrund-Wechsel).
- Anmeldung: Bei Netzfehler während `verify` klare Meldung mit Knopf „Neuen Code senden"; kurze automatische Wiederholung, wenn die App nur kurz im Hintergrund war.
- Platzhalter in einzeiligen Eingaben werden auf dem Gerät korrekt mit Leerzeichen dargestellt.

## Impact
services/agent/mail.py (+ selfcheck), apps/mobile (push.ts, account.ts, account-ui.tsx, ui.tsx/screens.tsx), docs/api.md falls nötig.
