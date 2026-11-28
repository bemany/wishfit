## ADDED Requirements

### Requirement: Admin-Zugang
Das Backend SHALL `/admin/*` nur für angemeldete Nutzer aus `ADMIN_EMAILS` mit normaler (nicht impersonierter) Session erlauben.

#### Scenario: Normaler Nutzer
- **WHEN** ein Nutzer ohne Admin-Rolle `/admin/users` aufruft
- **THEN** antwortet das Backend mit 403

### Requirement: Impersonation
Ein Admin SHALL für einen Nutzer eine 30 Minuten gültige Session starten können, die wie der Nutzer handelt, aber keine Admin-Endpunkte, kein Konto-Löschen und keine Geräte-Registrierung erlaubt; Start, Ende und schreibende Aufrufe SHALL protokolliert werden.

#### Scenario: Konto löschen verboten
- **WHEN** mit einer Impersonations-Session `DELETE /me` aufgerufen wird
- **THEN** antwortet das Backend mit 403 und das Konto bleibt

#### Scenario: Ablauf
- **WHEN** 30 Minuten vergangen sind
- **THEN** ist die Impersonations-Session ungültig (401)

### Requirement: Simulator in der Admin-Konsole
Die Admin-Konsole SHALL die App im Handy-Rahmen als gewählter Nutzer zeigen, mit sichtbarem Hinweis und getrenntem Speicher.

#### Scenario: Admin-Daten bleiben getrennt
- **WHEN** der Admin einen Nutzer im Simulator ansieht und danach die App normal öffnet
- **THEN** sind seine eigenen Personen und seine Session unverändert

### Requirement: Übersicht
Die Admin-Konsole SHALL Nutzer mit Kennzahlen, Nutzer-Details, Ergebnisse mit Trace, Test-Push, Cron-Start und das Protokoll zeigen.

#### Scenario: Test-Push
- **WHEN** der Admin bei einem Nutzer mit Gerät „Test-Push" auslöst
- **THEN** meldet die Konsole die Zahl der erreichten Geräte
