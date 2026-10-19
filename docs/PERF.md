# Performance log

Budgets are in `BRIEF.md` §12. CI (`tests/e2e/specs/perf.spec.ts`) fails when a pack's low tier goes over 150 draw
calls. Frame rate and time to first interaction need real devices; those rows stay empty until someone runs them.
Open any trip with `?perf=1` for the HUD (fps, draw calls, triangles, texture memory).

## Download size (first playable, gzip)

Measured 2026-10-19 from `pnpm --filter @rihla/player build` and `pnpm pack:build`.

| Part | Size | Notes |
|---|---|---|
| QR landing shell | ≈ 2 KB HTML + 3.7 KB entry script | CI fails above 50 KB |
| Engine + app chunks | ≈ 105 KB | loaded after the landing card shows |
| three.js chunk | ≈ 143 KB | |
| GLTF loader | ≈ 13 KB | only when a pack has models |
| giza-plateau bundle | 50 KB | procedural scene, no binary assets yet |
| solar-system bundle | 54 KB | procedural scene, no binary assets yet |
| Fonts (woff2, only the faces a page uses are fetched) | ≤ 844 KB total for all faces | |

First playable is well under 1 MB against the 15 MB low-tier budget, because both packs build their scenes
procedurally like the prototypes did. Real models and textures will change this; re-measure when they land.

## Headless smoke (CI, SwiftShader, low tier)

| Date | Pack | Draw calls | Triangles | Budget (calls / tris) |
|---|---|---|---|---|
| 2026-10-19 | giza-plateau, spawn at `poi.sphinx` | 55 | ≈ 103k | 150 / 300k |
| 2026-10-19 | solar-system, spawn at `poi.sun` | 40 | not recorded | 150 / 300k |

SwiftShader frame rates say nothing about phones, so they are not recorded.

## Real devices (weekly manual run)

| Date | Device | Pack | Tier | fps (median) | Time to first interaction | Tester |
|---|---|---|---|---|---|---|
| — | 3 GB Android | giza-plateau | low | not run yet | | |
| — | 3 GB Android | solar-system | low | not run yet | | |

The M0 done-when ("3 GB Android, 20 s to play, 30 fps low tier") is not proven until this table has rows.
