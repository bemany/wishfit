## ADDED Requirements

### Requirement: Teilbarer Link des Schenkenden
Die Webseite SHALL aus Name, Budget und Anlass einen teilbaren Link mit vorformuliertem Text erzeugen, ohne Login.

#### Scenario: Link erzeugen
- **WHEN** der Schenkende Name, Budget und Anlass eingibt
- **THEN** zeigt die Seite einen Link, der diese Angaben enthält, und einen kopierbaren Text

### Requirement: Wunschliste und Ergebnis
Die Webseite SHALL dem Beschenkten erlauben, Wünsche einzutragen, und das Ergebnis des Agenten vollständig anzeigen.

#### Scenario: Ergebnis anzeigen
- **WHEN** der Agent eine Empfehlung liefert
- **THEN** zeigt die Seite Top-Empfehlung, Alternativen, Begründungen, Preise inklusive Versand und Datensignale

#### Scenario: Rückfrage anzeigen
- **WHEN** der Agent `needs_clarification` liefert
- **THEN** zeigt die Seite die Gründe und die Rückfrage
