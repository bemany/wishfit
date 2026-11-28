# PWA-Installation und Verbindung zur Landingpage

## Why
Die Web-App (https://wishfit-web-test.vercel.app) ist installierbar, aber niemand wird dorthin geführt: Die Landingpage (https://wishfit.vercel.app, apps/web) verweist auf das alte Werkzeug `/try`, und die Web-App erklärt nicht, wie man sie zum Home-Bildschirm hinzufügt. Esref wünscht eine klare Installations-Journey (28.11.2026).

## What Changes
- Web-App: Installations-Hinweis passend zur Plattform. Chrome/Edge/Android: eigener Knopf über `beforeinstallprompt`. iOS Safari: kurze Schritt-Anleitung (Teilen → „Zum Home-Bildschirm“) als Sheet im App-Design. iOS in anderem Browser: Hinweis, in Safari zu öffnen. Kein Hinweis, wenn die App schon installiert läuft (standalone).
- Zeitpunkt: nach dem Onboarding und erneut nach der ersten Empfehlung; „Später“ blendet 7 Tage aus; dauerhaft erreichbar unter „Ich“.
- Manifest und iOS-Metadaten vollständig (Icons 192/512/maskable, apple-touch-icon, Theme-Farbe, Startbildschirm ohne weißen Blitz).
- Landingpage: Haupt-Aufruf „Wishfit öffnen“ führt in die Web-App (URL über `NEXT_PUBLIC_APP_URL`, Standard https://wishfit-web-test.vercel.app), dazu ein Abschnitt „Auf den Home-Bildschirm“ mit den Schritten für iPhone und Android; geteilte Profillinks bleiben bei der Web-App.

## Impact
apps/mobile (Web-Teil: *.web.ts(x), public/), apps/web (Landingpage). Kein Backend. Kein App-Store.
