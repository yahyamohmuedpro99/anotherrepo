# Rihla Platform – Agent Build Brief

2026-10-19 · @Yahya

## How to use this brief

**ملاحظة ليك قبل ما تبدأ:** البريف ده مكتوب بالإنجليزي عشان الـ coding agents بتشتغل بيه بدقة أكبر، لكن كل اللي هيشوفه الطالب والمعلم هيبقى بالعربي المصري الأول. صدّره Markdown واحفظه في المشروع باسم `BRIEF.md`، أو الصقه كأول رسالة للـ agent. وابعت معاه ملفات النماذج التلاتة: `silent-sphinx.html` و `horus-voyage.html` و `giza-babylon.html`.

You are the founding engineer and tech lead of **Rihla** (working name): a web platform of short, curriculum-linked 3D exploration experiences in Arabic, opened from a school portal or a QR code printed in a textbook. Build it milestone by milestone as laid out in the Milestones section, starting from the prototypes the founder attaches.

Working rules:

1. Before writing code, turn this brief into `docs/ARCHITECTURE.md` and `docs/PLAN.md`, then stop and wait for the founder's approval.
2. Keep `docs/DECISIONS.md` as short ADRs (date, decision, options considered, why).
3. Ask the founder before you: pick a cloud provider or region, pick an auth or analytics vendor, add any paid service, store children's data outside the tenant's region, accept a third-party asset licence, or delete data.
4. Ship in small, reviewable PRs. Each PR carries tests and a two-line demo note (what to open, what to see).
5. Never invent educational facts. Anything you write as content gets the `needs-fact-check` tag and a line in `content/FACTCHECK.md` with a source link.
6. Every user-facing string exists in Egyptian Arabic (RTL, first) and English (second).
7. Prefer boring, proven tech. Avoid lock-in where it is cheap to avoid.
8. When this brief disagrees with reality (an API changed, a number is wrong), say so and propose a fix instead of silently diverging.

## 1. Product context

**One line:** short Arabic 3D exploration trips, each tied to a specific lesson, that open straight from a textbook page or a teacher's assignment, run in the browser with no install, and give the teacher a report per learning objective.

**Why this exists.** Arabic-language, curriculum-mapped 3D content for Egyptian and Gulf schools barely exists. Global players (Mozaik3D, Legends of Learning, Labster, Minecraft Education) are English-first and priced for richer markets: Mozaik3D runs about 26–36 € per student per year with a ~211 MB app, and Legends of Learning about $790 per class or $4,450 per school. Local digital supplements are cheap (Adwaa Digital is about 1,250 EGP per term), and printed external books (الكتب الخارجية) sell for 159–215 EGP. The gap is between those price points: an Arabic product that rides on books students already buy.

**What the evidence says about learning.** In Ubisoft's Discovery Tour study, students who explored alone went from 22% to 41% on a knowledge test, while those guided by a teacher reached 55%. Meta-analyses of immersive learning show moderate effects (about g = 0.38 overall, about g = 0.61 in K-12). The product must therefore be built for **teacher-guided use first**, with solo play as the secondary mode.

**v1 scope (keep it narrow):**

- Subjects: Egyptian heritage (social studies / history) and space (science).
- Grades: 4th primary to 2nd preparatory (ages roughly 9–14).
- Market: Egypt first (private, language and international schools), Gulf (KSA, UAE) as a later overlay.
- Channels: (a) textbook publishers that print QR codes in their external books, (b) direct school subscriptions, (c) a free public sample to drive both.

**Non-goals for v1:** covering whole curricula; consumer (B2C) payments; open chat between strangers; VR headsets; native mobile apps (PWA only); user-generated content by students; ads of any kind.

**Success signals for the pilot:** a teacher can run a 40-minute lesson with a class with zero setup beyond sharing a code; a student who scans a QR code is playing within 20 seconds on a mid-range Android phone; post-quiz scores beat pre-quiz scores; teachers ask to use it again.

## 2. Users and core flows

**Roles** (one user can hold several, scoped per tenant):

| Role | What they do | Data we hold |
|---|---|---|
| Guest player | Scans a QR code, plays, sees their own progress | None server-side beyond an anonymous device id and event counts |
| Student | Joins a class with a code, plays assignments, earns passport stamps | Display name, class, progress, answers (no email or phone required) |
| Teacher | Creates classes, assigns trips, runs live sessions, reads reports | Name, school email |
| School admin | Manages seats, teachers, classes, billing contact | Name, school email |
| Publisher admin | Links packs to book pages, generates QR batches, reads aggregate scans | Name, work email |
| Author / reviewer | Builds and reviews packs in the Studio | Name, work email |
| Platform admin | Tenants, licences, moderation, support | Internal staff only |

**Flow A: QR from the book (the money flow).**

1. Student scans the QR next to the lesson in an external book.
2. Opens `/x/{packId}/{poiId}?c={code}` and the experience loads straight at that point of interest, in Arabic, with a 3-second intro.
3. Plays the mini-mission (5–10 minutes) as a guest; progress is stored locally.
4. At the end: score, a passport stamp, and an optional "join your class" prompt if the teacher gave them a class code.

**Flow B: teacher-led lesson (the evidence flow).**

1. Teacher picks a trip from the catalog and reads the one-page lesson plan.
2. Creates an assignment for a class (or starts a live session) and shares a 6-character code on the board.
3. Students join (no accounts needed for under-15s beyond a class code + display name chosen from an allow-list or typed and approved by the teacher).
4. During the live session the teacher can pause everyone, gather everyone to a point, spotlight one student's view, lock movement, and push a question.
5. After the session: results per learning objective, per student, with a CSV export.

**Flow C: publisher setup.**

1. Publisher admin picks a book, chapter and page and links it to a pack + POI.
2. Generates a QR batch (public code, or per-copy one-time codes).
3. Downloads print-ready SVG/PNG with the short URL printed underneath.
4. Reads aggregate scan and completion stats per page (never per child).

**Flow D: school subscription.** School admin signs a contract offline; platform admin creates the tenant and seat count; school admin invites teachers by email; teachers create classes.

## 3. Architecture and stack

One monorepo, one runtime engine, and experience packs that are pure data. Each "game" is not a separate app: it is a pack the same engine loads, so a fix or a new feature in the engine reaches every pack at once, and the portal can report on all of them the same way.

*platform architecture · 3 apps, 1 engine, 3 services, 3 data stores*

The Studio publishes a pack through the API, which validates and builds it into object storage; the CDN serves it to every app, and the engine sends learning events back to the API.

**Monorepo layout** (TypeScript strict, pnpm workspaces + Turborepo):

```
apps/portal          Next.js: public catalog, teacher, school, publisher, admin
apps/player          Vite PWA: QR landing + full-screen player (mounts the engine)
apps/studio          Vite + React: authoring for the content team
apps/api             NestJS or Fastify: REST + OpenAPI, auth, tenants
apps/rooms           Colyseus: live class sessions
apps/workers         queue consumers: event aggregation, pack builds, deletions
packages/engine      three.js runtime (section 4)
packages/pack-schema JSON Schema + TS types + validator CLI (section 5)
packages/api-client  generated from the OpenAPI spec
packages/ui          shared React components, RTL first
packages/i18n        locale loading, ICU formatting, numerals
packs/giza-plateau   first pack, ported from the prototype
packs/solar-system   second pack, ported from the prototype
infra/               Dockerfiles, IaC, CI workflows
docs/                ARCHITECTURE, PLAN, DECISIONS, COMPLIANCE, PERF, FACTCHECK
```

**Stack choices** (defaults; change one only through an ADR):

| Layer | Default | Note |
|---|---|---|
| 3D | three.js (pinned), glTF 2.0, Draco/Meshopt, KTX2 | WebGPU later behind the renderer adapter |
| Web apps | React, Next.js for the portal, Vite for player and Studio | Player must not depend on Next.js |
| API | NestJS or Fastify, Zod or TypeBox schemas, OpenAPI 3.1 | Pick one in the first ADR |
| Database | PostgreSQL 16 with Prisma or Drizzle | Row-level security on `tenantId` as a second guard |
| Cache and jobs | Redis + BullMQ | Or pg-boss if we want one less service |
| Realtime | Colyseus | Redis presence when scaling past one node |
| Files | S3-compatible storage + CDN | Packs are global; personal data is not stored here |
| Auth | Own auth with OIDC (Google, Microsoft) for adults; class code + display name for students | Ask before adopting a hosted auth vendor |
| Hosting | Docker images, region-configurable | No proprietary cloud services where an open option is cheap |
| CI/CD | GitHub Actions: lint, typecheck, tests, `pack:check`, Playwright, perf smoke, preview deploys | Main is always deployable |
| Observability | OpenTelemetry traces and metrics, error tracking with personal data scrubbed | No session replay on student pages |

## 4. Runtime engine (`packages/engine`)

One engine plays every experience. A pack is data plus assets; it never ships its own JavaScript. If a pack needs something the engine cannot do, the engine gains a new generic, declarative behaviour that every pack can then use. This is the single most important rule of the architecture: it is what makes pack number 20 cost a fraction of pack number 1.

**Rendering base:** three.js (current stable, pinned) with WebGL2; keep a thin adapter so a WebGPU renderer can be switched on later. Babylon.js was evaluated (see `giza-babylon.html`); stay on three.js unless a spike shows a clear win, and record the decision as an ADR.

**Modules** (each a folder with its own tests and a typed public API):

- **Loader:** glTF 2.0 with Draco or Meshopt geometry and KTX2/Basis textures; progressive loading (low LOD first, swap in high LOD); a content-hash cache via the service worker.
- **World and zones:** a pack declares zones (e.g. plateau, Sphinx enclosure, solar boat museum); zones stream in and out by distance; terrain from heightmap or mesh; sky, sun and time-of-day presets.
- **Quality tiers:** `low`, `mid`, `high`, picked automatically from a 3-second benchmark plus device hints, overridable by the user. Tiers control pixel ratio, shadow maps, post-processing, draw distance, crowd and particle counts.
- **Player and camera:** walk (third person), fly (orbit), and scripted rides; touch joystick plus drag-to-look on mobile, WASD plus mouse on desktop, gamepad optional.
- **Vehicles:** a generic vehicle behaviour with presets (camel, horse carriage, hot-air balloon, spacecraft) defined by speed, height, path or free movement, mount and dismount animation.
- **Points of interest (POIs):** a place in the world with a trigger radius, an icon, a title, an evidence card and optional dialogue and questions.
- **Dialogue:** branching lines from a guide character, with voice-over clips and portraits; text always visible as subtitles.
- **Quests and missions:** ordered or free steps, each completed by a condition (reach POI, answer question, collect item, take photo, measure something).
- **Assessment types:** multiple choice, ordering, matching, numeric with tolerance and unit, map hotspot (tap the right place), in-world measurement (pace out a pyramid side), and photo task (frame a target in the camera). Each item maps to one or more learning objectives.
- **Evidence cards:** a real photo, scan or document with caption, source and licence; optional "then vs now" slider.
- **Photo mode and album:** framing guides, filters, captions, save to album and download.
- **Map and compass:** mini-map, full map with discovered POIs, fast travel between discovered points.
- **Passport and badges:** stamps per pack and per mission, shown across the whole catalog.
- **i18n and RTL:** every string comes from the pack's locale files; full RTL layout; Arabic and Latin numerals by locale.
- **Accessibility:** subtitles always, adjustable text size, colour-blind safe palette, reduced motion, keyboard navigation for all UI, screen-reader labels on all HUD controls.
- **Audio:** music, ambience and voice-over buses with separate volume; ducking under voice-over.
- **Save:** local save always; cloud save when signed in; conflict rule = furthest progress wins.
- **Telemetry:** emits learning events (see section 9) through one queue that batches, retries offline, and drops nothing.
- **Teacher hooks:** receives `pause`, `gather(poiId)`, `spotlight(studentId)`, `lockMovement`, `pushQuestion(itemId)`, `end` from the room server.
- **Class rooms:** optional multiplayer presence via the rooms service (section 10).
- **Guest mode:** runs fully without an account; can be upgraded to a student account later and keep progress.

**Declarative behaviours only.** The full list of behaviours a pack may use is defined in `packages/pack-schema` (e.g. `trigger.onEnter`, `show.card`, `play.vo`, `give.stamp`, `start.quest`, `spawn.vehicle`, `set.timeOfDay`, `camera.flyTo`). Adding a behaviour is an engine PR with tests, never a pack-level script.

**Engine API to the host page:** `Rihla.mount(el, { packUrl, startPoi, locale, user, roomToken, onEvent })` returns a handle with `pause()`, `resume()`, `goto(poiId)`, `destroy()`. The portal, the QR landing page and the Studio preview all use this same call.

## 5. Experience pack format (`packs/*`, `packages/pack-schema`)

A pack is a versioned folder that the engine loads. Packs are built and validated by a CLI and published to the CDN as immutable, content-hashed bundles.

**Folder layout:**

```
packs/giza-plateau/
  manifest.json          # metadata, curriculum links, zones, budgets
  world/                 # .glb files (Draco/Meshopt, KTX2 textures)
  pois/                  # one JSON per point of interest
  quests/                # mission definitions
  items/                 # assessment items
  cards/                 # evidence cards + media/ + licences
  dialogue/              # guide lines, per locale
  locales/ar-EG.json     # every UI and content string
  locales/en.json
  overlays/ar-SA/        # country overlay (optional)
  audio/                 # music, ambience, VO per locale
  teacher/               # lesson plan, worksheet, answer key (PDF + source)
  LICENSES.json          # every third-party asset with source and licence
```

**Manifest fields (required unless marked optional):** `id`, `version` (semver), `title` and `summary` (keys into locales), `subjects`, `grades`, `durationMinutes`, `objectives[]` (id, text key, curriculum refs per country), `curriculum[]` (country, grade, subject, unit, lesson, book pages), `zones[]`, `startPoi`, `pois[]`, `quests[]`, `vehicles[]` (optional), `budgets` (download MB per tier, max draw calls, max texture MB), `locales[]`, `overlays[]` (optional), `sensitivity` (flags for cultural review), `credits`, `reviewStatus`.

**Example (trimmed):**

```json
{
  "id": "giza-plateau",
  "version": "1.0.0",
  "title": "pack.title",
  "subjects": ["social-studies"],
  "grades": ["EG-P4", "EG-P5"],
  "durationMinutes": 20,
  "objectives": [
    { "id": "obj.pyramid-purpose", "text": "obj.pyramid-purpose",
      "curriculum": [{ "country": "EG", "grade": "P4", "subject": "social-studies", "lesson": "TODO" }] }
  ],
  "zones": [
    { "id": "plateau", "model": "world/plateau.glb", "streamRadius": 900 },
    { "id": "sphinx", "model": "world/sphinx.glb", "streamRadius": 400 }
  ],
  "startPoi": "poi.panorama",
  "pois": ["pois/khufu.json", "pois/sphinx.json", "pois/solar-boat.json"],
  "quests": ["quests/scarab.json"],
  "vehicles": [{ "preset": "camel" }, { "preset": "carriage" }, { "preset": "balloon" }],
  "budgets": { "low": { "downloadMB": 15, "drawCalls": 150, "textureMB": 48 } },
  "locales": ["ar-EG", "en"],
  "sensitivity": ["burial-practices"],
  "reviewStatus": "draft"
}
```

**Validator CLI** (`pnpm pack:check packs/giza-plateau`) fails the build on: schema errors; a string key missing in any declared locale; an asset with no entry in `LICENSES.json`; an item with no objective; a POI with no reachable path from `startPoi`; any budget exceeded on any tier; any file larger than 8 MB; any texture not in KTX2. It prints a report the Studio shows as a checklist.

**Versioning:** published packs are immutable. A fix is a new patch version; assignments pin a minor version so a lesson never changes under a teacher mid-term.

## 6. Portal (`apps/portal`)

The portal is the website teachers, school admins and publishers log into, and the public face of the catalog. Next.js (App Router), server-rendered, Arabic RTL first, works well on a phone.

**Public pages:** landing page; catalog with filters (subject, grade, country curriculum, duration, language); experience page with trailer, objectives, curriculum links, lesson plan preview and a "try the free sample" button; pricing contact form; privacy policy and parental notice in Arabic and English.

**Teacher area:**

- Classes: create, rename, archive; join code (6 characters, regenerable); roster with display names; optional bulk import from CSV.
- Assignments: pick pack + mission, due date, attempts allowed, hints on or off, pre/post quiz on or off.
- Live session: one screen to start a session, see who is in, and send the teacher hooks (pause, gather, spotlight, lock, push question, end). Big buttons; works from a laptop connected to a projector.
- Results: per class and per student, scores per learning objective (not just total), time spent, hints used, common wrong answers; CSV export.
- Lesson resources: lesson plan, worksheet, answer key, slide of the QR codes for the board.

**School admin area:** seats used vs bought, teachers (invite, deactivate), classes overview, usage by grade and subject, contract dates.

**Publisher area:** books → chapters → pages, each linked to pack + POI; QR batches (create, download SVG/PNG/PDF sheets with the short URL printed below); scan and completion analytics per page, aggregated only, never per child.

**Platform admin:** tenants, seats and licences, pack publishing and rollback, moderation queue for display names, support impersonation with audit log.

**Design rules:** RTL first; one Arabic UI font self-hosted (e.g. IBM Plex Sans Arabic or Noto Kufi Arabic, licensed under OFL) with a matching Latin fallback; WCAG 2.2 AA contrast; every page usable at 360 px wide; no carousels hiding content; no dark patterns.

## 7. QR codes and deep links

QR codes are how the product reaches students through books they already own, so they must never break: a code printed in 2027 must still open something useful in 2032.

**URL shape:** `https://{domain}/x/{packId}/{poiId}?c={code}` behind a short redirect `https://{short}/{slug}` that is what actually gets printed. The short slug maps to a record in our database, so the destination can change without reprinting.

**Code types:**

| Type | Use | Behaviour |
|---|---|---|
| Public | Free sample, marketing | Anyone can open; limited to one mission |
| Book batch | One code per book page, same in every copy | Opens the full mission for that page; rate-limited per device |
| Per-copy activation | A unique code printed or stickered in each copy | First scan activates the full pack for that device or student for the school year |
| Class | Shown on the board by a teacher | Joins the class and its assignment |

**Landing behaviour:**

1. Load a tiny landing shell (target under 50 KB) with the pack poster and an Arabic one-liner while the engine downloads.
2. Detect device tier; on very weak devices offer a "lite" mode (fewer effects) or a 2D fallback (cards and questions only) rather than failing.
3. Start the player at the linked POI; skip the main menu.
4. If the pack version linked from a page is retired, redirect to the closest current POI and log it.

**Abuse and limits:** rate-limit scans per IP and per device; per-copy codes are single-use and tied to a device id; publishers see a weekly report of codes with suspicious volumes. No personal data is collected through a QR scan.

## 8. Authoring Studio (`apps/studio`)

The Studio is how the content team (not engineers) builds and maintains packs. Target: a two-person content team ships a new 15–20 minute pack in 3–4 weeks once 3D assets exist. If that target is missed, the Studio is the thing to fix.

**Core features:**

- **Live preview:** the real engine running inside the Studio, at any quality tier, with a device-frame toggle (phone, tablet, laptop).
- **Click-to-place:** click in the world to place a POI, trigger zone, camera point, vehicle spawn or photo spot; drag to move; numeric fields for exact position.
- **Content editors:** POIs, dialogue trees, quests, assessment items, evidence cards, all as forms over the pack schema, never raw JSON for authors (raw JSON view for engineers only).
- **Side-by-side translation:** Arabic and English columns for every string; missing translations highlighted; a country overlay column when one exists.
- **Media library:** upload images, audio, models; every upload requires source URL, author, licence type, licence URL and attribution text before it can be used. Images auto-converted to KTX2/WebP; models run through glTF optimisation.
- **Curriculum mapping:** pick country, grade, subject, unit, lesson and book pages from a managed list; link items to objectives.
- **Validation panel:** the same checks as the CLI (schema, locales, licences, budgets, reachability, RTL overflow), shown as a checklist with click-to-fix.
- **Workflow:** `draft → in review → changes requested → approved → published`. Reviews are separate for content accuracy (subject expert), language, and cultural sensitivity per country. Every review leaves a comment trail.
- **Versioning:** every save is a revision; published versions are immutable; diff view between versions.

Studio and portal share auth, UI kit and API, but they are separate apps with separate permissions. The Studio is internal-only in v1 (no publisher self-authoring).

## 9. Backend, data model and learning events (`apps/api`)

**API style:** REST with an OpenAPI 3.1 spec generated from code; typed client generated into `packages/api-client` and used by portal, Studio and engine. Auth via short-lived JWT access tokens plus refresh tokens in httpOnly cookies. Every row carries `tenantId`, and every query is tenant-scoped by a middleware, with tests that prove cross-tenant reads fail.

**Core entities:**

- `Tenant` (school, publisher or platform), `User`, `Membership` (user + tenant + role)
- `Class`, `ClassMember`, `JoinCode`
- `Pack`, `PackVersion`, `Objective`, `CurriculumRef`, `Item`
- `Assignment`, `Attempt`, `Response`
- `LiveSession`, `SessionParticipant`
- `Book`, `BookPage`, `PageLink` (page → pack + POI), `QrBatch`, `QrCode`, `Activation`
- `Seat`, `Contract`
- `ConsentRecord`, `DataRequest` (export/delete), `AuditLog`
- `Event` (append-only learning events)

**Learning events** follow an xAPI-like shape so they can be exported to an LRS later without remapping:

```json
{
  "id": "uuid",
  "ts": "2027-02-10T09:14:03.120Z",
  "actor": { "kind": "student", "id": "stu_…" },
  "verb": "answered",
  "object": { "pack": "giza-plateau@1.0.0", "item": "item.khufu-height" },
  "result": { "correct": true, "score": 1, "attempt": 2, "hintsUsed": 1, "durationMs": 18400 },
  "context": { "assignment": "asg_…", "session": "ses_…", "objectives": ["obj.pyramid-size"], "locale": "ar-EG", "tier": "low" }
}
```

Verbs (closed list, extend by ADR): `launched`, `entered-zone`, `visited-poi`, `viewed-card`, `answered`, `hint-used`, `completed-quest`, `took-photo`, `earned-stamp`, `completed`, `abandoned`.

**Reporting:** a worker aggregates events into per-attempt and per-objective tables every few minutes; teacher dashboards read only from aggregates. Raw events retained for the period set per tenant contract, then deleted.

**Storage:** PostgreSQL (primary), Redis (sessions, rate limits, queues), S3-compatible object storage for packs and uploads with a CDN in front. Background jobs via a Postgres- or Redis-backed queue (e.g. BullMQ or pg-boss).

**Integrations (later milestones):** Google and Microsoft sign-in for teachers (OIDC); LTI 1.3 launch for schools with an LMS; assignment share to Google Classroom and Microsoft Teams; CSV roster import.

## 10. Multiplayer class trips and child safety (`apps/rooms`)

Multiplayer exists for one reason: a teacher taking a whole class on the same trip at the same time. It is not a social network.

**Rooms:** Colyseus (or an equivalent authoritative Node server) behind a WebSocket gateway. One room per live session; only members of that class can join, with a short-lived room token issued by the API. Limit 40 students + 2 teachers per room. State sync at 10 Hz for positions (interpolated on the client), events sent reliably. Rooms close automatically when the teacher ends the session or after 90 minutes.

**What students see of each other:** display name and avatar colour; position in the world; emotes. Nothing else.

**Communication rules:**

- Default: preset phrases only ("تعالوا هنا", "لقيتها!", "محتاج مساعدة" and similar) plus emotes and ping-on-map.
- Free-text chat is off by default for everyone under 15, can be enabled only by the teacher for a session, and runs through a word filter for Arabic (including Franco-Arabic) and English.
- No voice chat in v1. No private messages ever. No friend lists. No contact between classes or schools.
- Display names: chosen from a generated list (e.g. صقر أزرق), or typed and approved by the teacher.

**Teacher powers:** mute a student, remove a student, mute everyone, lock movement, gather everyone, end the session. All moderation actions are logged.

**Logging:** chat (when enabled) and moderation actions are stored for 30 days for safeguarding review, visible to the school admin, then deleted.

**Solo fallback:** if the rooms service is down, the experience must still play solo with no error the student has to understand.

## 11. Privacy, compliance and cultural review

Most users are children. Treat every byte of student data as sensitive, collect the minimum, and design so that a school can be shown exactly what is stored and delete it on request. Legal requirements below are a starting point for engineering; the founder will confirm them with counsel before launch, so mark every compliance assumption in `docs/COMPLIANCE.md`.

**Egypt.** Personal Data Protection Law No. 151 of 2020, with its executive regulations (Decree 816 of 2025). Engineering assumptions to build for: children's data is sensitive data; processing it requires explicit consent from a parent or guardian; breaches are reported to the Personal Data Protection Center within 72 hours; transferring personal data outside Egypt needs a licence or permit, so student data for Egyptian tenants should be hostable in-country or in an approved region; a named data protection officer may be required.

**Saudi Arabia and UAE.** KSA Personal Data Protection Law and UAE Federal Decree-Law No. 45 of 2021 (plus free-zone rules where relevant). Same design: per-tenant data region, consent records, data subject requests, breach runbook. Confirm country specifics with local counsel before the first Gulf contract.

**Built into the product from day one:**

- Guest mode stores no personal data on the server.
- Students under 15 need no email or phone; a class code and display name are enough.
- `ConsentRecord` per student when the school's contract requires parental consent; the school collects it, we store proof.
- Data export and deletion per student and per tenant, as an admin action with an audit log entry.
- Per-tenant data region setting; packs and media can be global, personal data stays in region.
- Encryption in transit (TLS) and at rest; secrets in a managed vault; least-privilege access; audit log for staff access.
- No third-party ad, marketing or session-replay trackers in the player or student pages. Product analytics are first-party and aggregate.
- Retention limits per tenant; automatic deletion jobs with tests.
- A breach runbook in `docs/INCIDENT.md`.

**Cultural and content review.** Every pack gets a sensitivity pass per target country before publishing (religion, burial and the dead, maps and borders, gender roles, dress, music). Content that needs to differ per country goes into an overlay, never a fork. Maps showing borders use the version required for that country's curriculum.

## 12. Performance budgets and devices

The typical student device is a 2–4 GB RAM Android phone on mobile data, and the typical classroom has one projector and shaky Wi-Fi. Build for that first; the high tier is a bonus.

| Budget | Low tier | Mid tier | High tier |
|---|---|---|---|
| First playable download | ≤ 15 MB | ≤ 25 MB | ≤ 40 MB |
| Time to first interaction (4G, mid phone) | ≤ 20 s | ≤ 15 s | ≤ 10 s |
| Frame rate target | 30 fps | 45–60 fps | 60 fps |
| Draw calls | ≤ 150 | ≤ 300 | ≤ 600 |
| GPU texture memory | ≤ 48 MB | ≤ 128 MB | ≤ 256 MB |
| Triangles on screen | ≤ 300k | ≤ 800k | ≤ 2M |
| Shadows | baked / blob | 1 cascade | 2–3 cascades |
| Post-processing | none | tone map + FXAA | + bloom, SSAO |

**Rules:**

- Reference test devices: one 3 GB Android (e.g. a recent Samsung Galaxy A0x or Redmi), one mid-range Android, one iPhone from the last 4 years, a Chromebook, and a low-end Windows laptop. CI runs a headless smoke test; a weekly manual run on real devices records fps in `docs/PERF.md`.
- Use instancing for repeated objects (blocks, palms, crowds), texture atlases, and baked lighting where possible.
- Download in stages: zone 1 first, then the rest in the background while the student plays.
- Offline: a teacher can pre-download a pack on the classroom laptop; the PWA caches packs by content hash and replays queued events when back online.
- Battery: cap at 30 fps on low tier and when the tab is in the background pause everything.
- Ship a performance HUD (hidden, toggled by `?perf=1`) showing fps, draw calls, triangles and memory.

## 13. Learning design and making it fun

The trap competitors fall into is either a pretty tour with no learning, or a quiz wrapped in a 3D skin. Every pack must be a game where knowing the lesson is how you win.

**Rules every pack follows:**

1. **One mission, 15–20 minutes**, playable inside one class period with time for the teacher to open and close. Book-page QR missions are 5–10 minutes.
2. **Every POI serves an objective.** If a place does not teach one of the pack's 3–5 objectives, it is scenery, not a POI.
3. **Knowledge unlocks progress.** The door opens because you read the cartouche correctly; the balloon reaches the next ring because you estimated the height. Questions live inside the world, not in a pop-up after it.
4. **Mistakes cost time, not dignity.** Wrong answers give a hint and a second try; no lives, no game over, no public ranking by score.
5. **Short text, always voiced.** Evidence cards ≤ 60 words, dialogue lines ≤ 25 words, every line has Egyptian Arabic voice-over and subtitles.
6. **A guide character with personality** per pack (a young archaeologist, a mission controller), speaking Egyptian Arabic with warmth and humour.
7. **A mystery or goal** frames the mission (the missing scarab, the lost probe signal) so curiosity pulls the student forward.
8. **Things to do with your hands:** ride, measure, photograph, assemble, compare then-vs-now. At least three different verbs per mission.
9. **Juice:** satisfying sounds, small particle bursts, camera moves on discoveries, stamps that thump into the passport.
10. **Progression across the catalog:** a passport with stamps and a collection album that carries between packs and school years.
11. **Class roles** in live sessions (navigator, photographer, recorder, guide) so the whole class participates, not only the fastest player.
12. **Pre- and post-quiz** of 5 items each, optional per assignment, so schools see measurable learning gain.

**Teacher kit per pack:** one-page lesson plan (before / during / after), discussion questions, a printable worksheet, answer key, curriculum mapping table, and a 2-minute teacher walkthrough video.

## 14. Real media and licensing

The founder wants things to feel real. The rule: the **world** can be stylised 3D, but **evidence** shown as fact must be real (a photo, a scan, an artefact, a NASA image) with its source on screen.

**Sources, in order of preference:**

1. **Our own captures** (photos, 360 panoramas, photogrammetry, drone footage). Filming or scanning at Egyptian heritage sites needs a permit from the Ministry of Tourism and Antiquities / Supreme Council of Antiquities; record the permit number in the asset's licence entry.
2. **Open-access museum collections** released as CC0, such as The Metropolitan Museum of Art Open Access and Smithsonian Open Access. Check the per-object flag; not every object is open.
3. **NASA and ESA imagery.** NASA media is generally not copyrighted, but its logos and insignia are restricted and nothing may imply endorsement. ESA images have their own licence terms per image; check each.
4. **Wikimedia Commons**, file by file: record the exact licence (CC BY, CC BY-SA, public domain) and the required attribution. Avoid CC BY-SA for anything we would want to keep proprietary.
5. **Paid stock or commissioned work** only with a written licence covering education, worldwide, perpetual, and derivatives.

**Formats the engine supports for real media:** images (WebP/AVIF for cards, KTX2 in-world), 360 equirectangular panoramas (as a POI type: "stand here and look around"), photogrammetry meshes (glTF, decimated per tier), short video clips (H.264 MP4, ≤ 30 s, muted autoplay with captions), audio. **Gaussian splat** scenes are a v2 item: spike a viewer in M3 and decide by ADR.

**Every media item stores:** title, source URL, author, licence id, licence URL, attribution string, permit number (if any), date captured, and whether it may be shown in each country. The validator refuses a pack where any of these is missing, and every pack has an auto-generated **credits screen** listing them.

## 15. Localization and country overlays

**Locales:** `ar-EG` is the default and the source language for all content; `en` is second. Gulf variants `ar-SA` and `ar-AE` arrive as overlays, not new packs.

**Language rules:**

- UI and guide dialogue in Egyptian Arabic for `ar-EG`; evidence cards and assessment items in clear Modern Standard Arabic so they match textbook wording. Overlays can switch dialogue to a Gulf-friendly register.
- All strings live in locale files with ICU MessageFormat (plurals, gender, numbers). No string concatenation in code.
- Numerals follow the locale setting: Eastern Arabic (١٢٣) or Western (123); the teacher can choose per class. Never mix the two in one number. Use the Arabic comma (،) as list separator in Arabic text.
- Full RTL: layout mirroring through CSS logical properties; icons that imply direction are mirrored; 3D HUD elements are placed from the reading edge. Test every screen in both directions.
- Fonts are self-hosted (no runtime font CDN for students), subset per locale, with `font-display: swap`.

**What a country overlay can change:** strings; guide character name, look and voice; which POIs and items are included; curriculum mapping (grade, subject, unit, lesson); sensitivity flags and alternative cards; map versions; default numerals and calendar. It cannot change the world geometry or engine behaviour, which keeps one pack maintainable across countries.

**Voice-over:** recorded per locale by real voice actors (no synthetic voices of real people); file naming by string key; a script export from the Studio feeds the recording session.

## 16. Existing prototypes to port

The founder will attach three single-file HTML prototypes. They prove the feel and the content; they are **not** the architecture. Port the content and mechanics into the engine and packs; do not copy their structure.

**`silent-sphinx.html`**** → pack ****`giza-plateau`**** (three.js, real scale, 1 unit = 1 m).**

- Keep the real dimensions as the source of truth (fact-check before publishing): Khufu base about 230.3 m, original height about 146.6 m, about 138.5 m today; Khafre base about 215 m, original height about 143.5 m, with remnant casing near the top; Menkaure base about 103–105 m, original height about 65.5 m, with granite casing on its lower courses and the large gash on its north face; the Great Sphinx about 73 m long, 20 m high and 19 m wide, facing due east, in front of Khafre's causeway.
- Content to carry over: the missing-scarab story with the guide character, POIs, cartouche puzzle, tea stop, night sound-and-light scene, photo spots and album, class chat (to be replaced by section 10 rules), Egyptian Arabic dialogue.
- Mechanics to generalise into engine behaviours: camel and horse-carriage rides, hot-air balloon with a 6-ring course (becomes a generic `course.rings` behaviour), photo spots (becomes `photo.task`), distance-based LOD, day/night.
- Replace procedural meshes with glTF assets over time; keep the procedural versions as the low-tier fallback while assets are made.

**`horus-voyage.html`**** → pack ****`solar-system`**** (three.js, stylised scale).**

- Content: planets with surface landmarks, spacecraft (ISS, James Webb, Voyager), a comet, the asteroid belt with a golden asteroid hunt, warp travel between stations, a galaxy view with the Milky Way and Andromeda, and the mission log / passport.
- Mechanics to generalise: free-flight vehicle, warp/fast travel, quiz-gated progression (`afterQuiz` becomes the standard `quest` completion), scale-switch from planet to galaxy.
- Real NASA imagery should replace procedural textures where licences allow (section 14).

**`giza-babylon.html`** is the same Giza scene built in Babylon.js for comparison. Use it only as a reference for lighting and post-processing quality targets on the high tier.

**Porting order:** first make `giza-plateau` load through the engine with the same look and story as the prototype, with the prototype open side-by-side as the acceptance test. Then the space pack, which will expose what the engine is still missing.

## 17. Milestones

Build in this order. Each milestone ends with a demo the founder can show to a school or a publisher. Dates are targets set around the Egyptian school year (pilots in the second term, publisher decisions around May); re-plan in `docs/PLAN.md` after M0 using real velocity.

*build plan · 5 milestones, pilots and first sales, Nov 2026 to Aug 2027*

Everything before February exists to make the school pilots possible; everything after them exists to turn pilots into paid contracts.

**M0 · Engine + Giza pack + guest QR (Nov to mid-Dec 2026)**

- Monorepo, CI, preview deploys, ADRs for the first stack choices.
- Engine core: loader, zones, quality tiers, player and camera, POIs, evidence cards, multiple-choice and numeric items, vehicles, photo task, i18n and RTL, local save, telemetry queue.
- `pack-schema` and the validator CLI; `giza-plateau` ported from the prototype.
- Player PWA with the `/x/...` QR landing and guest mode.
- **Done when:** a QR scan on a 3 GB Android phone starts the Giza mission in Arabic within 20 seconds, holds 30 fps on the low tier, and looks at least as good as the prototype side by side.

**M1 · Teachers, classes, reports + space pack (mid-Dec 2026 to Jan 2027)**

- API: tenants, auth (OIDC for adults, class codes for students), classes, assignments, events, aggregation, reports per objective, CSV export.
- Portal: catalog, experience pages, teacher area, school admin basics, lesson plan PDFs.
- `solar-system` pack ported; every engine gap it exposes closed as a generic behaviour.
- **Done when:** a teacher creates a class, assigns Giza, 30 students play on their phones, and the teacher sees results per objective within 5 minutes of the lesson ending.

**Pilot-ready (end of Jan 2027):** demo script, seeded demo school, teacher guide per pack, privacy notice and consent template in Arabic, a support channel, and a pilot feedback form.

**M2 · Studio + two new packs (Feb to Mar 2027)**

- Studio: live preview, click-to-place, content forms, side-by-side translation, media library with licence fields, validation panel, review workflow.
- Two new packs made by the content team in the Studio; the founder picks the topics from the lessons pilot schools ask for.
- **Done when:** each new pack took 3–4 weeks or less from approved script to published, with no pack-specific engine code.

**M3 · Live class trips + publishers (Apr to early May 2027)**

- Rooms service with teacher hooks, preset phrases, moderation and logs.
- Publisher area: books, page links, QR batches (public, batch, per-copy), print-ready exports, aggregate analytics.
- Pilot tooling: pre- and post-quiz, pilot report export per school.
- **Done when:** a teacher runs a live trip for 35 students on school Wi-Fi without a crash, and a publisher can produce print-ready QR sheets for a whole book alone.

**M4 · Scale, compliance, Gulf (May to Aug 2027)**

- Compliance: consent records, data export and deletion, retention jobs, breach runbook, per-tenant data region.
- Performance and accessibility pass across all packs; offline pre-download for classrooms.
- Country overlays (`ar-SA`, `ar-AE`) on one pack; LTI 1.3, Google Classroom and Microsoft Teams sharing; seat management and contracts.
- **Done when:** the platform passes an external security review and an accessibility audit, and one pack runs end to end with a Gulf overlay.

School pilots run across M2 and M3. When pilot feedback and this plan disagree, pilot feedback wins: propose the change in `docs/PLAN.md` and ask the founder.

## 18. Quality bar and open questions

**Definition of done for any PR:**

- Type-checks, lints and unit tests pass; new logic has tests.
- Playwright end-to-end tests for every user flow touched (QR scan to first interaction, teacher assign to report, publisher batch to download).
- Every pack in the repo passes `pack:check`.
- Performance smoke test on the low tier stays within budget; numbers posted in the PR.
- Accessibility check (axe) passes on touched portal pages; keyboard path works.
- No missing strings in `ar-EG` or `en`; RTL screenshot attached for UI changes.
- No new third-party service, tracker or licence without an ADR approved by the founder.
- Docs updated (`ARCHITECTURE.md`, `DECISIONS.md`, API spec) when behaviour changes.

**Engineering hygiene:** trunk-based with short-lived branches; preview deploy per PR; seed data script that creates a demo school, teacher, class, students and a publisher with a book; feature flags for anything half-built; error tracking with personal data scrubbed; daily database backups with a tested restore.

**Open questions for the founder** (list them in `docs/OPEN-QUESTIONS.md` and do not block on them; pick a reversible default and note it):

1. Final product name, domain and short-link domain.
2. Hosting region for Egyptian tenants (in-country provider vs. an approved cloud region) and for Gulf tenants.
3. First publisher partner, and which book pages get the first QR codes.
4. Exact lesson mappings for the Giza and space packs (grade, unit, lesson, page) per the current Egyptian curriculum.
5. Pricing tiers to support in the data model: per student, per class, per school, per book copy, or a mix.
6. Who records voice-over, and who does the subject-expert and cultural reviews.
7. Whether teachers sign in with school email only or also with personal Google/Microsoft accounts.
