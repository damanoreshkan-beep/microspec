# 🧬 NEXT — Gene Transmission for Next Session

**Last Updated:** 2026-09-09 (Opus 4.8)
**Focus:** Microspec ecosystem — real architecture, verified against the live repos.

---

## 📍 WHERE WE ARE

**Three sibling git repos** (dreamstudio + edge are separate repos nested in the microspec tree):

| Repo | Remote | Local | Role |
|------|--------|-------|------|
| **microspec** | `damanoreshkan-beep/microspec` | `~/microspec` | Framework: runtime, 71 apps, gates, deploy. Workspace root. |
| **dreamstudio** | `damanoreshkan-beep/dreamstudio` | `~/microspec/dreamstudio` | Public store variant (~82 apps), served at `dreamstudio.mooo.com/store/`. `reel` lives here. |
| **microspec-edge** | `damanoreshkan-beep/microspec-edge` | `~/microspec/edge` | VPS backend: Docker Compose, VPN egress pods, sealed-fetch, feed proxy. |

**The stack:** Deno workspace monorepo — no Turborepo/Nx, no `node_modules`, no build step. Apps = Preact + htm + nanostores + Tailwind (browser CDN v4) + DaisyUI v5, resolved at serve time via esm.sh import maps + a shared `/_rt/` runtime. CI gates block broken/inaccessible/untranslated apps. Written & shipped from Termux/Android.

Full detail lives in the **`microspec-expert` skill** (`~/.claude/skills/microspec-expert/SKILL.md`) — the single source of truth, rewritten 2026-09-09 from verified files (the old JSR/WASM/CDN version was fiction).

---

## 🧩 ARCHITECTURE (verified)

### microspec (framework)
```
apps/                71 micro-apps
packages/
  runtime/           shared runtime → deployed as /_rt/  (ui kit, radio/BLE drivers, sealedfetch, i18n, store, gate mock-seam)
  schema/            spec.schema.json + validate.mjs + SCHEMA.md
  gen/               scaffold.mjs, compose.mjs, authorless.mjs
  gates/             preflight.mjs (~2s browser-free) · verify.mjs (CI) · shoot.mjs (remote render) · efficacy.mjs
  shell/             store launcher contract (actions.json, catalogue.schema.json)
deploy/build.mjs     assemble → dist/_rt + dist/<app>/ + home store at root
tools/
  affected.mjs       verify only apps a change reaches (from import graph)
  8n8/               pipeline DAG (nodes.mjs, run.mjs) — deno task gates
  kit-manifest.mjs   generates tools/mcp/kit.json from runtime/ui.js
```

**App contract** (`apps/<id>/`): `index.html` (importmap: esm.sh libs + `/_rt/`) + `spec.json` `{id,theme,category,tabs[{id,type,icon,label,view,needs}],profile}` + `view.js` (Preact/htm/nanostores, imports `/_rt/*.js`, exports the views the spec names) + `sw.js` + `manifest.json` + `i18n/` + `e2e.spec.mjs` + `icon.svg` + `brand.*` + optional `*.worker.js`.

**Runtime (`/_rt/`) module domains:** kit `ui.js` (Sheet/Segmented/Island/Panel/Slider/Row/Transport/Stage) · radio/SDR (hackrf, rtlsdr, rds, ook, ism433, lora, gsmband, demod, spectrum) · BLE bitchat (blesend, blesig) · backend seam (sealed, sealedfetch, feed, sse, db) · sensors · mock seam (`gate.js` → populated `data-live` screen headless) · astro/AI/media packs. `index.js` boots: validateSpec → createApp (nanostores `S`) → render Preact App → installSealedFetch → register SW (cache-first, update-on-next-launch, never silent skipWaiting).

**Gates / 8n8:** `deno task gates` runs the DAG, prints every failure in full with node id + argv, exits non-zero on the count. NEVER `grep` its output (grep's exit code once masked a red push). `sw` + `kit` are nodes — an import-graph or `ui.js` change silently invalidates them. Proven manual steps freeze into script nodes (`packages/gen/authorless.mjs`).

**Deploy:** `deploy/build.mjs` → `dist/` (`/_rt/` rewritten to relative), `CORE = "1."+gitCount(packages/runtime)`, served from VPS at `dreamstudio.mooo.com`.

### microspec-edge (VPS backend) — measured
- Docker Compose, NOT k8s. `ssh vps` → `mrx@ubuntu` (`Host vps`, `74.208.61.210`). **`~/edge` is an rsync target, NOT a git checkout** — fold edits back into the repo (`edge/` code, `vps/` ops).
- Services: `core` (ROLE=core, feed proxy + sealed endpoints, :8787), `open` (fetches user URLs, no keys/db), `media` (ffmpeg), `db` (postgres), `web` (nginx), + VPN pods.
- **Pod = `vpn-pX` + worker sharing a net namespace** (`network_mode: service:vpn-pX`) → distinct ExpressVPN egress IP. `microspec-vpn` = standalone MAIN tunnel core/open bind to.
- **Egress censors by IP** (tube bands in `vpn-regions.txt`): **63=real, 24=SFW, 0-1=refused**. EU ≠ SFW — **Poland serves real 63**. Main "smart" exit drifts to usa-dallas → 0.
- **Generic routing:** `baseForEgress(p, hint)` maps `x-ms-egress` header (plain) or sealed-envelope `e` field to a named worker (`EGRESS={pl:"http://microspec-vpn-reel:8789"}`). Client opts in (reel `view.js`).
- **Reel Poland pod:** `vpn-reel` (SERVER: poland) + `open-reel` (network_mode: service:vpn-reel). Proven: `x-ms-egress:pl → 63`.

**Edge grains:** `restart:always` does NOT heal namespace-shared containers → cron watchdogs (`vps/edge-watchdog.sh`, `vps/reel-watchdog.sh`). autoheal only covers unhealthy-RUNNING. Warm Deno cache via `docker cp microspec-edge-open:/tmp/deno`. NEVER `--remove-orphans` (kills `microspec-vpn`). Deno/bash only — no python/curl. SSH gated by auto-mode classifier (`permissions.autoMode.allow`; owner edits).

---

## ✅ DONE (recent)

- **afterdark (2026-09-11, full detail in ~/genes/NEXT.md)** — beat clock (`rt/afterbeat.js`), theme-lit lighting rig + shader, 36-move library, crowd solver, orbit/pinch camera, fold/fullscreen keys, characters re-converted via Three FBXLoader (fbx2gltf scrambles Mixamo textures — never use it for characters). Edge: **HLS DVR on two pods** (`media` pod a + `live-b` pod b, 8 s segments, 20-min window on host tmpfs `/dev/shm/microspec-hls`, `/feed/live/master.m3u8` with PATHWAY-IDs, stale pod → 503). Framework: **sw-core exempts every `/feed/*` from the app cache** (`077a516`) — before, an HLS playlist under `/feed/live` froze in the cache; until dreamstudio bumps the core, the app sends `Range: bytes=0-` (set after `xhr.open()` inside hls.js `xhrSetup`).

- **reel Poland egress pod** — dedicated always-alive `vpn-reel`+`open-reel`, generic `x-ms-egress` routing, cron self-heal. Proven end-to-end (PL=63, main=0). edge `1afbd45`/`bae94be`, dreamstudio reel header `847c2b8`.
- **M5StickC Plus 2 = full bitchat peer** (`~/m5_firmware`, local commits only, no remote) — public + private/encrypted chat interoperating with Поголос: Ed25519 announce, Noise XX, sealed fetch, GATT `F47B5E2D`, joystick UI, cyrillic content / English chrome, 4-tab layout, unread-DM markers.
- **Поголос PWA** — idle-scan fix, microspec design rubric, `e2e.spec.mjs`, nickname, unread badge, split tabs. Pushed, CI green.
- **`microspec-expert` skill rewritten** to verified real architecture (was JSR/WASM/CDN fiction).
- **This NEXT.md** rewritten to real architecture.

---

## 🚀 OPEN / NEXT

- Bump dreamstudio's `@microspec/core` to the release carrying the sw-core `/feed/*` fix (`077a516`).
- Edge deploys restart `media` = a discontinuity for DVR listeners: batch changes, never deploy without a diff (`vps/deploy.sh --dry-run` first).
- DVR failover drill only on pod b (`live-b`), never pod a while anyone listens; a second box = a third pathway in the master.

- Поголос dock tab-badge — needs a `@microspec/runtime` release; blocked earlier by diverged core checkout + no JSR auth. Runbook handed over.
- Main edge egress left on `usa-dallas` per user ("не чіпати поки").
- (User-side) dreamstudio CI-deploy of `847c2b8` so reel serves `x-ms-egress:pl` live.

---

## 🧬 PROTOCOL

- Search code via codebase-memory MCP, not grep. `ls`/`Read` on the tree is fine for structure.
- Commit each repo in its own repo (microspec / dreamstudio / edge are separate remotes).
- Node/Deno only, no python/curl. Everything on the edge box is Deno/bash.
- Session ends → update this file (real state, absolute dates) + the `microspec-expert` skill if architecture shifted.
