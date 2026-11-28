# UI-Feinschliff nach erstem TestFlight-Test

## Why
Esref hat Build 3 auf dem iPhone getestet (28.11.2026). Mehrere Stellen wirken unfertig: Inhalt wird direkt unter der Kopfzeile abgeschnitten, Platzhalter in Eingabefeldern werden gekürzt, die Startseite scrollt ohne Grund, die Kamera kann nicht wechseln, und die Übergänge zwischen Seiten fühlen sich nicht nativ an.

## What Changes
- Abstand und weicher Übergang zwischen fester Kopfzeile und scrollendem Inhalt (Chat, Detail, Profil, Me).
- Platzhalter in allen Texteingaben vollständig sichtbar (kürzere Texte oder Feld wächst mit, keine Kürzung mit „…").
- Startseite scrollt nur, wenn der Inhalt höher als der Bildschirm ist; bei vielen Anhängern scrollt nur der Stapel.
- Kamera: Knopf zum Wechseln zwischen Front- und Rückkamera.
- Seitenübergänge: Vorwärts von rechts, Zurück per Knopf und Randwisch wie iOS (Parallaxe, Abdunkeln, Feder ohne Nachschwingen); „+“ öffnet „Person hinzufügen“ mit Zoom aus dem Knopf.

## Impact
Nur `apps/mobile` (App.tsx, src/screens.tsx, src/ui.tsx, src/profile.tsx, src/i18n.ts). Kein Backend, keine neuen nativen Module.
