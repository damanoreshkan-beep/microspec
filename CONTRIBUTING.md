# Contributing to microspec

microspec is a **spec-driven** micro-PWA framework: an app is a declarative `spec.json` + a tiny data
adapter, rendered by a shared runtime and held to automated gates. Most contributions are one of:

## Add an app

Follow `docs/AUTHORING.md`. You write two files — `spec.json` + `data.js` (or `view.js` for a tool) —
and the toolkit does the rest:

```bash
deno run -A packages/schema/validate.mjs apps/<id>/spec.json   # contract gate (ajv)
deno run -A packages/gen/scaffold.mjs apps/<id>                # index.html + manifest + sw + icon
```

Then add `e2e.spec.mjs` and open a PR. CI verifies it (a11y + responsive + e2e + build).

## Extend the runtime (a new family or slot)

New slots/families live in `packages/runtime` (`render.js` + `validate.js` + `packages/schema`). Keep
the contract the source of truth: update `spec.schema.json` + `SCHEMA.md`, add a unit test in
`packages/runtime/runtime_test.js`, and only add a capability once a **second** app needs it
(rule of two — keep the runtime lean).

## Gates (must stay green)

CI runs on every push/PR:
- **unit** — runtime logic tests + ajv over every spec + a `dist/` build check.
- **verify** (one Chromium job per app) — axe (0 critical/serious) · no overflow @384 · glance @200 ·
  the app's `e2e.spec.mjs` · a screenshot.

Check the **run-level conclusion** before merging, not per-job output. Common fixes: low-contrast muted
text → raise opacity (`/80`); a scrollable region → add `tabindex="0"`.

## Invariants (don't break these)

- Every UI string goes through i18n `T()` (base `en` + `uk`); no static text in the render layer.
- Every dismissable overlay/sub-screen is **history-backed** — system Back closes it, never exits the
  app. Route via a runtime atom (`S.detail`/`S.sheet`/`S.screen`), never local state; add a `h.back()` test.
- DaisyUI components only (no custom CSS); container queries for watch→phone. Service worker is
  network-first. No Chromium on the dev device — CI is the gate.

By contributing you agree your work is licensed under the [MIT License](LICENSE).
