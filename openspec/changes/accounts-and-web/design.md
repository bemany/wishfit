## Context

- Backend: FastAPI in `services/agent`, auf Vercel als Python-Funktion. Speicher heute nur `storage.py` (Tabelle `results`, `create table if not exists` bei jedem Kaltstart, psycopg 3, eine Verbindung pro Aufruf). Beim Test am 27.11. gab es vereinzelt 500 bei parallelen Kaltstarts.
- Test-Backend `wishfit-agent-test` (Vercel-Team fahrer-app) mit LiteLLM (`chatgpt/gpt-6-luna`), idealo-MCP und Neon `wishfit-db` (`DATABASE_URL` gepoolt, `DATABASE_URL_UNPOOLED`). Deploy von Hand per `npx vercel deploy --prod` aus einer Kopie von `services/agent`, keine Git-Anbindung.
- App: Expo 58, RN 0.88, ein Bildschirm-System in `src/screens.tsx`, Daten in `src/api.ts` (Personen in `people.json`, Profil in `me.json` über `expo-file-system`). Web-Export (`expo export -p web`) läuft mit `react-dom`, `react-native-web`, `@expo/metro-runtime`; `expo-file-system` fehlt im Web.
- Mail: Resend mit Domain bemany.tech ist eingerichtet (Ordo). Ein Sending-Key für Wishfit fehlt noch.

## Goals / Non-Goals

**Goals:** Konto per E-Mail-Code, Sync von Personen und Profil, Ergebnisse mit Konto, Konto löschen (App-Store-Pflicht), Webversion als PWA aus demselben Code, stabile Migrationen.

**Non-Goals:** Passwörter, Social Login, Echtzeit-Sync, Teilen zwischen Konten, Android, eigene Domain, Admin-Oberfläche.

## Decisions

1. **Auth im FastAPI-Backend statt Better Auth.** Ein Server, App und Web sprechen nur ihn an. Eigene kleine Implementierung: Code 6 Ziffern aus `secrets.randbelow`, gespeichert als HMAC-SHA256 mit `AUTH_SECRET`, 10 min gültig, 5 Versuche. Token 32 Byte `secrets.token_urlsafe`, gespeichert als SHA-256, 90 Tage. Kein JWT, damit Abmelden und Löschen sofort wirken.
2. **Kontodaten als JSON-Blobs** (`people`, `profile`) statt Tabellen je Person. Das Format gehört der App; das Backend prüft nur Typ (Liste bzw. Objekt oder null) und Größe (höchstens 2 MB je Anfrage). Optimistische Sperre über `updated_at` (`base_updated_at` im PUT, 409 mit aktuellem Stand). Der erste PUT auf ein leeres Konto braucht `base_updated_at: null`.
3. **Zusammenführen im Client.** Personen bekommen `updatedAt` (ms). Merge nach `id`, neuerer `updatedAt` gewinnt, fehlendes `updatedAt` zählt als 0. Profil: neuerer `updatedAt` gewinnt. Gelöschte Personen: Tombstones `{id, deleted: true, updatedAt}` in derselben `people`-Liste (Server-Vertrag bleibt: `people` ist eine Liste, gespeichert wie gegeben). Beim Löschen legt die App lokal einen Tombstone an; beim Merge gewinnt der neuere `updatedAt` (bei Gleichstand das Löschen), gelöschte Personen werden nicht angezeigt, eine danach geänderte Person kehrt zurück. Tombstones älter als 30 Tage fallen weg. Ältere App-Versionen ignorieren die Einträge.
4. **Migrationen** in `services/agent/db.py`: ein `migrate()` mit `pg_advisory_xact_lock(<feste Zahl>)` und `create table if not exists` / `alter table … add column if not exists`, einmal pro Prozess. `storage.py` nutzt es. Für Schema-Arbeit die UNPOOLED-URL (`DATABASE_URL_UNPOOLED`, Rückfall `DATABASE_URL`).
5. **Ohne `DATABASE_URL`** (lokal, `selfcheck.py`) In-Memory-Ersatz für alle Tabellen, damit Tests ohne Postgres laufen.
6. **Mail über die Resend-HTTP-API** (`httpx`, `POST https://api.resend.com/emails`), Absender `MAIL_FROM` (Standard `Wishfit <login@bemany.tech>`), deutscher und englischer Text nach `language` im Request (Standard `de`). Ohne Key: Testmodus (Log, optional `dev_code` bei `AUTH_DEV_CODES=1`). Auf `wishfit-agent-test` ist `AUTH_DEV_CODES=1` gesetzt, bis der Resend-Key da ist; danach wird es entfernt.
7. **Ratenbegrenzung** über die Tabelle `auth_codes` (Zeitpunkte je E-Mail), kein separater Store.
8. **Web-Varianten über Plattform-Dateien** (`*.web.ts`), die Metro automatisch wählt: `src/storage.ts`/`storage.web.ts` (JSON lesen/schreiben, Token sicher speichern: `expo-secure-store` bzw. `localStorage`), `src/speech.web.ts` (Web Speech API, sonst nicht verfügbar), Links und Teilen über `src/platform.ts`/`platform.web.ts`.
9. **PWA**: `app.json` → `web.output: "single"`, Name, Farben; Manifest und Service Worker als statische Dateien in `apps/mobile/public/` (Expo kopiert `public/` in den Export). Service Worker: Cache-first nur für die App-Hülle und `/_expo/static/*`, Netzwerk für alles andere, API nie cachen. Hosting: Vercel-Projekt `wishfit-web-test` (statisch, Rewrites aller Pfade auf `index.html`).
10. **CORS** bleibt offen (`*`), Token im Header statt Cookie, daher kein CSRF-Thema.

## API-Vertrag (Ergänzung zu `docs/api.md`)

| Methode | Pfad | Auth | Body | Antwort |
|---|---|---|---|---|
| POST | `/auth/request-code` | nein | `{email, language?}` | 204; Testmodus mit `AUTH_DEV_CODES=1`: 200 `{dev_code}`; 422 ungültige Adresse; 429 zu oft |
| POST | `/auth/verify` | nein | `{email, code}` | 200 `{token, user:{id,email,created_at}, created}`; 401 |
| POST | `/auth/logout` | ja | – | 204 |
| GET | `/me` | ja | – | 200 `{id,email,created_at}` |
| DELETE | `/me` | ja | – | 204 |
| GET | `/me/data` | ja | – | 200 `{people: [], profile: null, updated_at: null}` bzw. gespeicherter Stand (`updated_at` ISO-8601) |
| PUT | `/me/data` | ja | `{people, profile, base_updated_at}` | 200 `{updated_at}`; 409 `{detail, people, profile, updated_at}`; 413 zu groß |
| POST | `/recommend` | optional | wie bisher | wie bisher; mit Token wird `user_id` gespeichert. Ungültiges Token: 401 |

E-Mail wird kleingeschrieben und getrimmt. Fehler kommen wie bisher als `{detail}`.

## Schema

```
users(id uuid pk, email text unique not null, created_at timestamptz)
auth_codes(id bigserial pk, email text, code_hash text, expires_at timestamptz, attempts int default 0, used_at timestamptz, created_at timestamptz)
sessions(token_hash text pk, user_id uuid references users on delete cascade, created_at, expires_at)
user_data(user_id uuid pk references users on delete cascade, people jsonb, profile jsonb, updated_at timestamptz)
results(+ user_id uuid null)   -- beim Konto-Löschen auf null
```

## Risks / Trade-offs

- `AUTH_DEV_CODES=1` auf dem Test-Backend gibt Codes an jeden heraus, der eine Adresse kennt. Akzeptiert nur für die interne Testphase, entfernt sobald Resend läuft. Steht im Bericht.
- JSON-Blob-Sync ist grob (ganzer Stand pro PUT); bei den erwarteten Datenmengen unkritisch.
- Ergebnisse bleiben per ID öffentlich lesbar (wie bisher, nötig für Links); IDs sind zufällig (48 Bit).
- Vercel-Funktionen öffnen je Aufruf eine Verbindung; Neon gepoolt fängt das ab.

## Migration Plan

1. Backend mit neuen Endpunkten auf `wishfit-agent-test` deployen, `AUTH_SECRET` und `AUTH_DEV_CODES=1` setzen. Alte Ergebnisse bleiben lesbar.
2. App-Build 3 mit Login und Sync zu TestFlight, Web auf `wishfit-web-test`.
3. Mit Resend-Key: `RESEND_API_KEY` setzen, `AUTH_DEV_CODES` entfernen, redeployen.

## Open Questions

- Resend-Sending-Key von Esref (bis dahin Testmodus).
- Löschen von Personen über Geräte hinweg (Tombstones) in einem Folgepaket.
- Aufräumen abgelaufener Sitzungen und alter `auth_codes` (derzeit wachsen die Tabellen nur).
- Rate-Limit je IP zusätzlich zum Limit je Adresse (derzeit nur je Adresse).
