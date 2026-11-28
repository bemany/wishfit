# Wishfit screens

Status: work in progress (notes are appended after every block). Test environment: web `wishfit-web-test.vercel.app`, API `wishfit-agent-test.vercel.app`.
Test accounts: `screens-a-1795867061@example.com`, `screens-b-1795867061@example.com` (login codes written to the test DB; deleted at the end).
Mail is not sent for example.com; the request-code call is answered with 204 by Playwright, the code is inserted in the DB.

## 01 Onboarding: language
Purpose: pick the app language. Entry: first start. Next: 02. Texts DE: "Deutsch or English?" (sic, both languages shown), "Du kannst das später unter Ich ändern." EN: same screen, switch changes the following texts. Files: web/01-onb-language-{de,en}.webp.

## 02 Onboarding: intro
DE "Geschenke, die passen." – "Leg für jede Person einen Anhänger an…". Next: 03. Files: web/02-onb-intro-{de,en}.webp.

## 03 Sign-in: e-mail
Purpose: ask for e-mail, send a 6-digit code. Has DE/EN toggle at top. Texts DE: "Anmelden", "Neu hier oder schon dabei: Gib deine E-Mail ein…", "Code senden", "Deine Personen und Wünsche liegen in deinem Konto, auf jedem Gerät." Files: web/03-signin-email-{de,en}.webp.

## 04 Sign-in: code / 05 wrong code / 06 network error
04: code field (placeholder 123456). 05: wrong code message. 06: request-code request aborted -> error note. Files: web/04-…, 05-…, 06-… (de).

## 07 Onboarding: notifications (native only)
Web has no push step (`Platform.OS === 'web'` skips it, onboarding.tsx). Web/PWA: file missing by design.

## 08 Home: empty
Purpose: list of "Anhänger" (people). Entry: after sign-in/onboarding. Next: 09 (Person hinzufügen / plus), 10 chat via tag, Ich (profile icon), Snap (camera icon), "Freunde einladen". Texts DE: "Wen beschenkst du als Nächstes?", "Noch keine Anhänger. Leg die erste Person an, für die du ein Geschenk suchst.", "Person hinzufügen", "Freunde einladen", "Deine Anhänger liegen in deinem Konto." Web shows the install banner (yellow) on top before it is dismissed. Files: web/08-home-empty-de.webp.

## 09/10 Add person
Fields: Name, Budget in Euro, Anlass, Datum (optional), "Budget inklusive Versand", Farbe (5 colours), "Weiter". 09 empty, 10 filled, 10b validation errors ("Ich brauche einen Namen, ein Budget und einen Anlass." / "Das Datum passt nicht. Schreib es als TT.MM.JJJJ."). Observation: both error lines are shown together even when only one applies (here: occasion empty and date short). Files: web/09-…, 10-…, 10b-….

## 11 Chat: empty
Header "MIA · GEBURTSTAG · 40 €", "Mehr"; "Noch nichts auf diesem Anhänger", "Erzähl mir von Mia.", suggestions "WhatsApp-Chat", "Amazon-Wunschliste", input "Nachricht", camera, mic hint ("Diktieren geht auch: Tipp aufs Mikrofon der Tastatur"). Files: web/11-chat-empty-de.webp.

## 12/13 Chat: loading, ideas without prices
Reply "Ich habe ein paar Ideen gefunden, aber noch keine Preisdaten dazu. Welche soll ich genauer prüfen?" with two cards labelled IDEE, quick replies "Günstiger / Etwas anderes / Hat das schon". Files: web/12-…, 13-chat-ideas-no-prices-de.webp.

## 14/15 Chat: more idea replies
14: second request (AeroPress) again answered with an IDEE card; idea cards are not tappable (no state change on tap). 15: person "Tom" with message "Tom ist mein Bruder." -> idea "WUNSCHGUTSCHEIN 50 Euro", no clarifying question. **Not captured: a real recommendation with price/"Warum und wo" detail and alternatives** – the test backend returned only ideas without price data in all three tries (idealo answers took 30–110 s, then no prices). Detail screen, alternatives: web/pwa missing; native will be tried once.
## 16 Home: filled
Three tags (Oma Hilde 30 €, Tom 60 €, Mia 40 €), chips "NEU"/"IDEEN", occasion + budget line. File: web/16-home-filled-de.webp.

## 17–21 Me (Ich)
17 empty (0 wishes): "Mein Anhänger" name field, 5 colours, "Meinen Anhänger an Freunde schicken", "Meine Wunschliste" (empty text), "Wunschlisten-Link einfügen"+"Importieren", "Wunsch hinzufügen", "Sprache" (DE/EN), "Installieren – Zum Home-Bildschirm hinzufügen", "Konto" (e-mail, "Synchronisiert", Abmelden, Konto löschen). 18 link filled, 19 importing, 20 8 wishes ("Aus meiner Amazon-Wunschliste · noch keine Preisdaten", prices only on some rows; long titles are not shortened, some rows have no price), 21 share active ("Dein Anhänger ist geteilt", link `…/u/<slug>`, "Noch mal senden", "Link kopieren", "Nicht mehr teilen"). Files: web/17…21-me-*-de.webp (full page).

## 22–29 Public profile `/u/<slug>`
22 anonymous preview (no account): "Ein geteilter Anhänger", name, "8 Wünsche", buttons "Als Freund hinzufügen" and "In der App öffnen", list "Wünsche von Anna Test" with prices only where known. 23 same screen with account B. 24 after "Als Freund hinzufügen": lands in the friend's chat ("ANNA TEST · GEBURTSTAG · 50 €", "Wünsche von Anna Test", filter "Alle 8"); budget defaults to 50 €. 25 B's home with the new tag (Anna Test, chip NEU). 26 "Mehr" edit person (A, Mia). 27/28 A's share panel (EN) active / after "Stop sharing" (no confirmation dialog, takes effect at once). 29 B opens the old link: "Dieser Anhänger ist nicht mehr geteilt." (ended). Files: web/22…29.
Observation: 23 shows "Als Freund hinzufügen" also to a signed-in user; the anonymous variant 22 shows the same buttons.

## 30–33 Install sheet (/install, web only)
Sheet "App installieren / Wishfit / wishfit-web-test.vercel.app" with steps, buttons "Verstanden" / "Später". 30 iOS 26 Safari (compact bar: menu → Teilen → Mehr anzeigen → Zum Home-Bildschirm), 31 iOS ≤18 Safari (Teilen in toolbar), 32 Android Chrome (menu → App installieren), 33 Desktop Chrome (icon in address bar → App installieren). The onboarding language screen is visible behind the sheet because /install opens it before onboarding. Banner (yellow, "Schneller Zugriff auf Wishfit: jetzt installieren." + "Installieren") appears on the home screen after sign-in (see 08). Banner not shown in standalone mode.

## 40–51 Admin console (web only, MOCKED)
All admin screens were recorded with Playwright `page.route` against mocked `/admin/*` and `/me` responses (realistic test data, admin e-mail esref@bemany.de, users anna@/ben@example.com); ADMIN_EMAILS was not changed. Real API is not involved. Language of the console is English only. 40 no access (signed in, not admin), 41 users list (search "Search e-mail"), 42 user detail (ID, dates, profile, source chip, signup_source JSON, devices, results, data), 43 results, 44 result detail with trace (LLM/MCP steps), 45 acquisition (by source, top referrers), 46 tools (push test, cron), 47 audit log, 48 simulator (iPhone frame, red bar "Ansicht als …", top bar "Viewing as … until … End view"), 49–51 mobile 390 px: users, detail, simulator. Observation (48): the top bar "Viewing as …" overlaps the nav tabs "Tools"/"Audit" at 1280 px. In the simulated app the tag shows "· 0 €" because the mock has no occasion/budget. Files: web/40…51-admin-*-en.webp.

## Native (iOS Simulator "iPhone 18 Pro - Wishloop") – notes
- Captured: 01–07b (onboarding incl. notification dialog, network error, wrong code), 09, 10b, 13, 16, 20/20b/20c, 26 (DE; 01 also EN).
- Not captured natively: 10 filled form (field focus failed via the automation), 08 home-empty (account data syncs in), 11/12/14/15 chat variants, 17–19, 21–25, 27–29, snap (camera unavailable in the Simulator), recommendation, detail ("why and where") and alternatives (test backend only returned "ideas without prices"), EN variants except 01, home with many tags.
- Sign-in used a local proxy (request-code to example.com returns 502 on the test backend) and an inserted code (424242). The app was rebuilt with xcodebuild for this run.

## PWA – notes
- PWA is an emulation: headless Chrome with standalone display mode, not an installed app. Captured: 01–06, 09, 10, 10b, 13, 16, 20, 21, 26, 30. Others not captured; they match web except install banner/sheet (`/install` says already installed).
- Admin screens (40–51) are mocked API responses, web only.
- Not captured anywhere: recommendation with prices, detail screen, alternatives (backend returned ideas only).
