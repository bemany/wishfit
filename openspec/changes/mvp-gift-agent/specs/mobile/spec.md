## ADDED Requirements

### Requirement: Ergebnis in der App
Die App SHALL ein Ergebnis anhand seiner ID vom Agent-Backend laden und mit denselben Inhalten wie die Webseite anzeigen.

#### Scenario: Ergebnis per ID öffnen
- **WHEN** die App mit einer Ergebnis-ID oder dem Link `wishloop://results/{id}` geöffnet wird
- **THEN** lädt sie `GET /results/{id}` und zeigt Top-Empfehlung, Alternativen und Datensignale

#### Scenario: Backend nicht erreichbar
- **WHEN** das Backend nicht antwortet
- **THEN** zeigt die App eine Fehlermeldung und eine Möglichkeit, es erneut zu versuchen
