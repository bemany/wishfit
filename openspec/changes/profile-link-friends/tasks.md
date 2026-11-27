## 1. Backend (Paket E, `services/agent`)

- [ ] 1.1 Spalte `users.profile_slug` (Migration in `db.py`), Speicher-Ersatz
- [ ] 1.2 `POST /me/share`, `DELETE /me/share`, `GET /profiles/{slug}` mit Filterung laut design.md
- [ ] 1.3 `POST /wishlist/import` über `amazon.py` (Host-Prüfung), Limit 50, IP-Ratenbegrenzung
- [ ] 1.4 `docs/api.md` ergänzen, selfcheck erweitern, Deploy, Live-Test

## 2. App und Web (Paket F, `apps/mobile`)

- [ ] 2.1 `Wish`-Objekte in `Me`, Umwandlung alter Strings, Anzeige mit Bild/Preis/Link
- [ ] 2.2 Profil: Wunschlisten-Link importieren, Ergebnis übernehmen
- [ ] 2.3 Profil: „Share my profile“ (Anmeldung vorausgesetzt), „Stop sharing“; alter Text-Teilen-Knopf entfällt
- [ ] 2.4 Deep Link `wishloop://u/<slug>` und Web-Route `/u/<slug>`, Profilansicht mit „Add as friend“ bzw. „Open in the app“
- [ ] 2.5 Person mit `friendSlug`, Doppelte vermeiden, Wünsche beim Öffnen aktualisieren, Hinweis bei 404
- [ ] 2.6 Wünsche des Freundes beim ersten Chat-Turn als Kontext an den Agenten
- [ ] 2.7 tsc, Simulator- und Web-Test des ganzen Ablaufs (zwei Konten)
