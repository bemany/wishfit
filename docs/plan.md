# Plan

Stand: 27.11.2026, ca. 16:30. Abgabe 19:45 CET, Pitches ab 20:00.

## Idee

"Schick mir deine Wunschliste, ich finde das beste Geschenk im Budget."

Hauptfunktionen (aus der Notion-Seite "Hackathon"):

1. Anmelden und Wunschliste manuell eingeben oder importieren (Amazon, idealo). Wer eingeladen wurde,
   sieht die Wunschliste des Einladenden.
2. Person und Budget wählen. Optional: was die Person mag (Marke, Farbe, Lifestyle).
3. Der Agent empfiehlt ein bestes Geschenk und Alternativen.

## Ablauf, der heute gebaut wird

1. Schenkender: Name der Person, Budget, Anlass → teilbarer Link mit vorformuliertem Text.
2. Beschenkter: Wunschliste eintragen (manuell zuerst, Import danach).
3. Agent: pro Wunsch idealo-Daten holen, Nebius-Modell entscheidet: kaufen, warten oder Alternative.
4. Ergebnis: eine Top-Empfehlung mit Begründung plus 2–3 Alternativen, Preis inklusive Versand.
5. Wachstumsschleife: Button "Jetzt selbst jemanden beschenken" auf der Seite des Beschenkten.

## Die idealo-Daten müssen die Entscheidung treiben

- Wunsch über Budget → gleichwertiges Produkt aus derselben Kategorie.
- Preisverlauf → ist der Black-Friday-Preis ein echter Deal?
- Wunsch ausverkauft → Alternative, die vor Weihnachten lieferbar ist.
- Zwei kleine Wünsche passen zusammen ins Budget (inklusive Versand).

## Zwei feste Demo-Fälle

- Einfach: Powerbank um 50 €, eindeutiges Produkt, klare Empfehlung.
- Chaotisch: ungenauer Wunsch, ausverkauft oder widersprüchliche Preise. Der Agent sagt, warum er
  unsicher ist, und fragt nach.

## Bauen / nur im Pitch zeigen

| Bauen | Nur im Pitch |
|---|---|
| Landingpage Schenkender und Beschenkter | E-Mail-Versand, Double-Opt-in |
| Agent mit Nebius und idealo-MCP | Zuverlässiges Amazon-Scraping |
| Ergebnisseite im Web, vollständig sichtbar | App-Pflicht für alle Ergebnisse |
| Swift-App zeigt dieselben Ergebnisse | Login-Übergabe an die App, Android |
| Button für die Wachstumsschleife | Wichtel-Modus für Gruppen |

Die Jury kann einen internen TestFlight-Build nicht installieren. Die Web-Demo ist deshalb das, was
die Jury selbst öffnet. Die App ist das Schaustück im Pitch.

## Offene Punkte (zuerst klären)

- Zugang zum idealo-MCP: Endpunkt, Tool-Liste, Rate-Limits, Antwortzeit. Liefert er Bewertungen?
- Zugang zur Nebius Token Factory (Build Desk).
- Erster leerer TestFlight-Build hochgeladen (Bundle-ID, Signing)?
- Norma: Workspace nach dem Team benannt, GitHub-App auf diesem Repo installiert.

## Aufteilung

- A: Agent-Backend (`services/agent`)
- B: Wunschliste einlesen, Demo-Daten als Fallback
- C: Landingpage (`apps/web`)
- D: Expo-App (`apps/mobile`)
- E: Setup Norma und Nebius, Abgabe-Notizen, Pitch

## Zeitplan

- bis 17:30: Agent läuft einmal komplett durch
- bis 18:30: Web-Demo und App zeigen echte Ergebnisse
- ab 18:30: nichts Neues, nur Demo, Notizen, Pitch
- 19:30: abgeben

## Abgabe-Checkliste

- [ ] Standard-Abgabe bei AI Agents Berlin (ein Captain)
- [ ] Demo-Link, den die Jury öffnen kann
- [ ] Nebius: Notiz mit Modellnamen und der Stelle, an der der Call entscheidet. Trace oder Log zeigen.
- [ ] Norma: GitHub-Link, Workspace-Name, Notiz (akzeptiertes Finding mit Regel und Datei, Begründung,
      ein Beispiel, wo die Policy Autoren konsistent gehalten hat)
- [ ] Norma: 2 gemergte PRs von verschiedenen Autoren, ein behobenes Finding, eine Policy
- [ ] idealo: im Pitch zeigen, welche Datensignale die Empfehlung tragen
