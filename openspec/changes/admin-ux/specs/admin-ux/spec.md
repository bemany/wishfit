## ADDED Requirements

### Requirement: Seitenleiste
Die Admin-Konsole SHALL ihre Bereiche in einer Seitenleiste links anbieten.

#### Scenario: Desktop
- **WHEN** die Konsole bei 1280 px Breite geöffnet wird
- **THEN** stehen die Bereiche links untereinander und der aktive ist markiert

### Requirement: Sortieren und Filtern
Jede Tabelle der Admin-Konsole SHALL nach jeder Spalte sortierbar und filterbar sein und ihre Spalten an die Containerbreite anpassen.

#### Scenario: Ergebnisse filtern
- **WHEN** der Admin in Ergebnisse nach Status „recommendation" und Modell filtert und nach Dauer sortiert
- **THEN** zeigt die Tabelle nur passende Zeilen in der gewählten Reihenfolge

### Requirement: Angedockter Simulator
„Als Nutzer ansehen" SHALL den Simulator als Spalte rechts neben der Konsole öffnen, ohne die Konsole zu verdecken.

#### Scenario: Nebeneinander
- **WHEN** der Admin einen Nutzer ansieht
- **THEN** bleiben Nutzer-Details links sichtbar und bedienbar, rechts läuft die App im Handy-Rahmen

### Requirement: Flüssige Navigation
Die Admin-Konsole SHALL Übersichten beim Start parallel vorladen und beim Reiterwechsel zwischengespeicherte Daten sofort zeigen und im Hintergrund auffrischen.

#### Scenario: Reiterwechsel
- **WHEN** der Admin nach dem ersten Laden zwischen Bereichen wechselt
- **THEN** erscheinen die Daten ohne Ladeanzeige
