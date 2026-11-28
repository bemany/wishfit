## 1. App
- [x] 1.1 Gate in App.tsx, Anmelde-Bildschirm im App-Stil
- [x] 1.2 Onboarding-Reihenfolge mit Anmeldung vor Mitteilungen
- [x] 1.3 Abmelden/Löschen/401 führt zum Anmelde-Bildschirm
- [x] 1.4 Deep Links und Push über die Anmeldung hinweg
- [x] 1.5 Lokale Daten beim ersten Anmelden übernehmen; Texte „bleiben auf diesem Handy" anpassen (de/en)
- [x] 1.6 Sprache gehört zum Konto: bei verify (bestehendes Konto) und App-Start (GET /me) übernehmen, sonst per PUT /me/settings speichern

## 2. Prüfung
- [ ] 2.1 Simulator und Web: Erststart bis Startseite, Abmelden, Freundes-Link ohne Konto
  - [x] Web (Playwright, 390x844, Testbackend): Sprache → Einstieg → Anmeldung, ohne Session keine Startseite, Profil-Vorschau und „Add as friend“ → Anmeldung, Session → Startseite, 401 → Anmeldung, Kontosprache aus GET /me übernommen
- [x] 1.7 Review-Nachbesserung: Profil auf neuem Gerät bleibt, Daten-Besitzer nach 401, Trotzdem abmelden, Sperre beim Abmelden, Sprachwahl schlägt GET /me
  - [x] Web mit gemocktem Backend: neues Gerät mit Sprachwahl behält Kontoprofil und übernimmt Kontosprache; andere E-Mail nach 401 startet leer, dieselbe behält die Daten
  - [ ] Simulator (iOS) und echte Anmeldung per Mail-Code
