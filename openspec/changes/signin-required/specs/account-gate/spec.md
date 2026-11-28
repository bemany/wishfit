## ADDED Requirements

### Requirement: Anmeldung vor Nutzung
Die App SHALL ohne gültige Session nur Onboarding und Anmeldung zeigen und SHALL nach erfolgreicher Anmeldung in die App führen.

#### Scenario: Erster Start
- **WHEN** jemand die App zum ersten Mal öffnet
- **THEN** folgen Sprache, Einstieg und Anmeldung per E-Mail-Code, bevor die Startseite erscheint

#### Scenario: Abgemeldet
- **WHEN** der Nutzer sich abmeldet, sein Konto löscht oder der Server 401 meldet
- **THEN** zeigt die App den Anmelde-Bildschirm statt der Startseite

#### Scenario: Neuer Nutzer
- **WHEN** eine unbekannte E-Mail den Code bestätigt
- **THEN** ist das Konto angelegt und der Nutzer angemeldet (ein Weg für Registrieren und Anmelden)

### Requirement: Deep Links über die Anmeldung hinweg
Die App SHALL einen Profil- oder Push-Link, der vor der Anmeldung geöffnet wird, nach der Anmeldung öffnen.

#### Scenario: Freundes-Link ohne Konto
- **WHEN** jemand ohne Konto einen Profillink öffnet
- **THEN** sieht er die Vorschau, „Als Freund hinzufügen" führt zur Anmeldung (beim ersten Start über das Onboarding), danach ist der Freund hinzugefügt und sein Chat offen

#### Scenario: Push ohne Konto
- **WHEN** eine Mitteilung zu einer Person geöffnet wird, während niemand angemeldet ist
- **THEN** öffnet die App nach der Anmeldung den Chat dieser Person, sobald sie aus dem Konto geladen ist

### Requirement: Lokale Daten bleiben
Beim ersten Anmelden SHALL die App lokal vorhandene Personen und Profil mit dem Konto zusammenführen.

#### Scenario: Bestehender Nutzer ohne Konto
- **WHEN** ein Nutzer mit lokalen Personen das Update startet und sich anmeldet
- **THEN** sind seine Personen danach im Konto und auf dem Gerät vorhanden

#### Scenario: Abmelden leert das Gerät
- **WHEN** der Nutzer sich abmeldet oder sein Konto löscht
- **THEN** überträgt die App zuerst offene Änderungen ins Konto und entfernt danach Personen und Profil vom Gerät, damit sie bei einer anderen Anmeldung nicht in ein fremdes Konto gelangen; bei 401 bleiben sie für dasselbe Konto erhalten

### Requirement: Sprache gehört zum Konto
Die App SHALL die im Konto gespeicherte Sprache übernehmen und SHALL Sprachwechsel im Konto speichern.

#### Scenario: Neues Gerät
- **WHEN** sich jemand auf einem neuen Gerät mit einem bestehenden Konto anmeldet, dessen Sprache gesetzt ist
- **THEN** wechselt die Oberfläche in die Kontosprache, auch wenn auf dem Gerät vorher eine andere gewählt war

#### Scenario: Neues Konto oder keine Sprache
- **WHEN** ein Konto neu angelegt wird oder noch keine Sprache hat
- **THEN** speichert die App die aktuelle App-Sprache im Konto (PUT /me/settings)

#### Scenario: Auf anderem Gerät geändert
- **WHEN** die App mit Session startet und `GET /me` eine andere Sprache liefert als die lokale
- **THEN** übernimmt die App die Kontosprache; ein Wechsel unter „Ich" wird weiter per PUT /me/settings gespeichert
