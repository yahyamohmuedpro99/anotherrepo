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
