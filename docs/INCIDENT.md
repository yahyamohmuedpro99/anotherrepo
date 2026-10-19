# Breach / incident runbook

Clock starts when anyone on the team **suspects** personal data was exposed, lost or altered.

| Time | Step | Owner |
|---|---|---|
| 0 h | Open an incident channel; name an incident lead; start a timeline (UTC) | First responder |
| ≤ 1 h | Contain: revoke credentials/tokens (`pnpm --filter @rihla/api exec tsx src/scripts/revoke-all.ts --tenant <id>`), block the vector, snapshot logs and DB | Incident lead |
| ≤ 4 h | Scope: which tenants, which tables (students? consent records?), which region | Engineering |
| ≤ 24 h | Decide notification; draft notices (Arabic + English) to affected schools | Founder + DPO ⚖️ |
| ≤ 72 h | Notify the Personal Data Protection Center (Egypt) and other regulators as required ⚖️; notify schools | DPO |
| After | Post-mortem within 7 days; fix; add a test or alert that would have caught it | Engineering |

Contacts: DPO — _TBD (open question 10)_ · Hosting provider security — _TBD (open question 2)_.
