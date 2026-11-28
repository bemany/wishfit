# Wishfit user journey

```mermaid
flowchart TD
  A[First start] --> B[01 Language]
  B --> C[02 Intro]
  C --> D[03 Sign-in: e-mail]
  D -->|network error| D6[06 Error note]
  D6 --> D
  D -->|code sent| E[04 Code]
  E -->|wrong code| E5[05 Wrong code]
  E5 --> E
  E -->|ok| F{native?}
  F -->|yes| G[07 Notifications]
  F -->|web / PWA| H
  G --> H[08 Home empty]
  H -->|Person hinzufügen / +| I[09 Add person]
  I -->|missing field| I2[10b Validation]
  I2 --> I
  I -->|10 filled, Weiter| J[11 Chat empty]
  J -->|message| K[12 Loading]
  K --> L[13/14/15 Ideas, no prices]
  K -->|price data| M[Recommendation / Warum und wo / Alternatives]
  L --> J
  J -->|Mehr| N[26 Edit person]
  J --> O[16 Home filled]
  O -->|profile icon| P[17-20 Me: name, colour, import, wishes]
  P --> Q[21 Share active]
  Q -->|link| R[22 Public profile, no account]
  R -->|Als Freund hinzufügen| D
  R --> S[23 Public profile, signed in]
  S -->|Als Freund hinzufügen| T[24 Friend chat with wishes]
  T --> U[25 Home with friend]
  Q -->|Nicht mehr teilen| V[28 Share stopped]
  V -.-> W[29 Profile ended]
  O -->|camera icon| X[Snap: camera / upload]
  H --> Y[Install banner]
  Y --> Z[30-33 Install sheet per platform]
  P -->|Konto löschen| AA[Account deleted]
  AB[/admin] --> AC[41 Users] --> AD[42 Detail] --> AE[48 Simulator]
  AC --> AF[43 Results] --> AG[44 Trace]
  AC --> AH[45 Acquisition]
  AC --> AI[46 Tools]
  AC --> AJ[47 Audit]
```

## Screens (numbers match the folders native/, web/, pwa/)

| No. | Screen |
|---|---|
| 01 | Onboarding: language |
| 02 | Onboarding: intro |
| 03 | Sign-in: e-mail |
| 04 | Sign-in: code |
| 05 | Sign-in: wrong code |
| 06 | Sign-in: network error |
| 07 | Onboarding: notifications (native only) |
| 08 | Home: empty (+ install banner on web) |
| 09 | Add person: empty |
| 10 | Add person: filled / 10b validation errors |
| 11 | Chat: empty |
| 12 | Chat: loading / ideas |
| 13–15 | Chat: ideas without prices |
| 16 | Home: filled |
| 17 | Me: empty |
| 18–19 | Me: import link entered / importing |
| 20 | Me: wishes with prices |
| 21 | Me: share active |
| 22 | Public profile `/u/<slug>`, no account |
| 23 | Public profile, signed in |
| 24 | Friend added: chat with friend's wishes |
| 25 | Home with friend |
| 26 | Edit person |
| 27–28 | Share panel (EN) active / stopped |
| 29 | Public profile ended |
| 30–33 | Install sheet: iOS 26 Safari, iOS ≤18 Safari, Android, Desktop (web only) |
| 40–51 | Admin console, mocked (web only) |
