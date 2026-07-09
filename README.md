# microspec

> Working codename — **naming TBD before the repo goes public.**

An **open-source, vertical framework for AI-generated installable micro-PWAs.** An LLM writes a thin
**spec** (+ a tiny data adapter) against a **verified runtime**, and automated **gates** (a11y, e2e,
responsive) mean the AI *can't* ship an inaccessible, broken, or untranslated app. Clean-room successor
to the `nanoai2ui`/microapp system.

## Why this exists

The mechanics of "prompt → app" are commodity (Claude structured outputs · spec→render · axe-core/
Playwright). The defensible value is the **vertical**: the family catalog (accumulated UI taste), the
spec **contract** for this niche, the manager **rulebook** (process that stops rabbit-holes), and the
**distribution** channel. This repo packages exactly that.

## Layers

| Package | Role | Runs on |
|---|---|---|
| `packages/schema` | The spec **contract** (JSON Schema, SoT) + ajv validator | anywhere |
| `packages/runtime` | Preact catalog that renders a spec (5 families + invariants) | browser (zero-build ESM) |
| `packages/gates` | `verify` = a11y + e2e + responsive + shots | **CI** (Chromium) |
| `packages/gen` | authoring toolkit — `scaffold` (spec+data → app shell) | anywhere |
| `apps/` | reference farm (one app per family) = the family showcase + regression suite | — |

**The LLM in the loop is the agent (Claude) in-session** — there is no autonomous API generator. The
human gives a prompt; the agent authors two files (`spec.json` + `data.js`); the toolkit scaffolds,
validates, and CI gates. See `docs/AUTHORING.md`. Heavy visual gates run in GitHub Actions.

## Status

- **P0** contract + ajv ✅ · **P1** runtime — all 5 families ✅ · **P2** gates-in-CI ✅
- **P3** 5 reference apps (hn · rates · weather · wiki · ruler), CI-green ✅
- **P4** authoring toolkit (`scaffold` + rulebook) ✅
- **P5** ~~VPS brain~~ — obviated (no API loop; deploy = GitHub Pages) · **P6** OSS polish + Pages deploy — pending

See `packages/schema/SCHEMA.md` for the spec reference and `docs/AUTHORING.md` for the loop.

## Contract gate

```bash
deno run -A packages/schema/validate.mjs <spec.json>...   # exit 0 = valid, 1 = invalid (path-named errors)
```
