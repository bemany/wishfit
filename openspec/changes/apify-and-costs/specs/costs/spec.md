## ADDED Requirements

### Requirement: Kostenerfassung
Das Backend SHALL für jede Anfrage die Kosten für Modell, Apify, Mail und Push erfassen, und die Admin-Konsole SHALL sie nach Zeitraum, Quelle und Nutzer zeigen.

#### Scenario: Empfehlung
- **WHEN** eine Empfehlung mit zwei Modellaufrufen und einem Apify-Lauf entsteht
- **THEN** stehen drei Kosten-Ereignisse mit Betrag, Ergebnis-ID und Nutzer in der Tabelle

#### Scenario: Apify-Guthaben knapp
- **WHEN** ein Apify-Konto unter 1 $ Restguthaben hat
- **THEN** zeigt die Seite „Kosten“ eine Warnung
