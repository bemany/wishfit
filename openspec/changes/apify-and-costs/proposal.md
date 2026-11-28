# Preisquelle Apify und Kostenübersicht

## Why
Der idealo-MCP-Zugang aus dem Hackathon ist seit 28.11.2026 ungültig (`invalid_client`); die Partner-Anfrage an idealo läuft. Bis dahin sollen Entwicklung und Tests mit echten Preisen weitergehen. Außerdem will Esref die laufenden Kosten (Modell, Apify, Mails, Push) in der Admin-Konsole sehen.

## What Changes
- Zweite Preisquelle: Adapter für Apify-Actors hinter derselben Schnittstelle wie der idealo-Client (Suche, Angebote, Preisverlauf). Schalter `PRICE_SOURCE=idealo|apify` (Standard `idealo`). Actors: `memo23/idealo-scraper` (Suche, Angebote), `ahmed_jasarevic/idealo-scraper` (3-Monats-Preisverlauf). Tokens aus `APIFY_TOKENS` (kommagetrennt), Läufe rotieren über die Konten, ein leeres oder gesperrtes Konto wird übersprungen.
- Nur im Test-Backend; Daten werden im Trace als `source: "apify"` geführt. Abschalten, sobald idealo-Partnerzugang da ist (dann `PRICE_SOURCE=idealo`).
- Kostenerfassung: je Anfrage Kosten-Ereignisse (Modell: Tokens × Preis je Modell; Apify: `usageTotalUsd` des Laufs; Resend: Anzahl Mails; APNs: Anzahl Mitteilungen) in einer Tabelle, Tagessummen; Admin-Seite „Kosten“ (Tag/Woche/Monat, nach Quelle und Nutzer, Restguthaben je Apify-Konto, Warnung unter 1 $).

## Impact
services/agent (neues apify.py, idealo-Schnittstelle, costs in db/admin, Modellpreise), apps/mobile Admin-Seite „Kosten“, Vercel-Env `PRICE_SOURCE`, `APIFY_TOKENS`, `MODEL_PRICES` (optional).

## Risiken (bewusst entschieden von Esref, 28.11.2026)
- idealo-Nutzungsbedingungen untersagen Scraping; Einsatz nur im Test, nicht öffentlich als offizielle idealo-Daten.
- Rotation über 5 kostenlose Apify-Konten kann gegen die Apify-Bedingungen verstoßen und zur Sperre führen.
