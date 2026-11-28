## ADDED Requirements

### Requirement: Anmelden mit E-Mail und Code
Die App SHALL eine Anmeldung aus dem Profil heraus anbieten: E-Mail eingeben, Code anfordern, 6-stelligen Code eingeben. Das Token MUST auf iOS im Schlüsselbund und im Web im lokalen Speicher liegen.

#### Scenario: Erfolgreiche Anmeldung
- **WHEN** jemand E-Mail und den richtigen Code eingibt
- **THEN** ist die App angemeldet, zeigt die E-Mail im Profil und gleicht die Daten mit dem Konto ab

#### Scenario: Falscher Code oder zu viele Versuche
- **WHEN** der Server 401 oder 429 meldet
- **THEN** zeigt die App eine verständliche Meldung und lässt einen neuen Versuch bzw. einen neuen Code zu

### Requirement: Abgleich lokaler Daten
Die App SHALL beim Anmelden lokale und Kontodaten zusammenführen und danach jede Änderung an Personen oder Profil an das Konto senden. Ohne Anmeldung MUST die App wie bisher nur lokal arbeiten.

#### Scenario: Erste Anmeldung mit lokalen Daten
- **WHEN** das Konto leer ist und auf dem Gerät Personen liegen
- **THEN** lädt die App die lokalen Personen und das Profil ins Konto

#### Scenario: Anmeldung auf zweitem Gerät
- **WHEN** Konto und Gerät beide Personen haben
- **THEN** führt die App beide nach Personen-ID zusammen, bei gleicher ID gewinnt der neuere Stand (`updatedAt`)

#### Scenario: Konflikt beim Schreiben
- **WHEN** der Server 409 meldet
- **THEN** führt die App den Serverstand mit dem lokalen zusammen und schreibt erneut

### Requirement: Abmelden und Konto löschen
Die App SHALL im Profil Abmelden und Konto löschen anbieten. Konto löschen MUST vorher bestätigt werden.

#### Scenario: Konto löschen
- **WHEN** jemand Konto löschen bestätigt
- **THEN** ruft die App `DELETE /me` auf, meldet sich ab und behält die Daten nur lokal auf dem Gerät
