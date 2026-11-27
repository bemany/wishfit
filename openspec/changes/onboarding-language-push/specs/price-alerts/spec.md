## ADDED Requirements

### Requirement: Gerät für Mitteilungen registrieren
Die App SHALL nach erteilter Erlaubnis den APNs-Gerätetoken beim Konto registrieren und ihn beim Abmelden und Löschen entfernen. Ohne Konto MUST keine Registrierung stattfinden.

#### Scenario: Erlaubnis erteilt
- **WHEN** ein angemeldeter Nutzer Mitteilungen erlaubt
- **THEN** ruft die App `POST /me/devices` mit Token und Plattform auf

#### Scenario: Abmelden
- **WHEN** der Nutzer sich abmeldet
- **THEN** ruft die App vorher `DELETE /me/devices/{token}` auf

### Requirement: Täglicher Preis-Check
Das System SHALL einmal am Tag für jedes Konto mit registriertem Gerät die Wünsche seiner Freunde und seine gepinnten Produkte über idealo prüfen und die Ergebnisse speichern. Der Aufruf MUST nur mit dem Cron-Geheimnis möglich sein und die idealo-Grenze von 3 Aufrufen pro Sekunde einhalten.

#### Scenario: Unbefugter Aufruf
- **WHEN** `POST /cron/daily` ohne gültiges `Authorization: Bearer <CRON_SECRET>` kommt
- **THEN** antwortet das System mit 401 und tut nichts

### Requirement: Push bei Preisfall, Verfügbarkeit und Anlass
Das System SHALL eine Mitteilung schicken, wenn ein geprüfter Preis seit der letzten Prüfung um mindestens 10 % gefallen ist, ein Produkt wieder verfügbar ist oder ein Anlass mit Datum in 7 Tagen ist. Es MUST höchstens eine zusammengefasste Mitteilung pro Konto und Tag schicken, in der Sprache des Kontos, und dieselbe Meldung nicht wiederholen.

#### Scenario: Preisfall bei einem Freund
- **WHEN** der Wunsch eines Freundes von 50 € auf 42 € fällt
- **THEN** bekommt der Nutzer eine Mitteilung wie „Hario Mini Mill für Lea: 42 € statt 50 €“; Tippen öffnet die Person

#### Scenario: Anlass naht
- **WHEN** der Geburtstag einer Person mit Datum in 7 Tagen ist
- **THEN** bekommt der Nutzer eine Erinnerung mit dem besten aktuellen Vorschlag oder dem Hinweis, nach einer Idee zu fragen

#### Scenario: Ungültiger Token
- **WHEN** APNs einen Token als ungültig meldet (410 oder BadDeviceToken)
- **THEN** entfernt das System das Gerät
