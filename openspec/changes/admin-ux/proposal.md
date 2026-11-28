# Admin-Konsole: Bedienung

## Why
Esrefs erste Nutzung der Admin-Konsole (28.11.2026): Die Reiter oben sind unübersichtlich, Tabellen lassen sich weder sortieren noch filtern und laufen bei schmalen Bereichen über, der Simulator verdeckt als Overlay die Seite, und jeder Reiterwechsel lädt spürbar nach.

## What Changes
- Navigation als Seitenleiste links (Nutzer, Ergebnisse, Herkunft, Kosten, Werkzeuge, Protokoll), oben nur Kopfzeile mit Admin-Adresse; mobil einklappbar.
- Alle Tabellen sortierbar (Klick auf Spaltenkopf, auf/ab) und filterbar (Suchfeld plus spaltenbezogene Filter, z. B. Status, Modell, Quelle, Zeitraum); Spaltenbreiten passen sich dem Container an (flex, kein Überlauf, lange Werte gekürzt mit Tooltip).
- „Als Nutzer ansehen" öffnet den Simulator als angedockte Spalte rechts in der Seite (wie der iOS-Simulator neben dem Chat in OpenChamber), die Konsole bleibt links benutzbar; Spalte schließbar, Breite gemerkt.
- Daten vorladen und zwischenspeichern: beim Öffnen der Konsole alle Übersichten parallel laden, Cache mit „stale-while-revalidate" (sofort anzeigen, im Hintergrund auffrischen), Vorladen von Nutzer-Details beim Überfahren einer Zeile.

## Impact
apps/mobile/src/admin*.web.tsx (nur Web). Kein Backend nötig, solange die bestehenden Endpunkte reichen; Sortierung/Filter clientseitig über die geladenen Seiten (Grenze 500 Zeilen), sonst Hinweis.
