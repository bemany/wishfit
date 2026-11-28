## ADDED Requirements

### Requirement: Installations-Hinweis je Plattform
Die Web-App SHALL Nutzern im Browser einen zur Plattform passenden Weg zur Installation zeigen und SHALL keinen Hinweis zeigen, wenn sie bereits installiert läuft.

#### Scenario: Android/Chrome
- **WHEN** der Browser `beforeinstallprompt` meldet
- **THEN** zeigt die App einen Knopf „App installieren“, der den System-Dialog öffnet

#### Scenario: iPhone Safari
- **WHEN** die App in Safari auf iOS läuft und nicht installiert ist
- **THEN** zeigt sie eine Anleitung mit Teilen-Symbol und „Zum Home-Bildschirm“

#### Scenario: Schon installiert
- **WHEN** die App im Standalone-Modus läuft
- **THEN** erscheint kein Installations-Hinweis

#### Scenario: Später
- **WHEN** der Nutzer „Später“ wählt
- **THEN** erscheint der Hinweis 7 Tage nicht automatisch, bleibt aber unter „Ich“ erreichbar

### Requirement: Landingpage führt in die App
Die Landingpage SHALL einen Haupt-Aufruf in die Web-App und eine Installationsanleitung enthalten.

#### Scenario: Wishfit öffnen
- **WHEN** ein Besucher „Wishfit öffnen“ tippt
- **THEN** öffnet sich die Web-App unter `NEXT_PUBLIC_APP_URL`
