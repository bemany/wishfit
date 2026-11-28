## Context

- App: alle Texte englisch, direkt in `src/screens.tsx`/`App.tsx`; kein Onboarding. Personen und Profil werden mit dem Konto synchronisiert (`user_data.people`/`profile`, JSON-Blobs der App).
- Backend auf Vercel (Pro-Team fahrer-app, Crons möglich), Neon, idealo mit Drosselung (PR #31), Preis-Abfrage `POST /wishes/price`.
- APNs: Team-Schlüssel `Y247QD67CF` (T99ZBA34NR) wird mitgenutzt (Freigabe Esref 28.11.); Topic `app.wishfit.ios`; TestFlight nutzt die Produktions-Umgebung (`api.push.apple.com`).

## Decisions

1. **i18n ohne Bibliothek**: `src/i18n.ts` mit Tabellen `en`/`de`, Funktion `t(key, vars)`, Sprache im lokalen Speicher und im Profil-Blob (`me.language`). Kein `expo-localization`; Vorauswahl über `Intl.DateTimeFormat().resolvedOptions().locale`.
2. **Onboarding** als eigener Screen vor `People`, Flag `onboarded` im lokalen Speicher (nicht im Konto, damit ein neues Gerät es zeigt). Schritte: Sprache → kurzer Einstieg (ein Bild, zwei Sätze) → Mitteilungen erlauben oder später.
3. **Push in der App** mit `expo-notifications` (`getDevicePushTokenAsync`, echter APNs-Token, kein Expo-Push-Dienst, kein Expo-Konto). Plugin in `app.json` setzt `aps-environment`; Push-Fähigkeit der App-ID per ASC-API aktivieren, Profile über `-allowProvisioningUpdates` neu.
4. **Serverseitige Daten**: Der Cron liest Freundes-Wünsche über die Slugs in `user_data.people` (`friendSlug`) aus den öffentlichen Profilen anderer Konten und die Pins aus `people[].pins`. Personen-Anlass-Datum als optionales Feld `occasionDate` (`YYYY-MM-DD`, jährlich wiederkehrend bei Geburtstag) im Personen-Blob.
5. **Tabellen**: `devices(token pk, user_id fk on delete cascade, platform, created_at, last_ok_at)`, `price_snapshots(key pk, price_eur, in_stock, checked_at)` mit `key` = normalisierter Titel bzw. Angebots-URL, `alert_log(user_id, alert_key, sent_on date, primary key(user_id, alert_key))` gegen Wiederholung, `users.language`.
6. **Cron**: Vercel-Cron `0 7 * * *` (UTC, 8 Uhr Berlin) ruft `POST /cron/daily` mit `CRON_SECRET`. Zeitbudget der Funktion begrenzt: Arbeit in Stapeln, Fortschritt in `price_snapshots`; ein Lauf prüft höchstens so viele eindeutige Titel, wie in 250 s bei 3 req/s gehen, Rest am nächsten Tag (bei Testgröße unkritisch). `maxDuration` für diese Funktion setzen.
7. **APNs-Versand** direkt per HTTP/2 (`httpx[http2]`) mit JWT ES256 (`cryptography`), Token 50 min zwischengespeichert. Schlüssel als Vercel-Variable `APNS_KEY` (PEM, verschlüsselt), `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_TOPIC`, `APNS_ENV=production`.
8. **Mitteilungstext** in der Kontosprache, zusammengefasst: Titel „Wishfit“, Text der wichtigste Treffer plus „und 2 weitere“. Payload enthält `personId` bzw. `slug` für den Sprung in die App.

## API-Vertrag (Ergänzung zu `docs/api.md`)

| Methode | Pfad | Auth | Body | Antwort |
|---|---|---|---|---|
| PUT | `/me/settings` | ja | `{language}` | 200 `{language}` |
| POST | `/me/devices` | ja | `{token, platform: "ios"}` | 204 |
| DELETE | `/me/devices/{token}` | ja | – | 204 |
| POST | `/cron/daily` | `Bearer CRON_SECRET` | – | 200 `{checked, alerts_sent}`; 401 |

## Risks / Trade-offs

- Mitgenutzter APNs-Schlüssel: Rotation trifft Solidum-Portal, justap-Push und Wishfit; steht in der Second-Brain-Notiz.
- Push nur auf echten Geräten testbar (Simulator kann `simctl push` lokal, aber kein echter APNs-Token); Ende-zu-Ende-Test über TestFlight-Build auf Esrefs iPhone.
- Freundes-Wünsche nur, solange der Freund sein Profil teilt.
- Gerätetoken-Übernahme (Review PR #32): Wer den APNs-Token eines fremden Geräts kennt, kann ihn mit dem eigenen Konto registrieren; das alte Konto verliert das Gerät. Tokens sind praktisch nicht erratbar und Push-Texte enthalten nur Wunsch-, Pin- und Personennamen des registrierenden Kontos. Akzeptiert für die Testphase.
- Abmelden mit abgelaufener Session (Opus-Review 28.11.): `/auth/logout` antwortet 401 und kann das Gerät nicht austragen; das Gerät bekommt Mitteilungen des alten Kontos, bis sich jemand neu anmeldet (dann hängt `POST /me/devices` es um). Selten, Sessions gelten 90 Tage. Akzeptiert für die Testphase; später: Abmelden des Geräts ohne Session (signiertes Gerätetoken).
- Wettlauf erste Registrierung und Abmelden (Opus-Review 28.11.): Liefert iOS das Token erst nach der Wartezeit von 5 s beim Abmelden, kann `POST /me/devices` nach dem Logout ankommen und das Gerät beim alten Konto lassen. Nur beim allerersten Registrieren und bei sehr langsamer Token-Abfrage. Akzeptiert für die Testphase; später: nach dem POST die Session erneut prüfen und sonst per DELETE austragen.
- idealo-Ausfall: Fehler lassen Snapshots unverändert, „wieder verfügbar“ entsteht nur aus echten Treffern; Snapshots mit Ereignis werden erst nach Zustellung fortgeschrieben.
