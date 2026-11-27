## ADDED Requirements

### Requirement: Empfehlung aus Wunschliste und Budget
Das System SHALL für eine Wunschliste, ein Budget und einen Anlass genau eine Top-Empfehlung und zwei bis drei Alternativen liefern, jeweils mit Begründung, Preis inklusive Versand und den Datensignalen, die die Entscheidung tragen.

#### Scenario: Einfacher Fall
- **WHEN** ein Wunsch eindeutig ist, lieferbar ist und inklusive Versand im Budget liegt
- **THEN** antwortet das System mit `status` `recommendation`, einer Top-Empfehlung mit `action` `buy`, `wait` oder `alternative` und mindestens einem Eintrag in `signals`

### Requirement: Unsicherheit wird benannt
Das System SHALL bei fehlenden oder widersprüchlichen Daten begründen, warum es unsicher ist, und eine Rückfrage stellen.

#### Scenario: Ungenauer oder ausverkaufter Wunsch
- **WHEN** ein Wunsch auf mehrere Produkte passt, ausverkauft ist oder Händler stark abweichende Preise nennen
- **THEN** enthält die Antwort `uncertainty` mit mindestens einem Grund und einer Rückfrage

### Requirement: Entscheidung kommt aus einem Live-Modell-Call
Das System SHALL die Entscheidung von einem Sprachmodell in einem Live-Call treffen lassen (Stand 27.11.: über das Vercel AI Gateway) und jeden Modell-Call mit Modellname, Eingabe und Ausgabe speichern.

#### Scenario: Trace abrufen
- **WHEN** ein Client `GET /trace/{id}` für ein vorhandenes Ergebnis aufruft
- **THEN** erhält er alle Modell-Calls und idealo-Abrufe dieses Ergebnisses

### Requirement: idealo-Daten nur über den idealo-MCP
Das System SHALL Produkt-, Preis-, Verfügbarkeits- und Angebotsdaten ausschließlich über den idealo-MCP oder einen daraus gespeicherten Snapshot beziehen.

#### Scenario: Demo-Fall mit Snapshot
- **WHEN** eine Anfrage `demo_case` enthält
- **THEN** nutzt das System den gespeicherten Snapshot, und der Modell-Call läuft trotzdem live
