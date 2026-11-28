## 1. Backend
- [ ] 1.1 ADMIN_EMAILS, Admin-Abhängigkeit, Schema (sessions.impersonated_by, admin_audit)
- [ ] 1.2 /admin/users, /admin/users/{id}, /admin/results, /admin/results/{id}, /admin/audit
- [ ] 1.3 /admin/push-test, /admin/cron
- [ ] 1.4 Impersonation start/ende, Sperren (admin, DELETE /me, POST /me/devices), Audit-Middleware für schreibende Aufrufe, /me mit impersonated_by_email
- [ ] 1.5 selfcheck, docs/api.md, Deploy, Env ADMIN_EMAILS
## 2. Web
- [ ] 2.1 Route /admin, Admin-Prüfung, Layout
- [ ] 2.2 Nutzer, Detail, Ergebnisse/Trace, Werkzeuge, Protokoll
- [ ] 2.3 Simulator (iframe im Handy-Rahmen, Token im Fragment, getrennter Speicher, Hinweisstreifen, Beenden)
## 3. Prüfung
- [ ] 3.1 Live: Nicht-Admin 403, Admin-Liste, Impersonation, DELETE /me verboten, Ablauf, Audit
- [ ] 3.2 Web-Test (Playwright): Konsole, Simulator, Admin-Speicher unverändert
