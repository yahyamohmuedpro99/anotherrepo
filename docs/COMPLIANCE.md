# Compliance notes (engineering assumptions)

These are **assumptions for engineering**, not legal advice. Every row marked ⚖️ must be confirmed by counsel
before launch (BRIEF §11).

## Egypt — Personal Data Protection Law No. 151 of 2020 + executive regulations (Decree 816 of 2025)

| Assumption | ⚖️ | How the product meets it |
|---|---|---|
| Children's data is sensitive data | ⚖️ | Minimum collection: display name + class for students; no email/phone for under-15s |
| Processing children's data needs explicit parent/guardian consent | ⚖️ | `consent_records` per student (school collects, we store proof: who, when, document hash); assignments can require it |
| Breach notification to the Personal Data Protection Center within 72 h | ⚖️ | `docs/INCIDENT.md` runbook with a 72 h clock |
| Cross-border transfer needs a licence/permit | ⚖️ | `tenants.data_region`; personal data tables are written only to that region's database (deployment per region) |
| A data protection officer may be required | ⚖️ | DPO contact in privacy notice (placeholder, open question 10) |

## Saudi Arabia (PDPL) and UAE (Federal Decree-Law No. 45 of 2021)

Same design: per-tenant region, consent records, data-subject requests (export/delete), breach runbook. Confirm
country specifics (and free-zone rules) with local counsel before the first Gulf contract. ⚖️

## Built in from day one

| Control | Where |
|---|---|
| Guest mode stores no personal data server-side | Player sends events with an anonymous `deviceId` only; API stores counts |
| Students need no email/phone | `POST /v1/join` with class code + display name |
| Display names from an allow-list or teacher-approved | `display_name_status` = `listed` / `pending` / `approved`; moderation queue |
| Data export & deletion per student and tenant, with audit log | `POST /v1/admin/data-requests`; worker job `data.export` / `data.delete` |
| Per-tenant retention; automatic deletion jobs with tests | `tenants.retention_days`; job `retention.sweep` |
| No ad, marketing or session-replay trackers | No third-party scripts in player; CSP in player `index.html` |
| Encryption in transit / at rest; secrets in a vault | TLS terminates at the gateway (deployment); DB at-rest encryption is a hosting setting ⚖️; secrets via env from a vault (provider choice open) |
| Staff access audited | `audit_log` on impersonation, data requests, moderation |
| Chat (when enabled) and moderation logs kept 30 days | `room_logs` + `retention.rooms` job |

## Cultural review

Every pack carries `sensitivity` flags (e.g. `burial-practices`) and a per-country review state. Country-specific
content goes into `overlays/<locale>/`, never a fork. Maps showing borders use the version the country's
curriculum requires (no border maps in v1 packs).
