# Plan

Milestones follow `BRIEF.md` §17. The founder asked for the whole build in one pass (ADR-0001), so this file tracks
what exists, what is partial, and what is left, per milestone. Re-plan with real velocity after pilots.

Legend: ✅ done in repo · 🟡 partial / scaffolded · ⬜ not started · 🔒 blocked on a founder decision

## M0 · Engine + Giza pack + guest QR

| Item | State | Notes |
|---|---|---|
| Monorepo, CI workflow, ADRs | ✅ | `.github/workflows/ci.yml`; preview deploys need a host 🔒 |
| Engine core: loader, zones, tiers, player/camera, POIs, cards, MCQ + numeric, vehicles, photo task, i18n/RTL, local save, telemetry | ✅ | |
| pack-schema + validator CLI | ✅ | `pnpm pack:check` |
| giza-plateau ported from `silent-sphinx.html` | ✅ | story, NPCs, rides, balloon rings, photo spots, cartouche, tea, night show |
| Player PWA, `/x/{pack}/{poi}` landing, guest mode | ✅ | service worker caches packs by content hash |
| Done-when: 3 GB Android, 20 s to play, 30 fps low tier | ⬜ | needs real-device run; record in `docs/PERF.md` |

## M1 · Teachers, classes, reports + space pack

| Item | State | Notes |
|---|---|---|
| API: tenants, auth, classes, join codes, assignments, events, aggregation, per-objective reports, CSV | ✅ | |
| OIDC Google/Microsoft | 🟡🔒 | code path behind env config; needs client registrations |
| Portal: catalog, experience pages, teacher area, school admin basics | ✅ | |
| Lesson plan PDFs | 🟡 | Markdown source per pack + print stylesheet; PDF rendering in CI later |
| solar-system ported from `horus-voyage.html` | ✅ | planets, landmarks, crafts, comet, golden asteroids, warp, galaxy, passport, log |
| Pilot kit: demo script, seeded demo school, teacher guide, privacy notice, consent template, feedback form | 🟡 | seed script + Arabic/English privacy notice drafts; counsel review 🔒 |

## M2 · Studio + two new packs

| Item | State | Notes |
|---|---|---|
| Studio: live preview, click-to-place, forms, side-by-side translation, validation panel, raw JSON (engineers) | ✅ | |
| Media library with licence fields | 🟡 | licence form + validation; image→KTX2/WebP conversion needs toolchain choice |
| Review workflow (draft → review → changes → approved → published), revisions, diff | 🟡 | states + comment trail in API; diff view basic |
| Two new packs | ⬜ | topics chosen by founder from pilot requests |

## M3 · Live class trips + publishers

| Item | State | Notes |
|---|---|---|
| Rooms service: teacher hooks, preset phrases, moderation, logs | ✅ | Colyseus |
| Publisher area: books, page links, QR batches (public/batch/per-copy), SVG/PNG sheets, aggregate analytics | ✅ | |
| Pre/post quiz, pilot report export | ✅ | |

## M4 · Scale, compliance, Gulf

| Item | State | Notes |
|---|---|---|
| Consent records, export/delete, retention jobs, breach runbook | 🟡 | data model, admin endpoints and jobs exist; legal text 🔒 counsel |
| Per-tenant data region | 🟡 | field + routing hook; actual regions 🔒 hosting decision |
| Offline pre-download | 🟡 | service worker "download for class" action |
| ar-SA / ar-AE overlays | 🟡 | overlay mechanism + sample overlay; real Gulf content ⬜ |
| LTI 1.3, Classroom/Teams sharing | ⬜ | |
| External security review, accessibility audit | ⬜ | |

## Content follow-ups

- Language review: evidence cards and items in Modern Standard Arabic (ADR-0013).
- Subject-expert fact check of every line in `content/FACTCHECK.md`.
- Curriculum mapping per lesson/page (open question 4).
- Voice-over recording (open question 6); the engine already plays `audio/vo/<locale>/<key>.mp3` when present.
- Real media for evidence cards (NASA/ESA/CC0 museum images) once the founder accepts licences.
