## ADDED Requirements

### Requirement: Install-Banner
Die Web-App SHALL im Browser (nicht installiert) ein Banner mit App-Icon, Satz und „Installieren" zeigen, das das Installations-Sheet öffnet oder den Systemdialog startet.

#### Scenario: Banner schließen
- **WHEN** der Nutzer das Banner schließt
- **THEN** erscheint es 7 Tage nicht automatisch

### Requirement: Geführte Schritte je Browser
Das Sheet SHALL eine App-Karte und nummerierte Schritte mit den Bedienelementen des erkannten Browsers als Chips zeigen.

#### Scenario: iOS Safari mit kompakter Leiste
- **WHEN** die App in Safari auf iOS 26 oder neuer läuft
- **THEN** zeigen die Schritte Menü-Symbol, „Teilen", „Mehr anzeigen" und „Zum Home-Bildschirm"

#### Scenario: Android Chrome
- **WHEN** der Browser `beforeinstallprompt` meldet
- **THEN** startet „Installieren" direkt den Systemdialog

#### Scenario: Unbekannter Browser
- **WHEN** der Browser nicht erkannt wird
- **THEN** zeigt das Sheet allgemeine Schritte und den Hinweis auf Safari bzw. Chrome

### Requirement: Ein Installations-Link
Die Web-App SHALL unter `/install` direkt das Installations-Sheet öffnen, und die Landingpage SHALL dorthin verlinken.

#### Scenario: Link von der Landingpage
- **WHEN** ein Besucher auf der Landingpage „Add to home screen" tippt
- **THEN** öffnet sich die Web-App mit dem passenden Sheet
