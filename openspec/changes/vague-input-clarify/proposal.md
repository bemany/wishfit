# Rückfrage bei vagen Eingaben

## Why
Bei vagen Eingaben wie „Irgendwas Schönes“ empfiehlt der Agent sofort etwas Beliebiges (z. B. Socken). Esref (28.11.2026): Bei zu wenig Information soll der Agent zuerst einmal gezielt nachfragen.

## What Changes
- Der Verstehen-Schritt bewertet, ob genug über die Person bekannt ist (Interessen, Stil, Wünsche, Hinweise aus Wunschliste/Chat/Freundes-Wünschen). Reicht es nicht, antwortet der Agent mit `needs_clarification`: eine kurze, konkrete Frage plus 3 passende Schnellantworten (z. B. „Mag Outdoor“, „Eher Technik“, „Etwas Persönliches“), ohne Preisabfrage (spart Zeit und Apify-Kosten).
- Höchstens eine solche Rückfrage in Folge; danach empfiehlt der Agent auf jeden Fall (bestehende Regel „nach zwei Rückfragen muss eine Empfehlung kommen“ bleibt als Obergrenze).
- Kontext von Freundes-Profilen, Wunschlisten-Links, Fotos oder vorherigen Nachrichten zählt als Information; dann keine Rückfrage.

## Impact
services/agent/main.py (understand-Prompt/Schema, Ablauf vor fetch_idealo), selfcheck, docs/api.md (Feld für Schnellantworten, falls neu). App zeigt Rückfrage und Schnellantworten mit vorhandener Darstellung; falls neues Feld nötig, apps/mobile minimal.
