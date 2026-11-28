## 1. Preisquelle
- [x] 1.1 Interface price_source, idealo.py dahinter
- [x] 1.2 apify.py (memo23 Suche/Angebote, ahmed_jasarevic Preisverlauf), Token-Rotation, Cache, Zeitlimits
- [x] 1.3 PRICE_SOURCE-Schalter, selfcheck mit gemockten Actor-Antworten, Live-Test mit echten Tokens
## 2. Kosten
- [x] 2.1 cost_events-Tabelle, Modellpreise, Erfassung in Modellaufrufen, Apify, Mail, Push
- [x] 2.2 GET /admin/costs inkl. Apify-Restguthaben
- [x] 2.3 Admin-Seite „Kosten“
## 3. Prüfung
- [x] 3.1 selfcheck, Live-Läufe Apify, Kosten in /admin/costs (Live-Empfehlung erst nach Umstellen von PRICE_SOURCE)
- [x] 3.2 Fix: Angebotslinks mit Preis auf zwei Nachkommastellen bzw. dem leadoutUrl des Actors; Zeitlimits im Apify-Pfad (Deadline 80 s, 3 Wünsche parallel, ein Retry statt leerer Antwort)
