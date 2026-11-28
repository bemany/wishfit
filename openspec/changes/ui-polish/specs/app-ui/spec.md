## ADDED Requirements

### Requirement: Kopfzeile und Inhalt
Scrollender Inhalt SHALL unter einer festen Kopfzeile mit sichtbarem Abstand und weichem Übergang verschwinden, nicht hart abgeschnitten direkt unter dem Zurück-Knopf.

#### Scenario: Chat nach oben gescrollt
- **WHEN** der Nutzer im Chat eine Karte unter die Kopfzeile scrollt
- **THEN** liegt zwischen Kopfzeile und Inhalt Abstand, und der Inhalt blendet aus statt abzuschneiden

### Requirement: Vollständige Platzhalter
Jedes Texteingabefeld SHALL seinen Platzhalter in Deutsch und Englisch ohne Kürzung zeigen, auf iPhone 18 Pro und iPhone 17e.

#### Scenario: Chat-Eingabe
- **WHEN** die Chat-Eingabe leer ist
- **THEN** ist der Platzhalter ganz lesbar, ohne „…"

### Requirement: Startseite ohne unnötiges Scrollen
Die Startseite SHALL nur scrollen, wenn ihr Inhalt höher als der Bildschirm ist.

#### Scenario: Ein Anhänger
- **WHEN** nur ein Anhänger existiert
- **THEN** lässt sich die Seite nicht verschieben

### Requirement: Kamera wechseln
Die Snap-Ansicht SHALL einen Knopf zum Wechseln zwischen Rück- und Frontkamera haben.

#### Scenario: Wechsel
- **WHEN** der Nutzer den Wechsel-Knopf tippt
- **THEN** zeigt die Vorschau die andere Kamera, und das Foto kommt von ihr

### Requirement: Native Übergänge
Seitenwechsel SHALL sich wie iOS anfühlen: Vorwärts von rechts mit Parallaxe der alten Seite, Zurück per Knopf und Randwisch gleich, ohne Nachschwingen. „+" SHALL „Person hinzufügen" mit einer Zoom-Animation aus dem Knopf öffnen. Bei „Bewegung reduzieren" SHALL nur überblendet werden.

#### Scenario: Zurück
- **WHEN** der Nutzer vom linken Rand wischt oder Zurück tippt
- **THEN** gleitet die Seite nach rechts, die vorige Seite kommt aus leichter Parallaxe und Abdunklung zurück
