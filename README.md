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
| `packages/runtime` | Preact catalog that renders a spec (families + invariants) | browser (zero-build ESM) |
| `packages/gates` | `verify` = a11y + e2e + responsive + shots + probe | **CI** (Chromium) |
| `packages/gen` | prompt → Claude structured-output → spec + data adapter | VPS brain |
| `orchestrator` | prompt → gen → git → CI gate → deploy | VPS brain |
| `apps/` | reference farm (one app per family) = the family showcase + regression suite | — |

Heavy visual gates run in GitHub Actions; the VPS runs only the lightweight brain.

## Status

- **P0** — monorepo scaffold + contract SoT + ajv validator ✅ (validates all reference families; rejects bad specs)
- P1 runtime · P2 gates-in-CI · P3 reference apps · P4 generator · P5 VPS brain · P6 OSS polish — pending

See `packages/schema/SCHEMA.md` for the spec authoring reference.

## Contract gate

```bash
deno run -A packages/schema/validate.mjs <spec.json>...   # exit 0 = valid, 1 = invalid (path-named errors)
```
