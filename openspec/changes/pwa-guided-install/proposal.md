# Geführte PWA-Installation (Vorbild Progressier)

## Why
Esref (28.11.2026) wünscht eine geführte Installation wie bei Progressier (Demo install.page/british24): Banner mit App-Icon und „Installieren", danach ein Sheet mit App-Karte und nummerierten Schritten, in denen die echten Browser-Bedienelemente als kleine Chips erscheinen. Die bisherige Anleitung (pwa-journey) ist zu allgemein und passt nicht zur neuen Safari-Leiste.

## What Changes
- Install-Banner oben (App-Icon, kurzer Satz, Knopf „Installieren", Schließen), im Wishfit-Stil, nicht im Standalone-Modus, nach „Schließen" 7 Tage Ruhe.
- Sheet „App installieren": Karte mit Icon, „Wishfit", Domain; Schritte je Browser mit Inline-Chips (Symbol + Beschriftung wie im Browser):
  - iOS Safari mit kompakter Leiste (iOS 26+): ≡ Menü → „Teilen" → „Mehr anzeigen" → „Zum Home-Bildschirm"
  - iOS Safari klassisch: Teilen-Symbol → „Zum Home-Bildschirm"
  - iOS Chrome/Edge/Firefox: Teilen-Symbol in der Adressleiste → „Zum Home-Bildschirm" (iOS 16.4+), sonst Hinweis „in Safari öffnen"
  - Android Chrome/Edge/Samsung: direkter Systemdialog über beforeinstallprompt; sonst ⋮ Menü → „App installieren"/„Zum Startbildschirm"
  - Desktop Chrome/Edge: Install-Symbol in der Adressleiste bzw. direkter Dialog; macOS Safari: „Ablage" → „Zum Dock hinzufügen"
- Optional ein Pfeil/Hervorhebung zur Stelle des Browser-Knopfs (unten bei iOS-Safari).
- Ein Link für alles: `/install` in der Web-App öffnet direkt das Sheet; die Landingpage „Add to home screen" führt dorthin.
- Deutsch/Englisch.

## Impact
apps/mobile Web-Teil (install*.web.ts(x), i18n, App.tsx-Route `/install`), apps/web (Link). Natives iOS unverändert.
