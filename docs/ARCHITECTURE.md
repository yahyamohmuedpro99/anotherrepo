# Rihla architecture

Status: living document. Source of truth for the shape of the system; `BRIEF.md` is the product brief it implements.

## 1. One engine, many packs

Every trip ("experience") is a **pack**: a folder of JSON plus optional assets. Packs never contain JavaScript.
One runtime, `@rihla/engine`, plays every pack. When a pack needs something new, the engine gains a generic,
declarative behaviour that every pack can then use.

```
            Studio (apps/studio) ──publish──▶ API (apps/api) ──validate+build──▶ object storage ──CDN──▶
                                                    ▲                                                   │
   learning events (batched, offline-safe)          │                                                   ▼
 engine ────────────────────────────────────────────┘        portal (apps/portal)   player (apps/player)
   ▲  Rihla.mount(el, {packUrl, startPoi, locale, user, roomToken, onEvent})            │
   └───────────────────────────────── same call everywhere ─────────────────────────────┘
```

| Path | What | Tech |
|---|---|---|
| `packages/engine` | 3D runtime, HUD, gameplay systems | three.js 0.170 (pinned), TypeScript, no framework |
| `packages/pack-schema` | Pack types, JSON Schema, validator library, `rihla-pack` CLI | TypeBox |
| `packages/i18n` | ICU MessageFormat subset, numerals, RTL helpers | none |
| `packages/api-client` | Typed client for the API (generated from the OpenAPI spec) | fetch |
| `packages/ui` | Shared React components, RTL first, design tokens | React 19 |
| `apps/player` | QR landing shell + full-screen player PWA | Vite, service worker |
| `apps/portal` | Public catalog, teacher, school admin, publisher, platform admin | Next.js 15 App Router |
| `apps/studio` | Authoring for the content team (internal) | Vite + React |
| `apps/api` | REST + OpenAPI 3.1, auth, tenants, reports, QR, packs | Fastify 5 + TypeBox, Drizzle, PostgreSQL 16 |
| `apps/workers` | Event aggregation, pack builds, retention/deletion jobs | Node, Postgres job table |
| `apps/rooms` | Live class sessions | Colyseus 0.15 |
| `packs/*` | Experience packs | JSON |

## 2. Engine (`packages/engine`)

### 2.1 Public API

```ts
const handle = Rihla.mount(el, {
  packUrl,            // folder or built bundle URL containing manifest.json
  startPoi?,          // QR deep link: start at this POI, skip the menu
  locale?,            // 'ar-EG' (default) | 'en' | overlay locale
  user?,              // { displayName, studentId?, classId? } — absent = guest
  roomToken?,         // live class session (optional)
  roomUrl?,
  assignment?,        // { id, hints, preQuiz, postQuiz, missionId }
  quality?,           // 'auto' | 'low' | 'mid' | 'high'
  onEvent?,           // learning-event sink (also batched to telemetry endpoint)
  telemetryUrl?,
});
handle.pause(); handle.resume(); handle.goto(poiId); handle.destroy();
handle.teacher.dispatch({ type: 'gather', poiId })   // what the rooms client calls
```

The portal, the QR landing page and the Studio preview all use this call.

### 2.2 Modules

| Module | Folder | Notes |
|---|---|---|
| Core loop, event bus, clock | `core/` | Single rAF loop; pauses when tab hidden; 30 fps cap on low tier |
| Pack loader | `loader/` | Fetches manifest + referenced JSON; content-hash cache via the player's service worker; glTF (Draco/Meshopt/KTX2) for `model` zones |
| World builders | `world/` | Terrain (layered height function or heightmap), sky (gradient shader + day/night presets), fog, lights, stars, clouds, particles |
| Procedural models | `models/` | Pyramids, primitives, composites (parts list), instanced scatters, signs, characters (humanoid rig), vehicle rigs (camel, carriage, balloon, spacecraft, astronaut), celestial bodies, spiral galaxies, beams. These are the low-tier fallback and the placeholder until glTF assets exist |
| Textures | `textures/` | Procedural canvas generators (sand, ripples, stone courses, casing, granite, strata, facades, planets, rings) |
| Zones | `world/zones.ts` | Groups of entities per scene, built lazily and hidden by distance (`streamRadius`) |
| Quality tiers | `core/quality.ts` | low/mid/high from device hints, then downgraded by a 3 s fps probe; controls pixel ratio, shadows, draw distance, particle and crowd counts |
| Player & camera | `controllers/` | `walk` (optional gravity/jump), `ride` (camel/carriage), `balloon`, `spacecraft` (free flight + autopilot), `jetpack` (float), `orbit` (no avatar). Touch joystick + drag-look + pinch; WASD + mouse; tap-to-walk |
| Entities & behaviours | `gameplay/` | Triggers (`enter`, `interact`, `tap`), conditions, actions (closed list in pack-schema), motions (`orbit`, `path`, `wander`, `spin`, `circle`, `bob`) |
| POIs | `gameplay/pois.ts` | Place + radius + title + evidence card + objectives; area banners; QR start points |
| Dialogue | `ui/dialog.ts` | Speaker, text, options with actions, locked sequences, per-line actions; subtitles always on |
| Quests | `gameplay/quests.ts` | Steps with targets and done-conditions; `nearest` or `ordered` guidance; distance/direction goal text |
| Assessment | `ui/item.ts` | `mcq`, `numeric` (tolerance + unit), `ordering`, `matching`, `hotspot`; hint + retry, no game over; each item maps to objectives |
| Evidence cards | `ui/card.ts` | Text ≤ 60 words, optional real media with source + licence line |
| Photo mode & album | `gameplay/photo.ts` | Framing guide, photo spots (photo task), sky photos, captions, local album, download |
| Map & compass | `ui/map.ts` | Minimap + full map generated from the scene's terrain colours, footprints and markers; tap to travel |
| Passport | `ui/passport.ts` | Stamps per pack, stored across packs (`rihla.passport`) |
| i18n & RTL | `@rihla/i18n` | Locale files per pack + engine strings; ICU; Eastern/Western numerals by locale |
| Accessibility | `ui/settings.ts` | Text size, reduced motion, colour-blind safe markers (shape + colour), keyboard paths, aria labels |
| Audio | `core/audio.ts` | Music/ambience/VO/SFX buses, ducking under VO; procedural SFX when no files exist |
| Save | `core/save.ts` | Local always; cloud via host callback; conflict: furthest progress wins |
| Telemetry | `core/telemetry.ts` | xAPI-like events, one queue, batching, offline persistence, never drops |
| Teacher hooks | `gameplay/teacher.ts` | `pause`, `gather(poiId)`, `spotlight(studentId)`, `lockMovement`, `pushQuestion(itemId)`, `end` |
| Rooms | `net/rooms.ts` | Optional Colyseus presence; solo fallback with no visible error |
| 2D fallback | `fallback/` | Cards-and-questions mode for devices without WebGL or below the low tier |

### 2.3 Why procedural models are data

The prototypes are 100 % procedural. Rather than baking them into the engine as "Giza code", the engine owns
generic generators (a stepped pyramid with optional casing/granite/gash is useful to every Egypt pack; a
humanoid rig with robe/hat/sash parameters is useful to every pack with people) and the pack describes
*which* generators to use with *which* parameters. Bespoke shapes (the Sphinx, the ISS, Venera 13) are
`composite` models: a parts list of primitives with transforms and materials, i.e. data. When glTF assets
arrive, a zone or entity switches `model: { gltf: "world/sphinx.glb" }` and keeps the procedural version as
its `lowTier` fallback.

## 3. Pack format (`packs/*`, `packages/pack-schema`)

```
packs/<id>/
  manifest.json        metadata, curriculum, objectives, scenes, zones, budgets, stamps, quests, activities, theme
  scenes/*.json        environment, terrain, entities, spawns, areas, map
  pois/*.json          points of interest
  quests/*.json        missions
  items/*.json         assessment items
  cards/*.json         evidence cards (+ media/)
  dialogue/*.json      lines and branches (text keys)
  models/*.json        composite procedural models
  glyphs/*.json        optional writing systems (e.g. hieroglyph alphabet)
  locales/ar-EG.json   every string, Egyptian Arabic (source)
  locales/en.json
  overlays/<locale>/   country overlays (strings, item inclusion, curriculum mapping)
  audio/               music, ambience, VO per locale (VO file name = string key)
  teacher/             lesson plan, worksheet, answer key (Markdown source → PDF)
  LICENSES.json        every third-party asset with source and licence
```

Validator (`rihla-pack check <dir>`): schema; every text key present in every declared locale; every asset
listed in `LICENSES.json`; every item mapped to ≥ 1 objective; every POI reachable from `startPoi` (scene graph
through `go.scene` actions + bounds); budgets per tier (download size, estimated draw calls, texture MB); no
file > 8 MB; textures in KTX2; media items carry title/source/author/licence/attribution. Output is a report the
Studio renders as a checklist. `rihla-pack build` writes an immutable, content-hashed bundle.

Published packs are immutable; fixes are patch versions; assignments pin a minor version.

## 4. Backend (`apps/api`, `apps/workers`)

- Fastify 5 + TypeBox schemas → OpenAPI 3.1 at `/openapi.json`; typed client in `packages/api-client`.
- PostgreSQL 16 via Drizzle (node-postgres in production, PGlite in tests). Every tenant-owned row has
  `tenant_id`; a request-scoped repository adds the tenant filter, and Postgres row-level security
  (`app.tenant_id` setting) is the second guard. Cross-tenant tests prove reads fail.
- Auth: own auth. Adults: email + password (pilot) and OIDC (Google, Microsoft) when the founder approves the
  client registrations; short-lived JWT access tokens (15 min) + rotating refresh tokens in httpOnly cookies.
  Students: class code + display name (allow-list or teacher-approved), no email or phone.
- Learning events: append-only `events` table with an xAPI-like shape (`verb` from a closed list). Workers
  aggregate into `attempt_summaries` and `objective_results` every few minutes; dashboards read only aggregates.
- Jobs: a Postgres `jobs` table polled with `FOR UPDATE SKIP LOCKED` (one less service than Redis; ADR-0006).
- Object storage: S3-compatible interface with a filesystem driver for development.
- QR: short slug → `qr_codes` row → destination resolved at scan time, so printed codes never break.

## 5. Rooms (`apps/rooms`)

One Colyseus room per live session, joined with a short-lived room token signed by the API. ≤ 40 students +
2 teachers. 10 Hz position sync, reliable events. Students see display name, avatar colour, position and emotes;
preset phrases only by default; free text only when the teacher enables it, through an Arabic/Franco-Arabic/English
word filter. No voice, no private messages, no friend lists. Teacher powers: mute, remove, mute all, lock movement,
gather, spotlight, push question, end. Moderation actions are logged (30-day retention). Rooms close when the
teacher ends them or after 90 minutes.

## 6. Data protection

See `docs/COMPLIANCE.md`. Guest mode stores nothing personal on the server (anonymous device id + event counts).
Personal data is tenant-scoped and region-tagged; packs and media are global.

## 7. Performance

Budgets in `BRIEF.md` §12 and `docs/PERF.md`. The engine reports draw calls, triangles and texture memory through
`?perf=1`; CI runs a headless low-tier smoke test against each pack's budgets.
