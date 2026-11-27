## Context

- Baut auf `accounts-and-web` auf: Konten mit E-Mail-Code, `user_data.profile` als JSON-Blob, den die App pflegt (`Me = {name, color, wishes: string[], updatedAt}`).
- `services/agent/amazon.py` liest öffentliche Amazon-Wunschlisten (bisher nur für `/recommend`), mit Host-Prüfung pro Redirect (SSRF-Fix aus PR #29).
- App: `MeScreen` in `src/screens.tsx` mit Wunschliste als Text und „Share my wishlist“ (Text). Deep-Link-Schema `wishloop`, Web-App `https://wishfit-web-test.vercel.app` (SPA, Rewrite auf `index.html`).

## Goals / Non-Goals

**Goals:** Import aus Amazon-Wunschliste ins eigene Profil, Profillink teilen statt Text, öffentliches Profil ohne private Daten, Freund per Link hinzufügen, Wünsche des Freundes als Agent-Kontext.

**Non-Goals:** Freundschaftsanfragen in beide Richtungen, Benachrichtigungen, serverseitige Freundesliste, andere Shops.

## Decisions

1. **Kein Freundes-Table.** „Freund“ ist eine Person (Tag) mit `friendSlug` im bestehenden Personen-Sync. Das öffentliche Profil wird beim Öffnen per `GET /profiles/{slug}` geholt. Einfach, ohne neues Rechtemodell; gegenseitige Freundschaft ist ein Folgepaket.
2. **Slug** 10 Zeichen aus `secrets.token_urlsafe` (ohne `-`/`_` am Rand), Spalte `users.profile_slug text unique null`. `POST /me/share` erzeugt ihn oder gibt den bestehenden zurück; `DELETE /me/share` setzt null (neuer Slug beim nächsten Teilen, alter Link tot).
3. **Öffentliche Daten** kommen aus `user_data.profile`: nur `name` (max. 60), `color`, `wishes` (max. 100, je Wunsch nur `title`, `price_eur`, `url`, `image_url`), `updated_at`. Alles andere wird serverseitig weggefiltert, nicht vom Client vertraut.
4. **Wünsche als Objekte**: `Wish = {title: string, price_eur?: number|null, url?: string|null, image_url?: string|null}`. Alte Strings werden beim Laden zu `{title}`. URLs nur http(s).
5. **Import**: `POST /wishlist/import {url}` → `{items: Wish[], source: "amazon_wishlist"}`; nutzt `amazon.find_url`/`amazon.fetch` mit der bestehenden Host-Prüfung, höchstens 50 Einträge, 422 bei nicht unterstütztem oder leerem Link, 502 bei Abruffehler. Ohne Anmeldung erlaubt (die App kann auch lokal importieren), Ratenbegrenzung 10 pro Minute je IP über einen einfachen In-Memory-Zähler pro Instanz.
6. **Link-Format**: `https://wishfit-web-test.vercel.app/u/<slug>` (Basis aus `PUBLIC_WEB_URL`, Standard diese Adresse). Die Web-App erkennt `/u/<slug>` beim Start; die iOS-App `wishloop://u/<slug>`. Die Profilseite im Web zeigt zusätzlich „Open in the app“ (Deep Link).
7. **Agent-Kontext**: Beim Chat mit einer Person mit Wünschen schickt die App die Wünsche einmal als Teil von `input_text` („Wishlist of <name>: …“), bei Folgeturns nicht erneut. Kein neues Feld im API-Vertrag.

8. **Preistracker**: `Wish` bekommt `source` (`amazon` | `snap` | `typed` | `link`), `added_at` (ms) und `price` = `{price_eur, offer_count, in_stock, trend: "down"|"stable"|"up"|null, change_percent, url, image_url, checked_at}` oder null. `POST /wishes/price` nimmt bis zu 20 Wünsche (`title`, optional `url`) und liefert je Wunsch den besten idealo-Treffer (search_products mit availableOnly, dann offers und price_history_30d für den ersten Katalogtreffer; Einzelangebote wie in PR #29 ohne Verlauf). Parallel höchstens 3 idealo-Aufrufe (Trial-Grenze 3 req/s). Kein Modellaufruf. Die App ruft es beim Öffnen des eigenen Profils und von Freundesprofilen für Wünsche mit `checked_at` älter als 6 h auf und speichert das Ergebnis im Wunsch (bei eigenen Wünschen wird es mit dem Profil synchronisiert und ist damit auch öffentlich).

## API-Vertrag (Ergänzung zu `docs/api.md`)

| Methode | Pfad | Auth | Body | Antwort |
|---|---|---|---|---|
| POST | `/wishlist/import` | nein | `{url}` | 200 `{items, source}`; 422 nicht unterstützt/leer; 429; 502 |
| POST | `/me/share` | ja | – | 200 `{slug, url}` |
| DELETE | `/me/share` | ja | – | 204 |
| GET | `/profiles/{slug}` | nein | – | 200 `{name, color, wishes, updated_at}`; 404 (wishes inkl. `source`, `added_at`, `price`) |
| POST | `/wishes/price` | nein | `{wishes: [{title, url?}]}` (max 20) | 200 `{prices: [price|null]}` in gleicher Reihenfolge; 422; 429 (gleiches IP-Limit wie Import) |

## Risks / Trade-offs

- Öffentliche Profile sind per Slug erratbar nur mit ~60 Bit Zufall; ausreichend.
- Amazon kann Wunschlisten-Abrufe blockieren; dann 502 mit Hinweis, Wünsche von Hand bleiben möglich.
- Ohne serverseitige Freundesliste sieht der Profilinhaber nicht, wer ihn hinzugefügt hat (bewusst).
