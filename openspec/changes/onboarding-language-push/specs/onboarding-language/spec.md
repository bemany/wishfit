## ADDED Requirements

### Requirement: Sprachwahl im Onboarding
Die App SHALL beim ersten Start ein Onboarding zeigen, das zuerst zwischen Deutsch und English wählen lässt. Vorausgewählt MUST die Gerätesprache sein (Deutsch bei deutscher Gerätesprache, sonst English).

#### Scenario: Erster Start
- **WHEN** die App zum ersten Mal startet
- **THEN** zeigt sie die Sprachwahl, danach einen kurzen Einstieg und die Frage nach Mitteilungen, und merkt sich, dass das Onboarding erledigt ist

#### Scenario: Sprache später ändern
- **WHEN** jemand im Profil die Sprache wechselt
- **THEN** wechselt die ganze Oberfläche sofort und der Agent antwortet ab der nächsten Nachricht in dieser Sprache

### Requirement: Zweisprachige Oberfläche
Die App SHALL alle sichtbaren Texte in Deutsch und Englisch anbieten und für Anfragen an den Agenten die gewählte Sprache als `language` senden. Ist der Nutzer angemeldet, MUST die Sprache im Konto gespeichert werden (`PUT /me/settings`).

#### Scenario: Deutsch gewählt
- **WHEN** Deutsch gewählt ist
- **THEN** sind Knöpfe, Hinweise und Fehlermeldungen deutsch und die Agent-Antworten kommen auf Deutsch
