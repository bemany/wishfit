# Design

## 1. API-Vertrag (Basis: bestehende Bearer-Session)
Admin = Session-Nutzer, dessen E-Mail in `ADMIN_EMAILS` (kommagetrennt, kleingeschrieben) steht und die **keine** Impersonations-Session ist. Sonst 403 `{detail}`; ohne Session 401.

| Methode | Pfad | Antwort |
|---|---|---|
| GET | `/admin/me` | 200 `{email}` – Prüfung, ob Admin |
| GET | `/admin/users?query=&limit=50&offset=0` | 200 `{users:[{id,email,created_at,language,people,wishes,devices,results,last_seen_at,profile_slug}], total}` |
| GET | `/admin/users/{id}` | 200 `{user, data:{people,profile,updated_at}, devices:[{token_tail,platform,created_at,last_ok_at}], results:[{id,created_at,status,model}]}` |
| GET | `/admin/results?user_id=&limit=50` | 200 `{results:[{id,created_at,user_id,email,status,model,duration_ms,error}]}` |
| GET | `/admin/results/{id}` | 200 `{response, trace}` |
| POST | `/admin/push-test` | `{user_id, title?, body?}` → 200 `{sent, devices}` |
| POST | `/admin/cron` | 200 Ergebnis von `run_daily` |
| POST | `/admin/impersonate` | `{user_id}` → 200 `{token, user:{id,email,language}, expires_at}`; 404 unbekannt |
| DELETE | `/admin/impersonate` | Bearer = Impersonations-Token → 204, Session gelöscht |
| GET | `/admin/audit?limit=100` | 200 `{entries:[{at,admin_email,action,target_user_id,detail}]}` |

Impersonations-Session: Zeile in `sessions` mit `impersonated_by` (Admin-User-ID) und `expires_at = now+30min`; `/me` liefert zusätzlich `impersonated_by_email`. Verboten mit dieser Session (403): `/admin/*` außer `DELETE /admin/impersonate`, `DELETE /me`, `POST /me/devices`. Schreibende Aufrufe (PUT /me/data, /me/settings, /me/share, POST /recommend …) werden mit Pfad im Audit vermerkt (Middleware, ohne Inhalt).

Schema: `alter table sessions add column impersonated_by uuid`; `create table admin_audit (id bigserial, at timestamptz default now(), admin_id uuid, action text, target_user_id uuid, detail jsonb)`; beides unter dem bestehenden Advisory-Lock mit information_schema-Prüfung.

## 2. Web
- Route `/admin` in der Expo-Web-App (nur Web; nativ nicht erreichbar). Eigene Admin-Ansicht ohne App-Gate; Admin meldet sich über den normalen SignIn an (eigene Session im normalen Speicher). Nicht-Admin: „Kein Zugriff“.
- Seiten: Nutzer (Suche, Tabelle), Nutzer-Detail (Daten, Geräte, Ergebnisse, Knöpfe „Test-Push“, „Als Nutzer ansehen“), Ergebnisse (Liste, Trace-Ansicht als JSON-Baum lesbar), Werkzeuge (Cron), Protokoll.
- Simulator: iframe `/?imp=1#t=<token>` in einem iPhone-Rahmen (390×844, abgerundet, Notch). Die App im iframe liest den Token aus dem Fragment, entfernt ihn sofort aus der URL, und nutzt einen **getrennten Speicher** (sessionStorage, Präfix `wishfit:imp:<userId>:`) für Session, Personen, Profil, Einstellungen – der Admin-Speicher bleibt unberührt. Oben im iframe ein roter Streifen „Ansicht als <E-Mail> · Beenden“. Beenden ruft `DELETE /admin/impersonate` und schließt den Simulator. Push-Registrierung und PWA-Hinweise sind im Simulator aus.
- Stil: Wishfit-Look, aber dichter (Tabellen), Desktop-tauglich.

## 3. Herkunft und Einladungen
- Schema: `users.signup_source jsonb` (`{utm_source,utm_medium,utm_campaign,utm_term,utm_content,referrer,landing,platform}`, Werte je max. 200 Zeichen, nur bekannte Schlüssel), `users.referred_by uuid references users(id) on delete set null`.
- `POST /auth/verify` nimmt optional `attribution: {utm_*, referrer, landing, platform, ref}`; `ref` ist ein Profil-Slug (auch ein beendeter Slug wird nicht aufgelöst → kein Einlader). Nur bei `created === true` gespeichert; kein Selbst-Einladen.
- Web: beim ersten Laden UTM/Referrer/Landing in `wishfit:attribution` (localStorage, first touch, nie überschrieben); `/u/<slug>` und `?ref=` setzen `ref`, falls noch keiner gesetzt. Nativ: Deep Link `wishloop://u/<slug>` setzt `ref` in den Einstellungen. Landingpage hängt vorhandene UTM-Parameter an „Open Wishfit"-Links an.
- Nach erfolgreichem `verify` mit `created === true` löscht die App die Herkunft (Web: `wishfit:attribution`, nativ: `ref` in den Einstellungen); ein späterer Besuch beginnt einen neuen first touch. Bei `created === false` bleibt sie liegen, das Backend ignoriert sie ohnehin.
- Admin-API: `/admin/users` liefert zusätzlich `source` (utm_source oder `referral`/`direct`), `referred_by_email`, `referrals`; neu `GET /admin/acquisition` → `{by_source:[{source,medium,campaign,users}], top_referrers:[{user_id,email,referrals}]}`.
