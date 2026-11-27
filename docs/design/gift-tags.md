# Design-Richtung "Gift tags" (von Esref freigegeben, 27.11.2026 ca. 18:45)

Esref: "sieht ehrenlos geil aus, liebe ich". Diese Richtung ersetzt den HeroUI-nahen Look als Zielbild. Sprache: Englisch zuerst.
Stand: nur Design (Klickdummy), NICHT im Code. Die App im Repo ist weiter HeroUI-Look und deutsch.

- App-Klickdummy, Seite "Gift tags (EN)", 12 Screens: https://claude.ai/artifact/Tjkbs5zUzo2awjca3cH3hF
- Landingpage im selben Stil, Seite "Landing: gift tags (EN)": https://claude.ai/artifact/GbbhU7nb4K6bYMGXHHM4xc
- CSS der Richtung (Scratchpad, kann verschwinden): /private/tmp/claude-501/-Users-esrefyalcinkaya-GitHub-wishloop/661bee7f-b9fc-4a64-88e3-bfe29769763c/scratchpad/app/project/tag.css

## Bildsprache

- Weißer Grund, schwarze Schrift und 2px schwarze Linien, kein Blau, keine grauen Karten, keine Schatten.
- Jede Person ist ein Geschenkanhänger in einer eigenen Farbe: tomato #ff5a3c, lemon #ffd23f, mint #7fd6a8, lilac #c9a7ff, sky #8fd3ff. Tinte #0b0b0c, gedämpft #5f5f66.
- Anhänger: Radius 28, 2px Rand, Loch oben in der Mitte. Personenliste = überlappender Stapel. Die Empfehlung ist ein Anhänger in der Farbe der Person, Preis sehr groß.
- idealo-Datensignale als leicht gedrehte Stempel (2px Rand, Radius 8, Mono-Label in Versalien, Wert fett).
- Schriften: Bricolage Grotesque 800 (Namen, Preise, Agent), Instrument Sans (Text), DM Mono 500 (kleine Angaben). Alle Google Fonts.
- Buttons: schwarze Pille mit weißer Schrift; sekundär weiße Pille mit 2px Rand.
- Der Agent spricht ohne Sprechblase in großer fetter Schrift, Nutzer-Nachrichten sind schwarze Blasen.

## Aufbau der App

Tabs: People · Snap · Me.
1 People (Stapel) → 2 Add someone (Name, Budget, Anlass, Farbe) → 3 Tell me about X (Chat, Wunschlisten-Link, eigene Worte) → 4 Searching → 5 Thread and pick (Chat mit Schnellantworten) → 6 The pick in detail (Begründung mit Zitat, Preisverlauf, Verfügbarkeit, Budget).
7 Snap a product (Foto, Upload, Link; unabhängig von einer Person) → 8 Found it: which tag? (Agent schlägt den passenden Anhänger vor, Nutzer kann anders wählen oder "My wishlist").
9 Me (eigener Anhänger, eigene Wunschliste) → 10 Send my tag → 12 Friends. 11 Claim your tag = Konto.

## Entscheidungen von Esref

- Verbinden mit Freunden: MIT Konto (27.11., ca. 19:00). Das hebt die frühere Vorgabe "kein Signup, kein Login" für diese Funktion auf.
  Entwurf: Konto ist optional und erst nötig für eigenen Anhänger, Freunde und Sync; Anmeldung per E-Mail-Link oder "Continue with Apple", kein Passwort. Ohne Konto bleibt alles lokal nutzbar.
- Regel im Entwurf (von der Design-Session vorgeschlagen, nicht von Esref bestätigt): Freunde sehen Wünsche, nie wer was besorgt.

## Was das im Backend bräuchte (existiert alles noch nicht)

Konten und Anmeldung, gespeicherte Anhänger und Wunschlisten, Freundschaften und Freigaben, Bildsuche (Foto → Produkt → idealo), "ist schon vergeben"-Markierung.
