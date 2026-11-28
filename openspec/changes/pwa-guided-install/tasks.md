## 1. Web-App
- [ ] 1.1 Browser-/Versions-Erkennung (iOS-Version, Safari kompakt/klassisch, CriOS/EdgiOS/FxiOS, Android-Browser, Desktop)
- [ ] 1.2 Banner oben im Wishfit-Stil
- [ ] 1.3 Sheet mit App-Karte und Schritten mit Chips (Symbole als SVG), de/en
- [ ] 1.4 Route `/install` öffnet das Sheet; Zeitpunkt nach Anmeldung beibehalten, `/install` auch ohne Anmeldung
## 2. Landingpage
- [ ] 2.1 „Add to home screen" verlinkt auf `<APP_URL>/install`
## 3. Prüfung
- [ ] 3.1 Playwright 390x844 mit UAs: iOS 26 Safari, iOS 17 Safari, iOS Chrome, Android Chrome (simuliertes beforeinstallprompt), Desktop Chrome, macOS Safari; standalone ohne Banner; Screenshots
