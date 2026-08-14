# RESEARCH — Safari 16.1 compat floor, Deno-native (no Node)

**Goal.** Let the farm keep developing modern, but produce a deployed artifact that runs on **Safari 16.1.1** (iPad Pro 10.5 / iPad7,3, iOS 16.1.1 — the owner's oldest real target). No Node toolchain — Deno-native only.

**Trigger.** `https://…/microspec/store/` renders blank on that iPad. Console (read remotely via frida hook on `com.apple.WebKit.WebContent`) showed:
- `SyntaxError: Unexpected keyword 'with'` — store/index.html:52 → **import attributes** (Safari 16.4+).
- `SyntaxError: Invalid regular expression: invalid group specifier name` — `@tailwindcss/browser@4` → engine regex the JSC in 16.1 rejects.
- Latent third blocker (masked by the first): `<script type="importmap">` — **import maps** are Safari 16.4+ too.

All three land in ONE template: `packages/gen/scaffold.mjs` → every app inherits them.

## Why polyfills / "lower the target" don't directly apply
- `import with` and the Tailwind regex fail at **parse/compile time** — before any JS runs. A polyfill (runtime API shim) can't add grammar. Proven conceptually + by the console traces.
- Our build (`deploy/build.mjs`) is a **pure copy** (only rewrite: `/_rt/`→`../_rt/`). No transpiler in the pipeline → **no target knob exists to lower**. Confirmed by reading build.mjs.
- So the fix is either (a) add a transpile/bundle stage, or (b) stop using the features at source. We choose (a) at BUILD time only — dev stays zero-build.

## Key insight
The blockers are **module-loading features** (import attributes, import maps), not general syntax. **Bundling eliminates them by construction** — no per-browser `--target` downlevel needed. Everything else the farm uses (private fields, `?.`, `??`, `.at()`, top-level await) is ≤ Safari 15.4.

## Findings (all tested empirically on Deno 2.9.0, aarch64)

### F1 — `deno bundle` is native and solves the JS side. PROVEN.
`deno bundle` returned in Deno 2.x (built in — no Node, no esbuild install). Tested:
- Input `import d from "./d.json" with { type:"json" }` → **JSON inlined, `with` gone** (grep count 0). Fixes blocker #1.
- `deno bundle --platform browser --import-map im.json entry.js -o out.js` with the REAL store import-map (preact/htm/nanostores incl. `?external=`) → **10 modules, 20.7KB, esm.sh deps inlined** (preact internals present). Fixes blocker #2 **and** removes runtime esm.sh (offline win).
- Relevant flags: `--platform browser`, `--format esm` (default), `--import-map <file>`, `--packages bundle` (default), `--minify`, `--external`, `--code-splitting`, `--sourcemap`, `--watch`.
- **No `--target`** — it does not downlevel syntax to a browser version. Not needed here (see Key insight). Residual risk: if app/runtime code ever adopts syntax newer than 16.1, bundling won't fix it → the compat gate (below) must catch it.
- **Caveat:** prints `deno bundle is experimental and subject to changes`. Pin Deno version in CI; treat the flag surface as unstable.

Command shape per app:
```
deno bundle --platform browser --minify \
  --import-map apps/<id>/importmap.json \
  apps/<id>/entry.js -o dist/<id>/app.js
```
(entry.js = today's inline `<script type=module>` body, extracted to a file so it can be an entry.)

### F2 — Tailwind v4 + daisyui compile inside Deno without the native `oxide` binary. PROVEN END-TO-END.
- `import("https://esm.sh/tailwindcss@4")` → `tailwindcss@4.3.3` **denonext build (pure JS, no oxide)**; exports `compile`, `compileAst`, `__unstable__loadDesignSystem`.
- Working recipe (tested; produced real CSS):
  - **`loadStylesheet(id, base)`** resolves `@import "tailwindcss"` + its nested relative imports by fetching raw package files from `https://cdn.jsdelivr.net/npm/tailwindcss@4.3.3/…`; returns `{ base, content }`.
  - **`loadModule(id, base)`** resolves `@plugin "daisyui"` by `import("https://esm.sh/daisyui@5")` (→ daisyui@5.7.17 denonext, pure JS); returns `{ base, module: mod.default ?? mod }`.
  - `compile('@import "tailwindcss";\n@plugin "daisyui";', { base:"/", loadStylesheet, loadModule })` → `compiler.build(candidates)`.
- Results: bare core `.build(["flex","bg-red-500",…])` → 5.2KB, correct utilities. With daisyui → 24KB, has `.btn`/`.badge` + theme vars. **Real store scan (782 candidates from index.html+view.js) → 52KB app.css**, all key store classes present (`bg-base-200`, `min-h-dvh`, `badge`, `btn`, `text-base-content`, …).
- **One refinement for production:** candidate extraction in the spike is a crude token regex — a class it misses = missing CSS = broken styling on device (silent). Use Tailwind's own source scanning (`@source`/its extractor) or a hardened tokenizer, and gate it (compare emitted selectors against a known-used set, or diff vs the browser build once).
- Theme colors come from the farm's `_rt/theme.css` (CLAY / `data-theme="signal"` is a farm mode, not a stock daisyui theme) — daisyui here supplies component structure + base vars; theme.css overrides colors. So daisyui theme config need not be exact.
- Spike artifacts: scratchpad `denotest/tw_core.js`, `tw_daisy.js`, `tw_store.js`.

### F3 — remaining CDNs → vendor with plain Deno fetch (offline + compat). Trivial.
- `iconify-icon` web component (`code.iconify.design/...3.0.0`): fetch → `_rt/iconify.js`, self-host; web components work on 16.1. Ship only the icon sets actually used as local JSON.
- Geist / Geist Mono (Google Fonts): fetch woff2 → `_rt/fonts/`, local `@font-face`. Removes googleapis/gstatic (offline + privacy).

## Deno-native pipeline (revised — no Node, no esbuild install)

**Dev unchanged.** Local serve on a modern browser keeps importmap + esm.sh + `import with` + instant reload. Zero-build DX preserved. The compat work is BUILD-only.

**`deploy/build.mjs` — add one per-app stage** inside the existing `for await (readDir("apps"))` loop (build.mjs:94–147), before `assertInstallable`:
1. **JS**: extract the inline entry → `entry.js`; write per-app `importmap.json` (from the shared template map); run `deno bundle --platform browser --minify --import-map …` → `dist/<id>/app.js`. Rewrite `dist/<id>/index.html`: drop the `<script type=importmap>` and the inline module; add `<script type="module" src="app.js">`.
2. **CSS**: Tailwind compile (F2) → `dist/<id>/app.css`; replace the tailwind+daisyui CDN `<link>`/`<script>` with `<link rel=stylesheet href="app.css">`.
3. **Vendor**: ensure `_rt/iconify.js` + `_rt/fonts/*` exist; swap the CDN refs to local.

**`packages/gen/scaffold.mjs` — born-compat template.** New apps emit a head WITHOUT the four CDNs + importmap; source still authored modern (it's the bundler ENTRY). One template change covers all future apps.

**Compat gate (fail-loud, like `assertInstallable`).** After build, per `dist/<id>`: forbid in the shipped files `with {`, `type="importmap"`, `cdn.tailwindcss`, `esm.sh`, `fonts.googleapis`; parse `app.js` and fail if anything a Safari-16.1 parser rejects survives. Wire as its own gate in the pre-push flow (`deno task gates`). Prevents silent regression to a white screen.

**On-device verification.** `build → deploy → open on the iPad → frida console hook (skill `/ipad`) → assert zero console errors.` The remote console tap IS the compat verifier — stronger than browserslist-on-faith.

## Open spikes (close before farm-wide rollout)
1. ~~Tailwind `loadStylesheet` + daisyui under Deno JS compile~~ — **CLOSED (F2), proven end-to-end.** Remaining: harden candidate extraction (see F2 refinement).
2. `deno bundle` experimental surface — pin Deno, watch for flag drift.
3. Confirm no app/runtime source uses >16.1 *syntax* (bundling won't downlevel it); the gate's parse-check is the backstop.
4. Robust Tailwind candidate scanning (F2 refinement) — the last correctness risk on the CSS side.

## Rollout order (smallest proof first — matches `orchestrate_farmwide`)
1. **Spike ONE app (`store`)**: bundle + Tailwind-compile → deploy → iPad Safari → frida console = 0 errors.
2. Close the Tailwind spike.
3. Roll farm-wide via the build.mjs loop (already covers all apps).
4. scaffold + compat gate (lock it in).
5. Farm-wide device verification (Workflow if needed).

## Cost / trade-off (conscious)
- Still **Deno-native, no Node**: `deno bundle` is built in; Tailwind + esm.sh deps load via `esm.sh`/JSR at build. No `node_modules`, no native oxide.
- Loses "zero-BUILD" for the deployed artifact (dev DX unchanged). Adds build time (bundle+CSS per app, parallelizable).
- Existing gates stay green; we add a stage + a gate, break nothing.
