/**
 * # verify — the deep gate: every DOM check across an app's states in one Chromium session
 *
 * Beyond the happy path, it exercises the states production actually hits — loading/skeleton, settled,
 * interactive (e2e), animated — and watches for any runtime error the whole time. Deterministic by
 * default (animations are instant); the animated pass forces them on. CI-only by design: the authoring
 * device may never run Chromium, so the local gates stop at linkedom (preflight) and this is the run
 * whose conclusion the `ci` node reads. Farm-wide must-haves — the haptic answer to a tap and PWA
 * installability — are checked here on every app rather than left to one app's e2e.
 *
 * ![The responsive matrix to scale, the checks beside it](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/verify.svg)
 *
 * ## Usage
 * ```sh
 * deno run -A jsr:@microspec/core/verify <appdir> [--shots] [--device s25ultra] [--settle 1500]
 * ```
 * `deno task verify apps/<id>` in this repo; verify.yml runs it once per affected app with `--shots`
 * (CHROMIUM_PATH=/usr/bin/google-chrome, a 3-minute budget per app). The app directory must carry
 * `e2e.spec.mjs` — its e2e cases are imported from there, through the consumer's local importer when
 * one is present, since a verify run from the registry may not import file:// itself.
 *
 * ## Flags and arguments
 * | Argument | Default | Effect |
 * | --- | --- | --- |
 * | `<appdir>` | `.` | the app directory, served locally for the session (a trailing slash is stripped) |
 * | `--shots` | off | write `<appdir>/states/main.png`, `tab-<id>.png` per further tab, and `light.png` |
 * | `--device <id>` | `s25ultra` | viewport from `DEVICES` — s25ultra 384×832 at dpr 3.5, desktop 1280×900; an unknown id falls back to s25ultra |
 * | `--settle <ms>` | `1500` | how long the settled state is given after navigation |
 * | `HEADFUL=1` (env) | unset | the headful debug path; needs a live Xvfb — `deno task setup` starts one |
 *
 * ## What it checks / produces
 * In order, every line printed as ✓ or ✗ with its reason:
 * 1. **loading** (`?__hold=1` freezes data-loading): no bare DaisyUI spinner in the DOM; the app is not a
 *    blank screen — chrome plus skeleton must be visible; the design checks (axe in both themes, overflow
 *    at 384px, chrome without lateral shift) pass on the skeleton itself.
 * 2. **settled**, per tab (`[data-tab]`): the design checks again, then the responsive matrix — the same
 *    tab re-measured at every breakpoint from the 320×568 phone floor to 1280×900, landscape and
 *    split-screen included, skipping any width below the app's declared `spec.minWidth`.
 * 3. **haptic**: spy on `navigator.vibrate`, dispatch a real pointerdown on the first interactive element,
 *    require the runtime to answer — a tap without feedback means the delegated listener is broken.
 * 4. **PWA**: `<link rel=manifest>` present, fetchable, with a name and an installable `display`; a
 *    service worker registers, activates, and its `ms-` cache holds `./` or `./index.html`. Registering
 *    is not working — a worker whose precache holds no document cannot open offline. Each failure is
 *    named.
 * 5. **e2e**: every case of `e2e.spec.mjs` run against the page helpers; a throw is a ✗ with its message.
 * 6. **animated** (`?__anim=1` forces decode, scramble and motion to actually run): no spinner leaked,
 *    the app is still visible after 2.6 s.
 * 7. **runtime errors**: any uncaught exception or `console.error` during the whole session — network
 *    noise (favicon, net::, CORS, 4xx/5xx) is filtered out; the first eight distinct ones are printed.
 *
 * Ends with `N passed, M failed`. Green means every state rendered, held its layout at every breakpoint,
 * answered a tap, installed, passed its own e2e and threw nothing.
 *
 * ## Exit codes
 * - `0` — no failures.
 * - `1` — at least one ✗ (the count is printed; the code is 1 however many).
 * - `2` — `HEADFUL=1` and no virtual display could be started.
 *
 * ## Where it sits
 * No 8n8 node of its own — Chromium never runs on the authoring device. verify.yml's `verify` job runs it
 * per app in the affected matrix (tools/affected.mjs, from the real import graph) after the unit job's
 * gates, uploads `<appdir>/states/` as the `shot-<app>` artifact, and the `ci` node (needs: push) reads
 * that run's conclusion. `deno task red` prints its ✗ lines from the last run in full.
 *
 * ![The push node in the 8n8 pipeline](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/pipeline-push.svg)
 *
 * ## Why
 * A gate that only ever measured the happy path at 384×832 could not say otherwise: a non-installable app
 * shipped green, a registered worker cached nothing reachable so no app opened offline, and a haptic
 * function nobody called was a function nobody felt. One Chromium session over every state, every
 * breakpoint and every tab, with runtime-error surveillance the whole time, is what makes a green mean
 * something the eye would agree with.
 * @module
 */
// GENERATED by tools/dts.mjs from packages/gates/verify.mjs — edit the JSDoc there, never this file.
export {};
