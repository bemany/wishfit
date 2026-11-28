# Design
1. Ein Gate in App.tsx: `session` aus account.ts entscheidet; ohne Session rendert die App Onboarding (falls nicht onboarded) bzw. einen Anmelde-Bildschirm im Gift-Tag-Stil (großer Anhänger, E-Mail, Code mit Auto-Submit bei 6 Ziffern, Netzfehler-Meldung aus mail-and-signin).
2. Onboarding-Reihenfolge: Sprache → Einstieg → Anmeldung → Mitteilungen. Wer schon onboarded, aber abgemeldet ist, sieht direkt die Anmeldung.
3. Ausstehende Ziele (Slug, personId) in einer Ref/Settings merken und nach Anmeldung öffnen.
4. Profil-Vorschau ohne Konto bleibt erreichbar (öffentlicher Endpunkt), Hinzufügen verlangt Anmeldung.
5. Web genauso; Installations-Hinweis (pwa-journey) erst nach der Anmeldung.
6. Daten-Besitzer: `settings.owner` hält die E-Mail des Kontos, dem die Daten auf dem Gerät gehören. Abmelden/Löschen leert das Gerät und den Besitzer; ein 401 behält beides. Meldet sich danach eine andere E-Mail an, startet sie leer. Daten ohne Besitzer (vor Konten) gehen ins erste Konto.
7. Sprache: Übernahme und Wahl stempeln das Profil nicht; `mergeMe` lässt ein lokales Profil ohne Namen und Wünsche nie gewinnen. Folge: Wer Namen und alle Wünsche löscht, bekommt sie bei einem Abgleich mit älterem Kontoprofil zurück; für die Testphase akzeptiert.
8. Abmelden: erst Push-Token, dann letzter Abgleich, dann Logout; die App ist währenddessen gesperrt. Schlägt der Abgleich fehl, fragt sie „Trotzdem abmelden?"; dann wird auch ein fehlgeschlagener Logout ignoriert (Token läuft auf dem Server ab).
