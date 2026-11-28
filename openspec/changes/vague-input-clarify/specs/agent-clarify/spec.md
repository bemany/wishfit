## ADDED Requirements

### Requirement: Rückfrage bei zu wenig Information
Der Agent SHALL bei einer ersten Nachricht ohne verwertbare Hinweise auf die Person eine gezielte Rückfrage mit Schnellantworten stellen, statt eine Empfehlung zu raten, und SHALL dafür keine Preisdaten abrufen.

#### Scenario: Vage Eingabe
- **WHEN** die erste Nachricht „Irgendwas Schönes“ lautet und keine Wunschliste, kein Freundes-Kontext und kein Foto vorliegt
- **THEN** antwortet der Agent mit `needs_clarification`, einer Frage nach Interessen oder Stil und drei Schnellantworten, ohne Preisabfrage

#### Scenario: Danach wird empfohlen
- **WHEN** der Nutzer auf die Rückfrage antwortet, auch knapp
- **THEN** liefert der Agent eine Empfehlung mit Preisen

#### Scenario: Genug Kontext
- **WHEN** die Nachricht konkrete Interessen enthält (z. B. „wandert gern, trinkt Tee“)
- **THEN** empfiehlt der Agent direkt ohne Rückfrage

#### Scenario: Obergrenze
- **WHEN** die vage Rückfrage gestellt wurde
- **THEN** zählt sie in `clarify_streak`; insgesamt gibt es höchstens zwei Rückfragen in Folge, danach muss empfohlen werden

#### Scenario: Kontext zählt als Information
- **WHEN** der Text die App-Historie („Nachtrag:“), angehängten Kontext (Wunschliste eines Freundes) enthält oder `demo_case` gesetzt ist
- **THEN** stellt der Agent keine vage Rückfrage
