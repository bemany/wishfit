## ADDED Requirements

### Requirement: Dieselbe App im Browser
Die Webversion SHALL aus demselben Code wie die iOS-App entstehen und dieselben Abläufe bieten: Personen anlegen, Chat mit dem Agenten, Ergebnisse, Pins, Profil, Anmeldung.

#### Scenario: Ablauf im mobilen Browser
- **WHEN** jemand die Web-App auf einem Smartphone öffnet und eine Person anlegt
- **THEN** kann er dem Agenten schreiben und das Ergebnis sehen wie in der App

### Requirement: Web-Varianten statt nativer Module
Die Webversion SHALL Personen und Profil im lokalen Browser-Speicher halten, Links in neuem Tab öffnen, Teilen über die Web-Share-API oder die Zwischenablage anbieten und Diktat nur zeigen, wenn der Browser Spracherkennung kann.

#### Scenario: Neu laden
- **WHEN** jemand ohne Anmeldung eine Person anlegt und die Seite neu lädt
- **THEN** ist die Person noch da

### Requirement: Installierbar
Die Webversion SHALL ein Web-App-Manifest (Name Wishfit, Icons, Standalone-Anzeige) und einen Service Worker haben, der die App-Hülle für einen Start ohne Netz vorhält. API-Antworten MUST NOT vom Service Worker zwischengespeichert werden.

#### Scenario: Zum Home-Bildschirm
- **WHEN** jemand die Seite in Safari oder Chrome zum Home-Bildschirm hinzufügt
- **THEN** startet sie im Vollbild mit Wishfit-Icon und -Namen
