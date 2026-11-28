# Design

1. Übergänge bleiben im eigenen Stack in App.tsx (kein react-navigation, keine neuen nativen Module). Umsetzung mit react-native-reanimated 4 (schon installiert): die vorige Seite bleibt während der Animation gerendert (Unterlage mit −30 % Versatz und 10 % Abdunklung), Feder mit kritischer Dämpfung (kein Überschwingen), Dauer ca. 350 ms, Wischgeste vom linken Rand folgt dem Finger. Zoom für „+": Skalierung von ~0,9 mit Ursprung oben rechts plus Einblenden.
2. Kopfzeile: festes TopBar außerhalb des ScrollView mit 8–12 pt Abstand nach unten; ein kurzer Verlauf (weiß → transparent, ca. 16 pt) unter der Kopfzeile.
3. Platzhalter: kurze Texte je Sprache (z. B. „Erzähl mehr …"/„Tell me more …") und `numberOfLines`/Mindesthöhe so, dass nichts gekürzt wird; alle 10 Eingabefelder prüfen.
4. Startseite: `scrollEnabled` nur, wenn Inhaltshöhe > Viewport (onContentSizeChange/onLayout).
5. Kamera: `facing`-State in der Snap-Ansicht, runder Knopf rechts neben dem Auslöser, im Web ausgeblendet, wenn nur eine Kamera.
