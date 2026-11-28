## ADDED Requirements

### Requirement: Umschaltbare Preisquelle
Das Backend SHALL Preise und Angebote aus der mit `PRICE_SOURCE` gewählten Quelle holen und sie im selben internen Format an den Agenten geben.

#### Scenario: Apify aktiv
- **WHEN** `PRICE_SOURCE=apify` gesetzt ist und eine Empfehlung angefragt wird
- **THEN** kommen Treffer, Angebote und Preisverlauf aus den Apify-Actors, der Trace führt `source: "apify"`

#### Scenario: Konto erschöpft
- **WHEN** ein Apify-Konto kein Guthaben mehr hat
- **THEN** nutzt das Backend das nächste Konto aus `APIFY_TOKENS`
