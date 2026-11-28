# Schnellere Empfehlungen mit Apify

## Warum
Mit `PRICE_SOURCE=apify` dauert eine Empfehlung 44 bis 100 Sekunden, teils läuft sie ins Zeitlimit. Fast die ganze Zeit geht an Actor-Läufe (15–45 s je Suche). Der Preis-Cache liegt nur im Speicher einer Serverless-Instanz und hilft deshalb kaum.

## Was sich ändert
- Gemeinsamer Such-Cache in Postgres (Tabelle `price_search_cache`, Schlüssel normalisierte Suchanfrage, 24 h gültig), genutzt von `/recommend`, `/wishes/price` und Cron. Ohne DB bleibt der Speicher-Cache.
- Weniger Läufe pro Empfehlung: höchstens 2 Suchen im Apify-Pfad, doppelte oder sehr ähnliche Ideen werden vorher zusammengelegt.
- Schnellerer Actor-Aufruf (synchroner Endpunkt bzw. kürzeres Polling, Speicher/Parameter nach Messung).
- Zeitmessung je Schritt im Trace (understand, Suchen, decide), damit die Admin-Konsole zeigt, wo die Zeit hingeht.

## Ziel
Warmer Cache: Empfehlung unter 20 s. Kalter Cache: unter 45 s, kein Abbruch durch Zeitlimit.

## Nicht Teil
Preisverlauf (bleibt aus), Streaming von Zwischenständen, idealo-MCP-Pfad (unverändert).
