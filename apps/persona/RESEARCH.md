# persona — research note

Conversations with well-known people and characters. The first STATEFUL app in the farm: the shelf, the
personas and every conversation live on the edge in Postgres, per GitHub user.

## What was measured before building (2026-08-16)

- **The Space the owner pointed at** (`NodeLinker/Qwen-3.8-27B-H200`) is `sdk: static` — a front-end whose
  `app.js:28` calls a keyless vLLM endpoint on HF Inference Endpoints (`Qwen/Qwen3.8-27B`, ctx 262k). Three
  probes from the phone: 200 / 41 s cold, 15 s, 4.7 s warm; ~30 req/min shared by everyone. **Decision
  (owner, closed): not added.** The existing text cascade is the same speed warm (LLM7 5–8 s, Gemini 2.5
  flash ~2–4 s with quota) and does not depend on a stranger's H200; what makes a chat feel fast is streaming,
  so `/feed/chat/stream` streams. The Qwen row is one line in `caps/chat.js` if ever wanted.
- **Wikipedia is the "back searches info" source.** Verified: `w/rest.php/v1/search/title?q=sherlock%20holms`
  → `Sherlock_Holmes` (typo-tolerant); `api/rest_v1/page/summary/<key>` → description, extract,
  `thumbnail.source` (fair-use posters included); `action=query&prop=langlinks&lllang=uk` → the Ukrainian
  title. Needs a User-Agent.
- **The persona card is written ONCE** by the text cascade at creation (Gemini 2.5 flash, 2.4–2.8 s per card,
  24/24 on the first shelf, every row with photo + uk name/tagline/story, persona 917–1168 chars) and stored;
  a chat never re-derives it. Ukrainian names must be asked for in natural order — uk-wiki titles «Шевченко
  Тарас Григорович» and the first pass copied that verbatim.
- **The reply language is decided server-side** (script of the last line → uk, else the app locale) and stated
  twice (a LANGUAGE block in system + a one-line reminder on the last turn): `gemini-2.5-flash-lite`, the row
  behind flash, answered Ukrainian questions in Sherlock's English three times before that.
- **Streaming vs the sealed tunnel.** `sealedfetch.js` re-expresses every `VPS_PROXY` call as one envelope, so
  an SSE body would be buffered whole. The stream is the one route on its PLAIN list, named `/chat/stream`
  because the list matches by PREFIX and `/chat` would have caught `/chats`. Everything else rides sealed.
- **`npm:postgres` cannot run under core's name-limited `--allow-env`** (reads `process.env.PGHOST` in its
  constructor → NotCapable in the production image); `jsr:@db/postgres` reaches the socket. `db:5432` is
  reachable from the VPN namespace core lives in (measured from `--network container:microspec-vpn`).

## Shape

- **Shelf** = the runtime's `list` (gallery, portrait, `browse` + `searchFetch`). Sections: Wikipedia
  candidates · added by you · on the shelf. Card text is chosen in the active locale at load time
  (`<html lang>`); the drill-down follows `loc` live.
- **Conversation** = `detail.view` (the body only; overlay, back-routing, app-bar are the runtime's), in the
  farm's one idiom for talking to a subject (arc): reader line with the accent rule, reply as reading text.
- **Adding a person** has no form: a typed name that is not on the shelf comes back as a candidate card;
  opening it creates the character (Wikipedia → card → Postgres) and swaps the detail item for the real row.
- **Visibility**: owner-created and seeded rows are public; a user's own creations are theirs. Chats are the
  user's own; every mutation is scoped by user id in SQL.
- **Gate**: fixture shelf (data-URI portraits), a fixture thread for the first person, a stream that types the
  fixture reply on a 22 ms timer; `send()`/`create()` never touch the network under `gate`.

## Left open (deliberately)

- One thread per person is what the UI shows (newest); the server keeps every chat, and «Почати заново»
  starts a new one — a history sheet is a later addition.
- Locale switch re-labels the shelf on the next load, not instantly.
- Deleting a person you added, and a favourites star, are not in v1.


---

# Premium pass (2026-08-17) — presence, smoothness, Google sign-in

Owner's brief: «преміум, абсолютна плавність, кожен флоу, сфокусованість, відчуття присутності персони,
webgl, 21st». Then: «google авторизацію — основна, найсучасніша; гітхаб приховай опціональним».

## Measured before building

- **The detail overlay is a scroll container, not the page** (`render.js` DetailView: `fixed inset-0 z-40
  bg-base-200 overflow-y-auto`, header `sticky z-10`). So a stage inside the body sits `fixed inset-0` with a
  NEGATIVE z-index: inside the dialog's own stacking context (z-40) the dialog background paints first, then
  negative-z descendants, then in-flow content — the field lands between the page colour and the text.
  (`-z-10` at page level fails — the body's background wins there — see [[reference_fullscreen_ambient_layer]];
  inside a positioned, z-indexed dialog it is the right tool.)
- **Keyboard vs the floating composer.** MDN Viewport_meta_element: `interactive-widget` default is
  `resizes-visual` — the virtual keyboard changes the visual viewport ONLY, the layout viewport (and every
  `position:fixed; bottom:0`) stays put, i.e. under the keyboard. `resizes-content` shrinks the layout viewport,
  which is what a chat wants. persona is the FIRST app in the farm to declare it (no app had it, checked with
  grep over apps/*/index.html); the `visualViewport` fallback covers Safari (which ignores the key).
- **Wikimedia portraits are CORS-open**: `curl -I -H "Origin: https://dreamstudio.mooo.com"` on
  `upload.wikimedia.org/.../330px-ErnestHemingway.jpg` → `access-control-allow-origin: *`. So the portrait
  can be a WebGL texture (`crossOrigin="anonymous"`) — the presence field carries THEIR palette, not a stock hue.
- **The eye's Chromium has WebGL2** (SwiftShader, `RENDERER WebKit WebGL`): a scratch page scp'd to
  `vps:~/eye/out/*.html` and shot as `file:///eye/out/…` (node shot.mjs directly; `eye.sh` matches `http*`
  only; `fetch()` of a sibling file is blocked under file:// — inline the shader) is a 10-second GLSL judge.
  `tools/art/hero.mjs` renders WGSL only, so this scratch loop IS the offline judge for a GLSL stage.
- **WebGL, not WebGPU, deliberately**: the owner said WebGL; the iPad (iOS 16.1.1, farm PWAs installed via
  url2clip) has no WebGPU; CI's Chromium has WebGL so the shot artifact shows the real field (probe-guard,
  never gate-guard — [[reference_webgl_threejs_in_farm]]).
- **Sign in with Google** (developers.google.com/identity/gsi/web/reference/js-reference, read 2026-08-17):
  script `https://accounts.google.com/gsi/client`; `google.accounts.id.initialize({client_id, callback,
  use_fedcm_for_button, ux_mode:"popup", context, itp_support})` (`use_fedcm_for_prompt` is DEPRECATED — One
  Tap already rides FedCM); `renderButton(el, {type, theme: outline|filled_blue|filled_black|outline_dark,
  size, text: signin_with|continue_with, shape: pill|…, width ≤ 400px, locale})`; `prompt()` for One Tap;
  the callback gets `{credential: <JWT id_token>, select_by}`; `disableAutoSelect()` on sign-out. The origin
  must be registered as an Authorized JavaScript origin of the OAuth client (owner action).
- **Verifying the id_token on the edge**: RS256 against `https://www.googleapis.com/oauth2/v3/certs` (JWKS,
  cache by max-age), `iss ∈ {accounts.google.com, https://accounts.google.com}`, `aud === client_id`, `exp`.
  Zero-dep with WebCrypto (`importKey("jwk", …, RSASSA-PKCS1-v1_5/SHA-256)`).
- **users.id is `bigint` (GitHub numeric id)**; a Google `sub` is a 21-digit string — does not fit. Google
  users get id = the first 63 bits of SHA-256("google:"+sub); `provider`/`subject`/`email` columns are added
  with `add column if not exists`. Sessions stay stateless: the sealed sid carries `{p:"google", u:{…}}`;
  GitHub sids (`{t}`) keep decrypting — same key derivation string.

## Shape of the build

- `packages/runtime/glstage.js` — `GlStage({shader, seed, ink, vary, tex})`, the WebGL2 twin of `hero.js`
  (same 16-float uniform contract + one optional CORS texture, downsampled to ≤64px before upload so it is a
  palette, not a picture). Probe-guarded, DPR cap 2, reduced-motion still frame, pauses when hidden.
- `apps/persona/presence.frag` — three domain-warped fbm stacks pull the portrait through the warp; a focus
  mask (strongest behind the person, gone by the lower third); `vary` = (thinking, speaking energy,
  listening, portrait-ready); env.x theme; luminance clamp in DISPLAY space — dark [0.10, 0.32], light
  [0.64, 0.97] — measured against base-content: ≥ 4.5:1 at the clamp. Amplitude budget in the shader.
- `packages/runtime/signin.js` — `SignIn` kit: Google button (GIS, theme follows `data-theme`), One Tap once,
  GitHub as a quiet secondary; gate → deterministic mock. `auth.js` gains `googleClientId()`, `loginGoogle()`;
  the session record carries `provider`.
- Edge `google.js` — `GET /feed/google/config`, `POST /feed/google/verify`, `POST /feed/google/me`; `session.js`
  holds seal/open for both providers; `whoami()` answers for both; owner = `OWNER_LOGIN` (GitHub) or
  `OWNER_EMAIL` (Google).

## Decisions (closed)

- Presence = the portrait's palette as a flowing field, breathing at rest, quickening while the model
  thinks, pulsing while it speaks. Not an orb, not a lit object (`[[reference_hero_flow_field]]`).
- Google is the primary sign-in (GIS button + One Tap); GitHub is a small text action under it. nova and
  actions keep `login()` (they need a GitHub token to act).
- Pending reply = the field's thinking state + the farm's `Scramble` in the reply slot; no cursor block, no
  spinner.
- Deltas are batched per animation frame; the thread follows only while the reader is at the bottom.
- The intro card collapses to a slim row after the first turn (focus); openers leave after the first line.
- History sheet (previous chats with the person) and delete-with-undo ride the runtime's `Sheet`, `undo`,
  `confirm` — no new surfaces.

## Left to the owner

- Create a Google OAuth **Web** client (console.cloud.google.com → APIs & Services → Credentials), Authorized
  JavaScript origins `https://dreamstudio.mooo.com` (and `http://localhost:8000` for dev), no redirect URI
  needed (popup/FedCM). Put `GOOGLE_CLIENT_ID=…` (and optionally `OWNER_EMAIL=…`) in the VPS `.env`, then
  `docker compose up -d core`. Until then `/feed/google/config` returns an empty id and the sign-in surface
  shows GitHub alone.
