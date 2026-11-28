## ADDED Requirements

### Requirement: Gestaltete Code-Mail
Die Anmelde-Mail SHALL als HTML im Stil der App mit gut lesbarem Code und als Text-Alternative verschickt werden, in der Sprache der Anfrage (de/en).

#### Scenario: Deutsche Anfrage
- **WHEN** `/auth/request-code` mit `language: "de"` kommt
- **THEN** sind Betreff und Text deutsch und der Code steht groß auf einem Anhänger

### Requirement: Sparsame Push-Registrierung
Die App SHALL ein Gerät nur registrieren, wenn Token oder Session neu sind.

#### Scenario: Vordergrund-Wechsel
- **WHEN** die App mehrfach zwischen Vorder- und Hintergrund wechselt, ohne dass sich Token oder Session ändern
- **THEN** geht kein weiterer `POST /me/devices` raus

### Requirement: Anmeldung bei Netzfehler
Die App SHALL bei einem Netzfehler während der Code-Prüfung eine verständliche Meldung und einen Weg zu einem neuen Code anbieten.

#### Scenario: Antwort verloren
- **WHEN** `verify` wegen Netzfehlers keine Antwort bekommt
- **THEN** zeigt die App „Verbindung unterbrochen" und „Neuen Code senden"

### Requirement: Platzhalter korrekt dargestellt
Einzeilige Eingabefelder SHALL ihren Platzhalter mit normalen Wortabständen zeigen.

#### Scenario: Wunsch hinzufügen
- **WHEN** das Feld „Wunsch hinzufügen" leer ist
- **THEN** steht „A wish in your own words" bzw. „Ein Wunsch in deinen Worten" mit Leerzeichen da
