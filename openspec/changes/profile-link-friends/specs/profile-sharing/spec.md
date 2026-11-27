## ADDED Requirements

### Requirement: Wunschliste ins eigene Profil importieren
Das System SHALL aus einem Wunschlisten-Link die Produkte auslesen und als Liste mit Titel, Preis, Bild und Link liefern. Die App SHALL sie als Wünsche ins eigene Profil übernehmen, ohne Duplikate.

#### Scenario: Amazon-Wunschliste
- **WHEN** jemand im Profil einen öffentlichen Amazon-Wunschlisten-Link einfügt
- **THEN** ruft die App `POST /wishlist/import` auf und zeigt die gefundenen Produkte als Wünsche im Profil

#### Scenario: Link ohne Produkte
- **WHEN** der Link nicht unterstützt wird, privat ist oder keine Produkte liefert
- **THEN** antwortet das Backend mit 422 und einer verständlichen Meldung, das Profil bleibt unverändert

### Requirement: Eigenes Profil per Link teilen
Das System SHALL angemeldeten Nutzern einen öffentlichen Profillink mit zufälligem Slug geben. Das Profil MUST nur öffentlich sein, solange der Nutzer das Teilen eingeschaltet hat.

#### Scenario: Teilen einschalten
- **WHEN** ein angemeldeter Nutzer „Share my profile“ tippt
- **THEN** ruft die App `POST /me/share` auf, erhält Slug und Link und öffnet das Teilen-Menü mit dem Link

#### Scenario: Teilen beenden
- **WHEN** der Nutzer das Teilen beendet (`DELETE /me/share`)
- **THEN** liefert `GET /profiles/{slug}` 404

#### Scenario: Nicht angemeldet
- **WHEN** jemand ohne Konto teilen will
- **THEN** führt die App ihn zuerst zur Anmeldung

### Requirement: Öffentliches Profil lesen
Das System SHALL unter `GET /profiles/{slug}` ohne Anmeldung nur Name, Farbe, Wünsche und Änderungszeit liefern.

#### Scenario: Keine privaten Daten
- **WHEN** ein öffentliches Profil abgerufen wird
- **THEN** enthält die Antwort weder E-Mail noch Konto-ID noch Personen oder Verläufe

### Requirement: Als Freund hinzufügen
Die App SHALL einen Profillink (`wishloop://u/<slug>` oder `…/u/<slug>` im Web) mit einer Profilansicht und „Add as friend“ öffnen. Das Hinzufügen MUST eine Person mit Name, Farbe und `friendSlug` anlegen; ist sie schon vorhanden, öffnet die App sie statt sie doppelt anzulegen.

#### Scenario: Freund hinzufügen
- **WHEN** jemand den Link öffnet und „Add as friend“ tippt
- **THEN** erscheint die Person bei den Tags und ihre Wünsche sind beim Chat mit dem Agenten als Kontext dabei

#### Scenario: Wünsche aktualisieren
- **WHEN** eine Person mit `friendSlug` geöffnet wird
- **THEN** lädt die App das öffentliche Profil neu und übernimmt geänderte Wünsche; liefert das Backend 404, bleibt die Person erhalten und die App zeigt, dass das Profil nicht mehr geteilt wird

### Requirement: Preistracker für Wünsche
Das System SHALL für Wünsche aktuelle idealo-Daten liefern: bester Preis, Anzahl Shops mit Angebot, Verfügbarkeit, 30-Tage-Trend (fallend, stabil, steigend) und Prüfzeitpunkt. Die App SHALL jede Wunschzeile wie im Design `TagMe` mit Herkunft und Preisstatus zeigen und die Preise beim Öffnen des Profils aktualisieren, wenn sie älter als 6 Stunden sind.

#### Scenario: Wunsch mit Preisdaten
- **WHEN** das Profil geöffnet wird und ein Wunsch bei idealo gefunden wird
- **THEN** zeigt die Zeile den Preis und z. B. „From my Amazon wishlist · in stock at 9 shops“ oder „price down 8 % in 30 days“

#### Scenario: Wunsch ohne Treffer
- **WHEN** idealo zu einem Wunsch nichts findet
- **THEN** zeigt die Zeile „no price data yet“ und keinen Preis

#### Scenario: Freundesprofil
- **WHEN** jemand das Profil eines Freundes öffnet
- **THEN** sieht er dieselben Preisangaben der Wünsche
