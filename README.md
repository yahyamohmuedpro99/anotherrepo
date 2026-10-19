# Rihla · رحلة

3D learning trips for primary pupils, opened from a QR code in a textbook or assigned by a teacher.
One engine plays every trip; each trip is a **pack** of JSON and assets. Egyptian Arabic first (RTL), English second.

The product brief is [`BRIEF.md`](BRIEF.md). How the system fits together is in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md); every choice the brief left open is an ADR in
[`docs/DECISIONS.md`](docs/DECISIONS.md); what is done and what is left is in [`docs/PLAN.md`](docs/PLAN.md).

## Packs

| Pack | Ported from | What a pupil does |
|---|---|---|
| `packs/giza-plateau` | `prototypes/silent-sphinx.html` | Explore the Giza plateau on foot, camel, cart or balloon; find the sphinx's scarabs and answer one question each |
| `packs/solar-system` | `prototypes/horus-voyage.html` | Fly a ship through the solar system, land on worlds, collect discoveries, answer a quiz per stop, reach the galaxy view |

`tools/port/*.mjs` regenerates both packs from the prototypes (`pnpm pack:port`); CI checks the output is unchanged.
All educational content is still **needs-fact-check**: see [`content/FACTCHECK.md`](content/FACTCHECK.md).

## Layout

```
apps/player    QR landing + full-screen player PWA (Vite)        /x/{pack}/{poi} · /play/{pack} · /c/{class code}
apps/portal    catalog, teacher, school admin, publisher, admin (Next.js 15)
apps/studio    authoring for the content team (Vite + React, dev-server only)
apps/api       REST + OpenAPI 3.1 (Fastify 5, Drizzle, PostgreSQL 16 / PGlite for local)
apps/workers   job queue: event aggregation, retention, data requests
apps/rooms     live class trips (Colyseus 0.15)
packages/      engine, pack-schema (+ rihla-pack CLI), i18n, api-client, ui
packs/         the two packs           content/   FACTCHECK register
infra/         Dockerfiles, nginx, compose.yaml          tests/e2e   Playwright flows
```

## Run it

Needs Node 22 and pnpm 10.

```sh
pnpm install
pnpm pack:build          # validate and build both packs into dist/packs
pnpm demo                # API on :4000 with an embedded database (PGlite), seeded demo data
pnpm --filter @rihla/player dev   # player on :5173
pnpm --filter @rihla/portal dev   # portal on :3000
pnpm --filter @rihla/rooms dev    # live rooms on :2567 (optional)
pnpm --filter @rihla/studio dev   # Studio on :5174 (optional)
```

Demo logins (password `rihla-demo-2026`): `admin@rihla.local`, `principal@demo.school`, `teacher@demo.school`,
`editor@demo.publisher`. The seed prints a class join code and a printed-QR short link.

Guest trip without any backend: `http://localhost:5173/x/giza-plateau/poi.sphinx`.

### With Docker

```sh
cp .env.example .env     # fill in the secrets
docker compose -f infra/compose.yaml --env-file .env --profile demo up --build
```

Player <http://localhost:8080> · portal <http://localhost:3000> · API <http://localhost:4000>. The `demo` profile seeds
the same demo data; leave it off in production.

## Checks

```sh
pnpm lint && pnpm typecheck && pnpm test
pnpm pack:check                 # schema, references, locales, budgets for both packs
node tools/factcheck.mjs --check
pnpm e2e                        # Playwright: QR guest flow, class join → report, publisher QR, axe, perf smoke
pnpm api-client                 # regenerate the typed client after API changes
```

CI (`.github/workflows/ci.yml`) runs all of these on every push.

## Not done yet

Real-device performance runs, hosting, OIDC sign-in, data regions, Gulf overlays, media conversion and two new packs
are open; most wait on a founder decision listed in [`docs/OPEN-QUESTIONS.md`](docs/OPEN-QUESTIONS.md).
