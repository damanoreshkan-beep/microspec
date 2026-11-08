/**
 * # dist-eye — the eye on the BUILT site
 *
 * Every other gate looks at the source. This one serves `dist/` exactly as production does — one static
 * root, apps at `/<id>/`, the runtime at `/_rt/` — opens every app in a real Chromium at the reference
 * device, measures what the build did to the token system, and keeps a PNG of each, before anything is
 * rsynced. It exists because of two days in August 2026 when the compat build's class scanner cut every
 * `[var(--…)]` token and production rendered with border-radius 0, no density ladder and no accent, while
 * every gate stayed green: none of them had ever looked at `dist/`. It fails on numbers, not impressions.
 * A gate script with no exports.
 *
 * ![The build line: apps and the runtime become one dist tree, dist-eye opens it in Chromium, rsync ships it, the live URL is probed](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/build.svg)
 *
 * ## Usage
 * ```sh
 * deno run -A jsr:@microspec/core/dist-eye [--dist dist] [--out dist-eye] [--apps a,b] [--light] [--jobs 4]
 * ```
 * The product runs it as `deno task dist-eye --dist dist --out dist-eye` in `deploy.yml`, right after
 * `deno task build` and before the rsync. Chromium comes from `CHROMIUM_PATH` (CI sets
 * `/usr/bin/google-chrome`; the default is `/usr/sbin/chromium`). Headless, no Xvfb.
 *
 * ## Flags and arguments
 * | flag | default | meaning |
 * | --- | --- | --- |
 * | `--dist <dir>` | `dist` | the built tree to serve; every directory except `_rt` and dot-dirs is an app |
 * | `--out <dir>` | `dist-eye` | where the PNGs and `report.json` go; created if missing |
 * | `--apps a,b` | all | restrict the run to these app ids |
 * | `--light` | off | open each page with `&theme=light`; shots are named `<app>~light.png` |
 * | `--jobs <n>` | `4` | pages opened at once in the one Chromium (1–8); 79 apps one after another took 216 s of a 305 s deploy (2026-09-03) |
 *
 * Every page is opened at `/<app>/?mock` on the S25 Ultra frame (384×832) at DPR 2 — enough for the eye,
 * and it keeps a farm of PNGs under the artifact budget. The gate waits for `load`, not for a quiet
 * network: an app that keeps a request in flight under `?mock` never goes idle.
 *
 * ## What it checks / produces
 * One line per app, `✓` or `✗`, with the measured `--ms-r`, the first kit surface's radius and the rule
 * count of `app.css`. An `✗` names every reason:
 * - `did not boot (#app empty)` — the shell rendered nothing.
 * - `--ms-r missing on :root (theme.css not applied)` — the token root is gone.
 * - `app.css has N rules (precompiled Tailwind missing/thin)` — fewer than 50 rules in the compiled sheet.
 * - `first kit surface has border-radius 0px (token classes not compiled): <class>` — a `.sf-raised`,
 *   `[data-island]`, `.card`, `.modal-box` or `.btn` exists but the radius token did not survive the build.
 * - `no kit surface found (…)` — none of those selectors matched at all.
 * - `uncaught: …` / `console.error: …` — up to three page errors, with network noise (`net::`, `ERR_`,
 *   `Failed to load resource`, CORS, favicon, manifest) filtered out.
 * - `same-origin N missing: 404 /path …` — measured at this gate's own server, not inferred from the
 *   console: a built file the page asks for and does not get is a shipping bug. `/feed/…` is excluded (an
 *   edge proxy in production, no backend here).
 * - `load failed: …` — navigation itself threw.
 *
 * Files: `<out>/<app>.png` (or `<app>~light.png`) for every app that loaded, and `<out>/report.json`
 * with the device, the theme and one row per app (`app`, `ok`, `msR`, `radius`, `appCss`, `why`). The
 * summary line reads `dist-eye: N/M apps render with the token system alive`. Green means every app
 * booted with its tokens resolved, its compiled CSS present, no page error and no missing built file.
 *
 * ## Exit codes
 * - 0 — every app in the list passed.
 * - 1 — at least one app failed: `N app(s) failed — the built site must not ship`.
 * - 2 — no apps found under `--dist` (or none matched `--apps`).
 *
 * ## Where it sits
 * No 8n8 node — it needs a built tree and Chromium, so it lives in the product's `deploy.yml` between
 * `build` and the rsync, and its `<out>/` directory is uploaded as the `dist-eye` artifact (14 days);
 * `tools/art/shots-import.mjs` turns that artifact into store screenshots. `verify` is the source-side
 * eye — the breakpoint matrix, a11y and e2e on the unbuilt pages; this gate is the last measurement
 * before the site is live.
 *
 * ![The verify matrix: the breakpoints drawn to scale, the checks beside them](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/verify.svg)
 *
 * ## Why
 * `verify.mjs` runs the source with the CDN. Between 2026-08-14 and 08-16 the compat build cut every
 * token class and production shipped without its radius, density or accent, green all the way — because
 * no gate looked at `dist/`. This one does, and a gate that cannot show its work is a rumour, so it keeps
 * the shot the taste review reads next.
 * @module
 */
// GENERATED by tools/dts.mjs from packages/gates/dist-eye.mjs — edit the JSDoc there, never this file.
export {};
