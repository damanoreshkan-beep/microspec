# nova — research note

**Concept (owner-approved, Option A).** Lift up *underrated* GitHub developers. Log in with GitHub,
discover real developers doing good work with little recognition, **deliberately** star repos you actually
appreciate (one human tap, never automated/bulk), and — the real charity — surface their **GitHub
Sponsors / FUNDING** links so you can support them with money. A star-field *finale* celebrates the
developers you lifted today.

Explicitly NOT built: automated mass-starring of random users. That is GitHub *Inauthentic Activity /
rank abuse* (ToS), risks the owner's account, and is fake support. Every star here is one intentional tap.

---

## 1. App shape (tool app)

- `type:"tool"` view app (like `sun`/`globe`/`sigil`), id **`nova`**, theme `signal`.
- Files to hand-author (order matters — **author `view.js` BEFORE scaffold** or boot wiring is wrong):
  `spec.json` → `i18n/en.json` + `i18n/uk.json` → `view.js` (+ `finale.js`) → `brand.json` + `brand.svg`
  → `e2e.spec.mjs`. Then `scaffold.mjs` emits `index.html`/`manifest.json`/`sw.js`/`icon.svg`.
- View signature: `export function nova({ S, t, toast, openScreen, closeScreen }) { … }` (Preact + htm).
- **Math/logic in `packages/runtime/*` with unit tests, never in the app.** New runtime modules:
  - `/_rt/auth.js` — the GitHub OAuth **system module** (reusable; other apps can opt in).
  - `/_rt/underrated.js` — pure scoring: given repo/user facts → an "underrated" score + reasons. Unit-tested.
  - finale layout reuses existing `/_rt/spectrum.js` (`fib`, `galaxyDisc`, `idle`) — no new math.

## 2. GitHub OAuth — the system module (`/_rt/auth.js` + edge `/feed/gh/*`)

No auth/OAuth exists in the farm today; two apps (`frontier`, `openapps`) hit GitHub Search **unauthenticated**
(CORS `*`, per-user rate limit) via `viaProxy`/`fetchJson`. Discovery reads need no token — reuse that path.
Only **starring** and **reading the logged-in user** need a token.

**Token must never reach the browser** (edge philosophy: "key material must never sit next to a public client
bundle"). Server-held opaque session:

Backend (`/root/microspec-edge`, private, manual SSH deploy — new `edge/github.js`, modelled on `ai.js`):
- `.env` on VPS gets `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET`; **also** add both names to core's
  `--allow-env` in `compose.yml:42` (Deno throws otherwise). `open` process must NOT get them.
- `hosts.js` `FIXED` += `github.com`, `api.github.com`; then `deno task allowlist` to regen the
  `--allow-net` string in `compose.yml`. (`deno task check-allowlist` gates this.)
- Routes (all under `/feed/…` so **no nginx change, no sudo**):
  - `GET /feed/gh/authorize` — server-generated `state` (in-memory Map, TTL) → `302` to
    `github.com/login/oauth/authorize?client_id&redirect_uri&scope&state`. Wire as a plain-dispatcher
    branch next to `/feed/pubkey` (`main.js:187`).
  - `GET /feed/gh/callback?code&state` — verify state; POST `code`→token to
    `github.com/login/oauth/access_token` (mimic `ai.js:83` upstream fetch); store token in an in-memory
    session `Map` (model `cookieJar` `core.js:244`) keyed by a random `sid`; return a tiny HTML page that
    `postMessage(sid, "https://damanoreshkan-beep.github.io")` then `window.close()`. Popup OAuth.

  **LIVE HOST = `dreamstudio.mooo.com`, NOT jobs-map.** Ground truth is `packages/runtime/feed.js:15`
  (`VPS_PROXY = "https://dreamstudio.mooo.com/feed"`) — that is what shipped bundles call. `jobs-map.mooo.com`
  is being retired (`vps/consolidate-domain.sh` phase-C deletes it); the edge README/`deno.json` still say
  jobs-map because they're stale mid-migration. So the OAuth App callback is
  **`https://dreamstudio.mooo.com/feed/gh/callback`** and the authorize `redirect_uri` matches.
  - Authenticated GitHub calls (`GET /user`, `PUT/DELETE /user/starred/{owner}/{repo}`) go through the
    **sealed tunnel** `POST /feed/f` carrying `{sid, action}`; a new `handleGithub` wired into both the
    plain dispatcher (`main.js:205`) and the sealed replay (`main.js:128`) looks up the token, attaches
    `Authorization: Bearer …`, calls `api.github.com`. Origin-guarded (`ALLOW_ORIGIN`) + rate-limited
    (`rateOk`) exactly like `ai.js:59-61`. GitHub token stays server-side.
- Sessions are in-memory → lost on container restart (acceptable v1; user re-logins). Note in code.
- Deploy = SSH, files are volume-mounted (`/home/mrx/edge`), `docker compose up -d --force-recreate core`.

Frontend `/_rt/auth.js` (gate-safe — under `gate` seed a mock session + mock user, **never** network):
- `session` nanostore atom; `login()` opens the `/feed/gh/authorize` popup, resolves on `postMessage`
  from the edge origin, stores opaque `sid` in localStorage; `me()`; `star(owner,repo)` / `unstar(...)`
  via sealed tunnel; `logout()`.

**Star scope caveat (owner decision surfaced in plan):** classic OAuth starring needs the **`public_repo`**
scope — which also grants write to all the user's public repos. There is no narrower *classic* scope. A
GitHub **App** with fine-grained *Starring* permission is minimal-privilege but a heavier flow. v1 plan:
OAuth App + `public_repo`, disclosed to the user in the login sheet.

**Owner-only activation steps (I can't do these):** register the GitHub OAuth App (callback
`https://dreamstudio.mooo.com/feed/gh/callback`), obtain client_id/secret, place in VPS `.env`, deploy edge.

## 3. Discovery — "underrated developers" + real support links

- Repos via the proven direct-first GitHub path (`apps/openapps/data.js`): `fetchJson` →
  `https://api.github.com/search/repositories?q=…&per_page=…`. Underrated query: modest stars + recent
  push + real signal, e.g. `q=stars:8..120 pushed:>{recentISO} good-first-issues:>0` (or topic-seeded),
  paginate with a random-ish page seed for variety; cap at the 1000-result Search ceiling (422 above).
  Dedupe by owner. Return **raw epoch** timestamps; let runtime `format:"ago"` render them.
- Avatars: `avatars.githubusercontent.com` is CORS `*` → plain `<img src=avatar_url + "&size=160">`.
  Fallback `letterTile(login)` from `/_rt/tile.js` on `onError`. For canvas/WebGL avatar textures set
  `img.crossOrigin="anonymous"` (untainted; reel idiom `view.js:205`), guard pixel-reads with `gate`.
- **Support / charity links:** fetch `.github/FUNDING.yml` from `{owner}/.github` (profile repo) or the repo
  (`raw.githubusercontent.com/{owner}/{repo}/HEAD/.github/FUNDING.yml`, CORS `*`). Parse keys
  (github/patreon/ko_fi/open_collective/liberapay/custom) → real "Support" buttons (GitHub Sponsors et al).
  No funding → show a plain "Star to support" only. This is the genuine благодійність channel.
- "Analyze" (проаналізуй): `/_rt/underrated.js` produces the *reason* a dev is underrated (stars vs. commit
  recency vs. followers, primary language, last push). Optional one-line blurb via `/_rt/ai.js` `suggest()`
  (fail-open, **never under gate** — no network).

## 4. Finale — star-field celebration (reuse, don't reinvent)

- three.js from the import map (`"three":"https://esm.sh/three@0.171.0"`), **lazy `import()`**, guarded on
  `hasWebGL()` (probe `getContext('webgl')`, NOT gate) so CI's headless Chrome renders real WebGL. On no-WebGL
  / import failure → Canvas2D fallback. Full teardown on unmount (`cancelAnimationFrame`, `renderer.dispose`).
  Scene `class="fixed inset-0 z-0 pointer-events-none"`, `alpha:true`, `setClearColor(0,0)` so the opaque
  body keeps axe contrast. Stamp `canvas.dataset.render="webgl"|"2d"` + `data-haswebgl` for the gate.
- Star burst = additive Sprites with per-sprite `life *= 0.9` decay + radial-gradient texture
  (`apps/sigil/viz.js:39,113,204`); star field = `THREE.Points` + `PointsMaterial({sizeAttenuation,
  vertexColors, blending:AdditiveBlending, depthWrite:false, map})` laid out by `spectrum.fib(i,n)` /
  `galaxyDisc`. Idle breathing via `spectrum.idle(phase)` (never-dead). Avatars of supported devs float as
  cards among the stars. **Seed RNG with `mulberry32`** (from `/_rt/ambient.js`), and **freeze to final frame
  when `gate`** so the shot is deterministic.
- Read theme in-canvas via `readTheme()` (`sigil/viz.js:29`): `--color-base-content` = ink,
  `--color-primary` = accent; re-read on a `data-theme` MutationObserver.

## 5. Design tokens (theme.css) + invariants

- Dark `signal`: base-100 `#0A0A0B`, base-content/ink/primary `#ECECEE`, secondary/accent `#9F8CF6`,
  success `#40C173`. Light `signal-light`: base-100 `#FFF`, ink/primary `#18181B`, accent `#4B45B8`.
  Radius box `1rem`. Font **Geist** / **Geist Mono** (wordmark/status/dock = mono uppercase tracking).
  "Ink is the brand" — purple only for meaning (support/finale accents). Judge populated screen both themes.
- No emoji (preflight `\p{Emoji_Presentation}`) → lucide/crafted vectors only. No content-less spinners →
  `/_rt/skeleton.js` (`Scramble`, `Pixels`, `useReveal`). Routing history-backed via `S.screen`/`openScreen`
  (system Back closes overlays, never exits); drill via `S.stack`. Haptics declarative `data-haptic`.
- Gestures `/_rt/gesture.js`: `useTap` (tap-to-star with `{x,y}` for a star at the finger), `usePanX`
  (swipe through devs), `useSheetDrag` (support sheet).

## 6. Gates (run all green locally before every push)

```
cd /root/microspec
deno run -A packages/schema/validate.mjs apps/nova/spec.json
deno run -A --import-map=packages/gates/preflight.importmap.json packages/gates/preflight.mjs apps/nova
deno test -A packages/runtime/runtime_test.js           # + new auth/underrated unit tests
deno run -A deploy/counts.mjs --check
deno run -A deploy/manifest.mjs                          # regen apps/store/apps.json (launcher)
```
Never run Chromium locally (proot crash). e2e: seed a gate fixture (mock session + mock devs), assert a
`github.com` link exists, tap-to-star toggles state, finale mounts `[data-live]`/`canvas[data-render]`,
and every overlay closes on `h.back()`. CI (Chromium+axe both themes) is the real gate — read run-level
conclusion. Affected orchestrator: new `_rt/auth.js`+`_rt/underrated.js` are imported only by nova → scope
stays nova (not whole-farm).

## 7. Build sequence (de-risked)

1. Runtime modules + unit tests (`auth.js` gate-mock path, `underrated.js` scoring). 2. `nova` app
   (spec/i18n/view/finale/brand/e2e) fully working against the **gate mock session** — shippable, green CI,
   zero secrets. 3. `edge/github.js` + compose/hosts/env changes written and committed to the private repo,
   **ready to deploy**. 4. Owner registers the OAuth App + provisions VPS secrets; then wire live OAuth and
   deploy edge. Steps 1–3 need no owner action; step 4 is the owner's activation.
