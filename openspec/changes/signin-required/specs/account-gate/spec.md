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
- **THEN** sieht er die Vorschau, „Als Freund hinzufügen" führt zur Anmeldung und danach zurück zum Profil

### Requirement: Lokale Daten bleiben
Beim ersten Anmelden SHALL die App lokal vorhandene Personen und Profil mit dem Konto zusammenführen.

#### Scenario: Bestehender Nutzer ohne Konto
- **WHEN** ein Nutzer mit lokalen Personen das Update startet und sich anmeldet
- **THEN** sind seine Personen danach im Konto und auf dem Gerät vorhanden
