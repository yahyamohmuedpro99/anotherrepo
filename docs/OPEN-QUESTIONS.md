# Open questions for the founder

None of these block the build; each has a reversible default noted.

| # | Question | Default used now |
|---|---|---|
| 1 | Final product name, domain and short-link domain | "Rihla", `rihla.local` / `r.local` in config (`PUBLIC_ORIGIN`, `SHORT_ORIGIN`) |
| 2 | Hosting region for Egyptian tenants (in-country vs approved cloud region) and for Gulf tenants | Docker images, `DATA_REGION` per tenant, no provider chosen |
| 3 | First publisher partner and which book pages get the first QR codes | Seeded demo publisher "دار النموذج" with one sample book |
| 4 | Exact lesson mappings (grade, unit, lesson, page) for Giza and space | `lesson: "TODO"` in manifests; validator warns |
| 5 | Pricing tiers to support in the data model | `contracts.pricing_model` enum: per_student, per_class, per_school, per_copy, mixed |
| 6 | Who records voice-over; who does subject-expert and cultural reviews | Subtitles only; review states exist in the Studio |
| 7 | Teachers: school email only, or personal Google/Microsoft too | School email + password; OIDC off until configured |
| 8 | Accept SIL OFL 1.1 for the four self-hosted fonts (ADR-0008) | Accepted provisionally |
| 9 | Accept CC BY / CC0 / NASA terms for evidence media (none bundled yet) | Cards are text-only |
| 10 | Who is the data protection officer (Egypt PDPL) | Placeholder in `docs/COMPLIANCE.md` |
| 11 | Free-text chat in live rooms: allow teachers to enable it at all for under-15s? | Off by default, teacher toggle exists, word-filtered |
