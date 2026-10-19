# Decisions (ADRs)

Short records: date, decision, options considered, why. Newest last. Anything marked **founder** needs a yes/no.

---

## ADR-0001 · 2026-10-19 · Approval gate waived for this build
- **Decision:** build M0–M3 scope in one pass instead of stopping after ARCHITECTURE/PLAN.
- **Options:** stop for approval (brief rule 1) · proceed.
- **Why:** the founder asked explicitly to "ignore the timeline" and rebuild both prototypes on the platform.
  Everything that rule 3 reserves for the founder (cloud, region, auth/analytics vendors, paid services,
  licences, deletions) is still left open; see `docs/OPEN-QUESTIONS.md`.

## ADR-0002 · 2026-10-19 · Monorepo with pnpm workspaces + Turborepo, TypeScript strict
- **Options:** pnpm + Turborepo · Nx · npm workspaces.
- **Why:** the brief's default; boring, fast, no lock-in.

## ADR-0003 · 2026-10-19 · Stay on three.js (pinned 0.170.0)
- **Options:** three.js · Babylon.js (see `giza-babylon.html`).
- **Why:** both prototypes are three.js, it is smaller to download (matters for the 15 MB low-tier budget), and the
  engine keeps a thin renderer adapter so WebGPU can be switched on later. Re-open only with a spike that shows a
  clear quality or performance win on the low tier.

## ADR-0004 · 2026-10-19 · Procedural models are pack data, engine owns the generators
- **Options:** keep prototype scene code as per-pack JS · bake into engine as Giza-specific code · generic
  generators + data.
- **Why:** packs may not ship JS. Generic generators (pyramid, humanoid, vehicle rigs, celestial bodies, composites)
  are reusable by future packs; bespoke shapes are composite part lists. glTF replaces them per entity later, with
  the procedural model kept as the low-tier fallback.

## ADR-0005 · 2026-10-19 · API: Fastify 5 + TypeBox, Drizzle on PostgreSQL 16
- **Options:** NestJS vs Fastify; Zod vs TypeBox; Prisma vs Drizzle.
- **Why:** Fastify + TypeBox gives one schema for validation, types and OpenAPI 3.1 with little ceremony. Drizzle
  is SQL-shaped, works with node-postgres in production and PGlite (real Postgres in WASM) in tests, so tests need no
  external service and still exercise Postgres semantics including row-level security.

## ADR-0006 · 2026-10-19 · Jobs on a Postgres table, not Redis/BullMQ
- **Options:** BullMQ + Redis · pg-boss · own `jobs` table with `FOR UPDATE SKIP LOCKED`.
- **Why:** one less service for pilots; the job volume (aggregation every few minutes, nightly retention) is tiny.
  The job runner is ~100 lines with tests. Redis can be added for room presence when rooms scale past one node.

## ADR-0007 · 2026-10-19 · Own auth; email + password for pilot adults, OIDC wired but off until configured
- **Options:** hosted auth vendor (Auth0, Clerk, Cognito) · own auth.
- **Why:** the brief says own auth and asks before any vendor. OIDC (Google, Microsoft) needs client registrations
  the founder owns, so the code reads issuer/client settings from env and stays disabled until they exist.
  Passwords are hashed with scrypt; access JWT 15 min, refresh token rotated, httpOnly cookie.
  **Founder:** confirm whether teachers may use personal Google/Microsoft accounts (open question).

## ADR-0008 · 2026-10-19 · Self-hosted OFL fonts via @fontsource
- **Options:** Google Fonts CDN (as in prototypes) · self-hosted.
- **Why:** the brief forbids a runtime font CDN for students. IBM Plex Sans Arabic, Reem Kufi, Aref Ruqaa and Noto
  Sans Egyptian Hieroglyphs are all SIL OFL 1.1 and the brief already names Plex as acceptable.
  **Founder:** OFL acceptance is recorded in `LICENSES.md`; say no and we switch to system fonts.

## ADR-0009 · 2026-10-19 · FACTCHECK lives at `content/FACTCHECK.md`
- The brief lists `docs/FACTCHECK` in the layout but working rule 5 says `content/FACTCHECK.md`. The rule wins;
  `docs/FACTCHECK.md` points to it.

## ADR-0010 · 2026-10-19 · Rate limits in-process, Redis later
- **Options:** Redis-backed limiter now · in-memory sliding window per API instance.
- **Why:** a single API instance is enough for pilots; the limiter interface allows a Redis store later.

## ADR-0011 · 2026-10-19 · Colyseus 0.15 for rooms
- **Options:** Colyseus 0.15 (stable, known API) · newer major · own `ws` server.
- **Why:** the brief's default; 0.15 has the most documentation and a test kit. Upgrade by ADR.

## ADR-0012 · 2026-10-19 · Giza pack gains assessment items gated on scarabs
- The prototype had no questions, but the brief requires knowledge to unlock progress and reports per objective.
  Each scarab now asks one question built only from the lore line the prototype already shows (no new facts).
  Wrong answers give a hint and a retry. All items are tagged `needs-fact-check`.

## ADR-0013 · 2026-10-19 · Evidence cards keep the prototype's Egyptian Arabic for now
- The brief wants Modern Standard Arabic on cards and items to match textbook wording. Rewriting them is language
  work for a reviewer, so v0 keeps the founder's prototype text and marks the packs `reviewStatus: draft`.
  Planned in `docs/PLAN.md` (language review pass).

## ADR-0014 · 2026-10-19 · No hosting provider chosen
- Docker images are region-configurable and the dev stack is `docker compose`. Cloud provider and Egyptian/Gulf
  regions stay with the founder (open question 2).

## ADR-0015 · 2026-10-19 · PGlite for local runs and tests, with the job loop inside the API process
- **Options:** require Docker Postgres for every run · embedded Postgres (PGlite) for local runs and tests.
- **Why:** `pnpm demo` and the test suite start in seconds with no services. PGlite is real Postgres (same SQL, RLS
  policies and `SKIP LOCKED` queue), but only one process can open its files, so when `DATABASE_URL` is `pglite://`
  (or `INLINE_WORKER=1`) the API runs the job loop itself. Production uses PostgreSQL 16 and `apps/workers`.

## ADR-0016 · 2026-10-19 · Studio edits pack files through a dev-server middleware; revisions are git
- **Options:** Studio stores drafts in the API database · Studio edits the pack folders directly.
- **Why:** packs are already reviewed as files in pull requests, and the content team works next to engineers for
  now. The Vite middleware (`apps/studio/studio-fs.ts`) reads and writes `packs/`, uploads media with licence fields,
  runs the validator and shows history and diffs from `git log`. Publishing goes through the API like any client.
  The Studio is therefore internal and not deployed. Hosted editing with database drafts is a later ADR when
  non-engineers edit without a checkout.

## ADR-0017 · 2026-10-19 · Node services run TypeScript through tsx from one image
- **Options:** compile each service to JS · one image running `tsx` for api, workers, rooms and seed.
- **Why:** one Dockerfile, no build step that can drift from what tests run, and the workspace packages resolve from
  source. Start-up costs about a second. Revisit if cold starts matter on the chosen host.
  `infra/compose.yaml` adds a one-shot `packs-init` service so the shared packs volume is writable by the API.

## ADR-0018 · 2026-10-19 · Typed API client from OpenAPI, with a small hand-written fetch helper
- **Options:** openapi-fetch · generated SDK · `openapi-typescript` types plus a 60-line helper.
- **Why:** the brief asks for a generated client; the types are generated (`pnpm api-client`, checked in CI) and the
  helper adds cookies, refresh and `ApiError` the way the portal needs, with no extra runtime dependency.

## ADR-0019 · 2026-10-19 · Rooms import `@colyseus/core` and `@colyseus/ws-transport`, not `colyseus`
- The `colyseus` meta package fails to load as native ESM on Node 22. The two packages it re-exports load fine and
  are the same code and version (0.15). Matchmaking filters by session id so one class never joins another's room.

## ADR-0020 · 2026-10-19 · Packs are served from a shared volume behind nginx until hosting is chosen
- The architecture diagram shows object storage and a CDN. With no provider chosen (ADR-0014) the API writes built
  bundles to `STORAGE_DIR` and the player's nginx serves them with immutable caching by content hash. Moving to
  object storage changes one module in the API (`routes/packs.ts` write path) and the nginx `location /packs/`.
