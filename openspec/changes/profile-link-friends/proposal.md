## Why

Heute kann man im eigenen Profil Wünsche als Text pflegen und als Text teilen. Esref (Test 27.11.): Den eigenen Wunschlisten-Link einzutragen und weiterzuschicken ergibt keinen Sinn. Der Link soll die Produkte ins eigene Profil holen, und geteilt wird der eigene Wishfit-Profillink. Wer ihn öffnet, fügt einen als Freund hinzu und sieht die Wünsche.

## What Changes

- **Wunschliste importieren**: Im eigenen Profil einen Link (zuerst Amazon-Wunschliste) einfügen; das Backend liest die Produkte (Name, Preis, Bild, Link) aus und die App übernimmt sie als Wünsche. Wünsche werden von Text zu Objekten (Text bleibt gültig).
- **Profil teilen**: Angemeldete Nutzer schalten ihr Profil öffentlich und bekommen einen Link `…/u/<slug>`. Geteilt wird nur noch dieser Link. Teilen beenden macht den Link ungültig.
- **Öffentliches Profil**: Ohne Anmeldung lesbar: Name, Farbe, Wünsche. Nichts anderes (keine E-Mail, keine Personen, keine Verläufe).
- **Als Freund hinzufügen**: Öffnet jemand den Link (App per Deep Link, sonst Web-App), sieht er das Profil und kann die Person mit einem Tipp als Tag anlegen. Die Person merkt sich den Slug, ihre Wünsche werden beim Öffnen aktualisiert und dienen dem Agenten als Kontext.
- Der bisherige Knopf „Share my wishlist“ (Text) entfällt zugunsten des Profillinks.

## Capabilities

### New Capabilities

- `profile-sharing`: Wunschlisten-Import, öffentliches Profil per Link, Freund hinzufügen.

### Modified Capabilities

(keine Hauptspecs vorhanden; baut auf `accounts-and-web` auf)

## Impact

- Backend `services/agent`: Endpunkte `POST /wishlist/import`, `POST/DELETE /me/share`, `GET /profiles/{slug}`; Spalte `users.profile_slug`.
- App `apps/mobile`: Profil-Screen (Import, Teilen, Stop), Deep Link `wishloop://u/<slug>` und Web-Route `/u/<slug>`, Screen „Freund hinzufügen“, Person mit `friendSlug`, Wünsche als Agent-Kontext.
- Nicht im Umfang: gegenseitige Freundschaftsanfragen, Benachrichtigungen, andere Shops als Amazon beim Import, eigene Domain.
