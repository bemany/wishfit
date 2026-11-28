## 1. Backend
- [x] 1.1 ADMIN_EMAILS, Admin-Abhängigkeit, Schema (sessions.impersonated_by, admin_audit)
- [x] 1.2 /admin/users, /admin/users/{id}, /admin/results, /admin/results/{id}, /admin/audit
- [x] 1.3 /admin/push-test, /admin/cron
- [x] 1.4 Impersonation start/ende, Sperren (admin, DELETE /me, POST /me/devices), Audit-Middleware für schreibende Aufrufe, /me mit impersonated_by_email
- [x] 1.5 selfcheck, docs/api.md, Deploy, Env ADMIN_EMAILS
## 2. Web
- [x] 2.1 Route /admin, Admin-Prüfung, Layout
- [x] 2.2 Nutzer, Detail, Ergebnisse/Trace, Werkzeuge, Protokoll
- [x] 2.3 Simulator (iframe im Handy-Rahmen, Token im Fragment, getrennter Speicher, Hinweisstreifen, Beenden)
## 3. Prüfung
- [ ] 3.1 Live: Nicht-Admin 403, Admin-Liste, Impersonation, DELETE /me verboten, Ablauf, Audit
- [x] 3.2 Web-Test (Playwright): Konsole, Simulator, Admin-Speicher unverändert
## 4. Herkunft
- [x] 4.1 Backend: users.signup_source/referred_by, verify.attribution, /admin/acquisition, Felder in /admin/users
- [x] 4.2 Web/App: first-touch Erfassung, ref aus Profillink/?ref, Mitsenden bei verify; Landing reicht UTM weiter
- [x] 4.3 Admin: Herkunft/Einlader je Nutzer, Übersicht Quellen und Top-Einlader
