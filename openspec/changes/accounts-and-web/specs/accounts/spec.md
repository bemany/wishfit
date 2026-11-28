## ADDED Requirements

### Requirement: Einmalcode anfordern
Das System SHALL für eine E-Mail-Adresse einen 6-stelligen Einmalcode erzeugen, nur als Hash speichern, 10 Minuten gültig halten und per Mail verschicken. Die Antwort MUST für bekannte und unbekannte Adressen gleich aussehen.

#### Scenario: Code anfordern
- **WHEN** ein Client `POST /auth/request-code` mit einer gültigen E-Mail-Adresse aufruft
- **THEN** antwortet das System mit 204, ein neuer Code ersetzt einen offenen alten, und eine Mail mit dem Code geht an die Adresse

#### Scenario: Zu viele Anforderungen
- **WHEN** für dieselbe Adresse innerhalb von 60 Sekunden erneut oder mehr als 5-mal pro Stunde ein Code angefordert wird
- **THEN** antwortet das System mit 429 und verschickt keine Mail

#### Scenario: Testmodus ohne Mail-Zugang
- **WHEN** kein `RESEND_API_KEY` gesetzt ist
- **THEN** schreibt das System den Code ins Server-Log und liefert ihn nur bei gesetztem `AUTH_DEV_CODES=1` zusätzlich als `dev_code` in einer 200-Antwort

### Requirement: Code prüfen und Konto anlegen
Das System SHALL einen gültigen Code gegen ein Sitzungs-Token tauschen und beim ersten erfolgreichen Code ein Konto anlegen. Ein Code MUST nach Erfolg, Ablauf oder 5 Fehlversuchen ungültig sein.

#### Scenario: Erste Anmeldung registriert
- **WHEN** `POST /auth/verify` mit passender E-Mail und gültigem Code für eine unbekannte Adresse kommt
- **THEN** legt das System ein Konto an und antwortet mit `token`, `user` und `created: true`

#### Scenario: Falscher Code
- **WHEN** der Code nicht passt, abgelaufen ist oder schon 5 Fehlversuche hat
- **THEN** antwortet das System mit 401 und zählt den Fehlversuch

### Requirement: Sitzungen
Das System SHALL Sitzungs-Token zufällig erzeugen, nur als Hash speichern und 90 Tage gültig halten. Geschützte Endpunkte MUST `Authorization: Bearer <token>` verlangen und ohne gültiges Token mit 401 antworten.

#### Scenario: Abmelden
- **WHEN** ein Client `POST /auth/logout` mit gültigem Token aufruft
- **THEN** ist dieses Token danach ungültig

### Requirement: Kontodaten synchronisieren
Das System SHALL je Konto die Personen und das Profil als JSON speichern und mit einem Zeitstempel versehen. Ein Schreibvorgang mit veraltetem Stand MUST mit 409 abgelehnt werden.

#### Scenario: Daten holen und schreiben
- **WHEN** ein angemeldeter Client `GET /me/data` und danach `PUT /me/data` mit dem erhaltenen `updated_at` als `base_updated_at` aufruft
- **THEN** speichert das System die neuen Daten und liefert den neuen `updated_at`

#### Scenario: Konflikt
- **WHEN** `base_updated_at` nicht dem gespeicherten Stand entspricht
- **THEN** antwortet das System mit 409 und dem aktuellen Stand, ohne zu speichern

### Requirement: Ergebnisse gehören dem Konto
Das System SHALL ein Ergebnis dem Konto zuordnen, wenn `/recommend` mit gültigem Token aufgerufen wird. `GET /results/{id}` MUST weiter ohne Token funktionieren, damit geteilte Links und Deep Links gehen.

#### Scenario: Ergebnis mit Konto
- **WHEN** `/recommend` mit gültigem Token aufgerufen wird
- **THEN** speichert das System das Ergebnis mit der Konto-ID

### Requirement: Konto löschen
Das System SHALL ein Konto auf Wunsch samt Sitzungen, Kontodaten und Zuordnung der Ergebnisse löschen.

#### Scenario: Löschen
- **WHEN** ein angemeldeter Client `DELETE /me` aufruft
- **THEN** sind Konto, Sitzungen und Kontodaten gelöscht und die Ergebnisse tragen keine Konto-ID mehr

### Requirement: Datenbank-Migrationen
Das System SHALL sein Schema beim ersten Zugriff idempotent anlegen und parallele Kaltstarts gegeneinander sperren.

#### Scenario: Paralleler Kaltstart
- **WHEN** mehrere Instanzen gleichzeitig zum ersten Mal auf die Datenbank zugreifen
- **THEN** schlägt keine Anfrage wegen der Schema-Anlage fehl
