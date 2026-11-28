## ADDED Requirements

### Requirement: Schnelle Empfehlung mit Apify
Das Backend SHALL Suchergebnisse instanzübergreifend 24 Stunden zwischenspeichern und im Apify-Pfad höchstens zwei Suchen pro Empfehlung starten.

#### Scenario: Warmer Cache
- **WHEN** dieselbe Suche innerhalb von 24 Stunden erneut gebraucht wird
- **THEN** startet kein Actor-Lauf, der Trace markiert den Treffer mit `cache: true`, und die Empfehlung kommt in unter 20 Sekunden

#### Scenario: Kalter Cache
- **WHEN** keine der Suchen im Cache liegt
- **THEN** laufen höchstens zwei Actor-Läufe parallel und die Empfehlung kommt in unter 45 Sekunden

#### Scenario: Zeitmessung
- **WHEN** eine Empfehlung entsteht
- **THEN** enthält der Trace `timings_ms` für understand, Suche, decide und gesamt
