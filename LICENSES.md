# Third-party licences

What ships to pupils and staff, and under which terms. Accepting a new third-party licence for **assets** (fonts,
images, audio, models) is a founder decision (BRIEF working rules); code dependencies under MIT, Apache-2.0, BSD or ISC
are accepted by the engineering team. The full list of code dependencies is in `pnpm-lock.yaml`
(`pnpm licenses list` prints it).

## Fonts (self-hosted, never from a CDN) · ADR-0008

| Font | Licence | Copyright | Used in | Founder |
|---|---|---|---|---|
| IBM Plex Sans Arabic | SIL OFL 1.1 | 2019 IBM Corp. | player, portal, Studio | accepted provisionally (open question 8) |
| Reem Kufi | SIL OFL 1.1 | 2015–2022 The Reem Kufi Project Authors | player, portal, Studio | accepted provisionally |
| Aref Ruqaa | SIL OFL 1.1 | 2015–2021 The Aref Ruqaa Project Authors | player, Studio | accepted provisionally |
| Noto Sans Egyptian Hieroglyphs | SIL OFL 1.1 | 2022 The Noto Project Authors | player (cartouche) | accepted provisionally |

Shipped through the `@fontsource/*` packages; their licence texts are in each package's `LICENSE` file.

## Pack assets

| Pack | Third-party assets | Source of record |
|---|---|---|
| giza-plateau | none: scenes, textures and characters are generated in code, as in the founder's prototype | `packs/giza-plateau/LICENSES.json` |
| solar-system | none: same | `packs/solar-system/LICENSES.json` |

Every asset uploaded through the Studio media library must carry author, licence, source URL and attribution; the
Studio writes them to the pack's `LICENSES.json` and `pack:check` rejects an asset without an entry. Evidence-card
media from NASA, ESA or CC museums is not bundled until the founder accepts those terms (open question 9).

## Main runtime code dependencies

| Package | Licence |
|---|---|
| three | MIT |
| react, react-dom, next | MIT |
| fastify and @fastify/* | MIT |
| @sinclair/typebox | MIT |
| drizzle-orm | Apache-2.0 |
| pg | MIT |
| @electric-sql/pglite (local and test only) | Apache-2.0 |
| @colyseus/core, @colyseus/ws-transport, colyseus.js | MIT |
| jose | MIT |
| qrcode | MIT |

## Prototypes

`prototypes/*.html` are the founder's own work, kept as the reference for the ported packs.
