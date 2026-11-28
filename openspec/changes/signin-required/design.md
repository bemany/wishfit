# Design
1. Ein Gate in App.tsx: `session` aus account.ts entscheidet; ohne Session rendert die App Onboarding (falls nicht onboarded) bzw. einen Anmelde-Bildschirm im Gift-Tag-Stil (großer Anhänger, E-Mail, Code mit Auto-Submit bei 6 Ziffern, Netzfehler-Meldung aus mail-and-signin).
2. Onboarding-Reihenfolge: Sprache → Einstieg → Anmeldung → Mitteilungen. Wer schon onboarded, aber abgemeldet ist, sieht direkt die Anmeldung.
3. Ausstehende Ziele (Slug, personId) in einer Ref/Settings merken und nach Anmeldung öffnen.
4. Profil-Vorschau ohne Konto bleibt erreichbar (öffentlicher Endpunkt), Hinzufügen verlangt Anmeldung.
5. Web genauso; Installations-Hinweis (pwa-journey) erst nach der Anmeldung.
