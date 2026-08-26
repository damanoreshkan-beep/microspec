# tide — live currents of sound: research note

Research pass 2026-08-18 backing a one-shot build. Every load-bearing fact below was MEASURED with `curl`
from this box (`Origin: https://dreamstudio.mooo.com`, `-r 0-2000`, 10 s timeout) or read from the runtime
source named. Nothing here comes from a narrator. Not called "radio" (owner's call): tide is a **stage** —
a WebGL field that carries the current's palette and breathes with the live signal; the stream is the
material, not the product.

## 1. Where the streams come from (the registry, `packages/runtime/tide.js`)

The PR-36 note (`apps/fmradio/STATIONS.md`, from the local `/radio` panel) was the seed; **20 of its 36
URLs are unusable on an HTTPS host** and it lists them as-is. Measured on 2026-08-18:

| source | https | CORS (`ACAO`) | verdict |
|---|---|---|---|
| SomaFM `ice1/ice2.somafm.com/<id>-128-mp3` | yes | `*` | ✓ analyser; 46 channels in `somafm.com/channels.json` (`ACAO: *`), each with `genre`, `listeners`, `lastPlaying`, `image` (`api.somafm.com/logos/…`, `ACAO: *`) |
| `somafm.com/songs/<id>.json` | yes | `*` | ✓ now-playing `{songs:[{title,artist,album,date}]}` |
| UA FM (`online.hitfm.ua/HitFM_HD`, `online.radioroks.ua/RadioROKS_HD`, `…/RadioROKS_NewRock_HD`, `online.kissfm.ua/KissFM_Ukr`, `KissFM_Deep`, `online.nasheradio.ua/NasheRadio_HD`, `online.radiorelax.ua/RadioRelax`, `…/RadioRelax_Instrumental_HD`, `online.melodiafm.ua/MelodiaFM`, `online-radio.nv.ua/radionv.mp3`) | **yes** (the STATIONS.md http:// forms have https twins) | none | ✓ plays; **no analyser** (a cross-origin `MediaElementSource` without CORS outputs silence, and `crossOrigin="anonymous"` refuses to load at all) |
| `cast.mediaonline.net.ua/chillout320` (Lounge FM), `…/nrj320` | yes | origin | ✓ analyser |
| `radio.perec.fm/radio-stilnoe` | yes | `*` | ✓ analyser |
| `online.radiorecord.com.ua/rr_320` (aac) | yes | origin | ✓ analyser |
| tb-group: `listen.hardbase.fm/tunein-mp3`, `listen.technobase.fm/…`, `listen.trancebase.fm/…` | **https works** (302 → `listenerN.mp3.tb-group.fm:443`, `ACAO: *` then origin) | yes on BOTH hops | ✓ analyser — the http:// form in STATIONS.md redirects to an http listener (mixed content) |
| `chi.bassdrive.co` | https | `*` | ✓ |
| `s2.ssl-stream.com/listen/uk_bass_radio/stream` | https | origin | ✓ — but `www.ukbassradio.com/stream` 301s WITHOUT `ACAO` on the first hop, so the direct URL is the one that works with `crossOrigin` |
| `stream.brokenbeats.net/tune` (aac 320) | https | `*` | ✓ |
| `streams.rautemusik.fm/techno/mp3-192` | https (302 → tokenised radiohost URL) | origin, both hops | ✓ (keep the `streams.rautemusik.fm` form: the redirect target carries an expiring `_art` token) |
| `admin.stream.rinse.fm/proxy/kool/stream` | https | none | ✓ no analyser |
| `radio.stereoscenic.com/asp-h`, `/ggn-h` | https | `*` | ✓ |
| `streams.calmradio.com:30628/stream` | https | `*` | ✓ (the `/api/39/128/stream` form 302s to http:30628 — mixed) |
| `strm112.1.fm/spa_mobile_mp3`, `stream.radioparadise.com/mellow-128` (aac) | https | origin | ✓ |
| DROPPED: `online.luxfm.ua`, `online.radioshanson.ua`, `online.perecfm.com.ua` (dead), `online.bestfm.ua` (404), `radio.nrcu.gov.ua:8000` (http only, no https twin found), `149.255.60.195:8085` (http, bare IP), `dfm-breakbeat.hostingradio.ru` (dead), `prem2.di.fm` (401 premium), `api.radioparadise.com/api/now_playing` (no `ACAO`) | | | |

**Rule that falls out of the table:** the registry carries `cors: true|false` per station, measured, and
the player only sets `crossOrigin="anonymous"` (and builds the analyser graph) where it is true. If a
`cors` station's server drops the header one day the element errors → retry once **without** CORS (plays,
field goes idle) rather than dying. HTTPS is asserted by a unit test over the whole registry — a mixed-
content stream is a silent failure the gate cannot see.

## 2. The player (`apps/tide/view.js`, module scope like drift)

- One `new Audio()` PER STATION SWITCH (an element bound to a `MediaElementSource` cannot be rebound; a new
  element + `ctx.createMediaElementSource(el)` is the documented way). Graph: `src → analyser → destination`
  (once an element is connected to a context its sound goes only through the graph, so `destination` is
  mandatory). `analyser.fftSize = 2048`, `smoothingTimeConstant = 0.8` (rave/drift precedent).
- **Cross-fade on switch** — the "smoothness" the owner asked for is audible, not just visual: the old
  element's `volume` ramps 1→0 over ~350 ms then is torn down; the new one starts at 0 and ramps to 1 on
  its `playing` event (~500 ms). iOS ignores `volume` (hard cut, still correct); Android Chrome honours it.
- Background: `holdAudio` (`/_rt/mediasession.js`) for MediaSession metadata + lock-screen prev/next +
  the visibility re-resume; the real `<audio>` already owns audio focus, the silent keeper is harmless.
- `wakeLock` while playing (drift precedent — the stage is the point).
- State mirrored into the DOM for the gate: `#play[data-playing]` (kit), `[data-station]` (the current id),
  `[data-state="idle|connecting|live|reconnecting|error"]`, `[data-cat]` on the strip.
- Now-playing: SomaFM stations poll `songs/<id>.json` every 30 s while playing (one small JSON, `ACAO: *`);
  the sheet reads `channels.json` once per open (listeners) — cached 60 s. **Under `gate` nothing is
  fetched**: a deterministic fixture (`FIXTURE_NOW`, `FIXTURE_LISTENERS` in `tide.js`) populates the shot.
- Where the queue goes next: `advance()` from `/_rt/player.js` over the current category's list
  (`manual: true` for prev/next; there is no `ended` on a live stream — a `stalled`/`error` shows the state,
  it never auto-skips: a stream that fell over should not silently take you to a different station).
- Drop-outs (2026-08-19): a live Icecast stream cannot resume — once the link is gone the element's few
  seconds of buffer drain and it `error`s (MEDIA_ERR_NETWORK) or sits in `waiting` for ever (Chrome/Android
  does both). So the player tells a DEAD station from a DROPPED link (`onLoss` in `tide.js`): an element that
  never produced audio while `navigator.onLine` → skip (the auto-skip); one that had played, or the device
  offline, or a retry already running → HOLD the station, tear the element down, re-create it after
  `retryDelay(attempt)` (1·2·4·8·15 s cap, unbounded while playing). A stall longer than 8 s is a drop too
  (watchdog). `window.online` cancels the wait and reconnects at once. An exhausted current (every station
  failed once — a captive wifi) keeps the error line and still retries at the cap; `playing` resets it all.
  There is no client-side buffer to add on top of `<audio>` (MSE over fetch would be one — not built).

## 3. The stage (`apps/tide/tide.frag` on `/_rt/glstage.js`)

Same contract as persona (`res · time · seed · ink · vary · env · tex/texAspect`), read from `glstage.js`:
- `vary = (bass, mid, treble, phase)`. Bands from `splitBands()` in `/_rt/spectrum.js` (bass 20–150 Hz,
  mid 250–2000, treble 2000–16000, byte-normalised), each through an **asymmetric envelope** (attack 0.25,
  release 0.05 per frame — rise fast, fall slow: the VU feel; drift uses 0.2/0.04). `phase` is INTEGRATED in
  JS every frame — `phase += dt·(0.05 + 0.25·energy)` — so the field quickens with the music without a
  jump: multiplying `time` by energy inside the shader jerks the whole field every time energy moves.
  With no analyser (paused, non-CORS station, the gate) the bands ride a deterministic slow breath so the
  stage never flatlines and the shot is alive.
- `ink = (r, g, b, texReady)`: the current's hue as a display-space colour; the SomaFM logo (`ACAO: *`) is
  the `tex` palette (≤64 px, `textureLod` at an absolute coarse mip = colour fields, never the picture —
  persona's measured recipe); the shader mixes `mix(inkColour, palette, texReady)`.
- **Amplitude budget in DISPLAY space + a luminance clamp under type**: dark [0.10, 0.32] against base
  0.165, light [0.64, 0.97] against 0.93 — persona measured ≥ 4.5:1 for `base-content` at those clamps and
  the same strings (the strip, the now-playing block) sit over this field. Bass → the field's radial swell
  (the kick breathes the scene), mid → warp depth, treble → fine sparkle grain; a 7 s breath underneath.
- Judged before shipping on the VPS eye from a scratch page (`file:///eye/out/tide.html`, shader inlined —
  `fetch()` of a sibling file is blocked under `file://`), both themes, low/high energy, with and without a
  palette. `tools/art/hero.mjs` renders WGSL only.

## 4. Decision log (closed)

- **Name: `tide`** — the owner ruled out "radio"; the categories are **currents** (Deep · Groove · Signal ·
  Bass · Ukraine · Roots), each with a hue that re-points `--app-accent` (drift precedent, a MARK colour).
- **One tab + profile.** listen (fit) = strip · void (now-playing) · Island/Transport; the station picker is
  a history-backed `Sheet` (`S.screen = "stations"`), not a second tab — the sheet lists ONE current, so a
  list of ≤14 rows fits its own inner scroll at any height (the only sanctioned nested scroll).
- **No favourites, no sleep timer, no volume** in v1 (hardware volume; a preference nobody asked for).
- **No ICY metadata via proxy** — SomaFM JSON covers ~30 of the stations; the rest show the station.
- **No edge involvement**: every stream and every JSON is fetched directly (HTTPS + the CORS table above).
- **WebGL2, not WebGPU** — the iPad has no WebGPU; CI's Chromium has WebGL so the shot is the real field.

## UNVERIFIED (the build must not depend on it)
- Whether iOS Safari honours the `volume` ramp (it does not on iPhone historically; the cut is still correct).
- Long-term stability of any single third-party stream — that is why the registry is data with a `cors`
  flag and an https unit test, and why a dead stream shows `error` instead of skipping.

## Addendum 2026-08-19 (owner's three asks)
- **A dead stream moves on by itself**: `error` / a 12 s connect timeout → `fail()` → next station in the
  current, bounded to one pass over the current (then the state stays `error`). Under the gate the mock never skips.
- **The field is a screensaver**: double-tap (or the transport's maximize action — a gesture is never the
  only way) → `requestFullscreen({navigationUI:"hide"})` on the field's own wrapper (a top-layer element is
  shown alone, so the canvas fills the display and the UI is gone); Back/ESC exits natively; `data-fs`
  mirrors it. iOS Safari has no element fullscreen (`fullscreenEnabled` false) → the action is hidden.
- **Swipes on the field**: down/up = next/prev station, left/right = next/prev current — `useSwipe` in
  `/_rt/gesture.js` (pure `swipeDir` in `/_rt/swipe.js`, unit-tested; dominant axis, 52 px threshold, the
  click after a drag is swallowed). The same handlers sit on the void (normal) and the wrapper (fullscreen).
- The same Fullscreen move fixed `imagine`'s Lightbox, which opened as a layer under the system chrome.

## Addendum 2026-08-20 — the APK has no media session, and that is why the stream dies

The owner installed tide as an APK and found no background service and no notification — and with them
missing, a stream that survives a wifi→cellular switch or a minute offline. Both symptoms are one root
cause, and it is not in the player.

**`navigator.mediaSession` does not exist in a WebView.** VERIFIED against MDN browser-compat-data
(`api/MediaSession.json`) this session: `webview_android: {"version_added": false, "impl_url":
"https://crbug.com/40611412"}`, and every member — `metadata`, `playbackState`, `setActionHandler`,
`setPositionState` — is `false` too. So the entire `holdAudio` block that gives tide its lock-screen
transport in Chrome is a **silent no-op inside our own APK**. That is the missing notification, exactly.

It is not cosmetic. A player with no session is a process Android is free to classify as cached, and a
cached process is frozen (AOSP *Cached Apps Freezer*): zero CPU, so the backoff timer never fires, the
stall watchdog never fires, and the stream that dropped while the phone was in a pocket is still dead when
the app is reopened. The shell has had `bg.start` — a real foreground service — since bridge 3, and no
farm audio app had ever asked for one. **The fix belongs in `/_rt/mediasession.js`, not in tide**: the same
`holdAudio` call now polyfills the session over the shell (`media.show`/`media.hide`/`media.command`,
bridge 28) and falls back to a plain `bg.start` hold on any older shell, so all eight audio apps — drift,
ether, fmradio, grain, handpan, rave, tide, v2m — get it without touching one of them.

**The second bug is a drop nothing announces.** Everything tide had waited for an EVENT. Measured against
the specs rather than hope:

- A seamless wifi→cellular handover changes Chromium's connection type with no `CONNECTION_NONE` in
  between (`NetworkChangeNotifierAutoDetect`, which is also why `ACCESS_NETWORK_STATE` is declared) — so
  **there is no `offline`/`online` pair to react to**, and the `online` listener never runs.
- The old TCP socket is bound to the path that went away. It does not migrate; it stops delivering. MDN is
  explicit that neither `networkState` (`NETWORK_LOADING` describes a fetch that was *started*, not bytes
  arriving) nor `readyState` proves a live stream is healthy, and Chromium may drain the buffer into
  `waiting` and never raise a terminal `error`. **The element can hang for ever with every event silent.**
- `timeupdate` is throttled and cannot carry the watchdog either.

So the liveness signal is arithmetic on the only number that cannot lie: `progressCheck` in
`/_rt/tide.js` (unit-tested) asks whether `currentTime` has ADVANCED, against `performance.now()` —
**timestamps, never tick counts**, because a hidden renderer runs its interval late and a process that was
frozen returns with a marker minutes old, which is precisely the state that must reconnect. A 4 s interval
while live, an 8 s budget, and `navigator.connection.change` (`NetworkInformation`: webview_android **50+**,
VERIFIED in BCD — every shell we ship) as an extra prompt to look early. `data-bg` mirrors the held session
so the Chromium gate can see the has-bridge branch, which is the only place CI will ever see it.

What stays Java-only, and therefore needs a reinstall: the MediaStyle notification with a real framework
`MediaSession` (transport buttons, correct `PlaybackState`), a low-importance channel so an ongoing player
notification does not buzz, `setRendererPriorityPolicy` — a foreground service raises the HOST process,
while the WebView renderer has its own priority — and `onRenderProcessGone`, because an FGS is not a
promise that the renderer survives. Chromium already requests Android audio focus for HTML media itself
(`AudioFocusDelegate`), so the shell must NOT request a second one.

## Addendum 2026-08-26 — login + cross-device control sync over wss (§6)

Owner ask: "add login and sync controls wss sound volume play". Read: sign-in, a volume control, and the
sound controls (play/pause · volume) synced across the user's devices over a WebSocket. Facts below measured
on 2026-08-26 unless named otherwise.

- **Login is systemic, not app work.** `profile.account: "any"` in spec.json renders the runtime's Account
  card (render.js:447 `AccountSlot`); `S.screen.set("signin")` opens the systemic wall; `session` atom +
  `restore()` live in `/_rt/auth.js`. Under `gate` restore() seeds `MOCK_SESSION` — no network. VERIFIED in
  source (auth.js:91, render.js:427-461).
- **The sid is stateless and verifiable server-side** — AES-GCM-sealed record, `whoami(sid)` returns a
  stable `{ id, login, provider }` for BOTH providers (github.js:216; Google opens locally, GitHub hits
  `/user` cached 15 min). Room key for sync = `provider:id`. VERIFIED in edge source.
- **nginx does NOT pass a WebSocket today.** `location ^~ /feed` in `/etc/nginx/sites-available/dreamstudio`
  has no `proxy_http_version 1.1`, no `Upgrade`/`Connection` headers (read over ssh 2026-08-26) — the
  handshake dies at nginx. `/etc/nginx` is sudo territory → the fix ships as an owner-run snapshot-guarded
  script (`microspec-edge/vps/enable-sync-ws.sh`), a dedicated `location = /feed/sync` (exact match beats
  `^~ /feed`). Until the owner runs it the client must FAIL OPEN: sync off, player untouched.
- **Keepalive arithmetic.** `Deno.upgradeWebSocket` pings the client at `idleTimeout` (default **30 s**,
  read from `deno types` on this box) and closes on a missed pong — that traffic also resets nginx's
  `proxy_read_timeout`, so the location block carries 90 s (3 missed pings) and no client-side ping exists.
- **The sealed tunnel does not cover a WebSocket** (sealedfetch wraps `fetch` only) and cannot — a ws is not
  a POST. The sid therefore rides the FIRST FRAME, never the URL (nginx logs URLs). TLS carries the rest.
  Origin is checked server-side against `ALLOW_ORIGIN` — a browser does not CORS-guard ws.
- **Client ws pattern exists in the farm**: `apps/crypto/stream.js` — reconnect on close (no auto-reconnect
  in the API), `pagehide` teardown, steady flush. Reused shape, plus capped backoff.
- **Volume**: the element ramps must TARGET the user volume, not 1 — `ramp(a, 0, vol())`, reconnect starts
  at `vol()`. iOS ignores `.volume` (§2, unchanged) — the slider is honest there about the cut only.
- **Semantics chosen (decision, closed): remote control, not multi-room.** Devices mirror STATE for display
  and exchange COMMANDS (`play`/`pause`/`vol`); a local transport press stays local; volume is one
  user-level value — the slider sets local and broadcasts. Full mirror (station+play everywhere) would play
  the same stream unsynchronised on two speakers — echo, not a feature.
- **Server is a pure relay** on core: in-memory `Map room → {socks, lastState}`, no DB, cap 8 sockets/room,
  4 KB/frame, room state handed to a joiner so a fresh device shows the peer instantly.

## UNVERIFIED (§6)

- That nginx's `limit_conn feedconn` zone tolerates long-lived ws alongside normal /feed traffic in
  practice (24/IP should be plenty; watch after enabling).
- Real handshake through the public URL — blocked on the owner's nginx script by design.

## Addendum 2026-08-20b — it was our own fade, not Android

The background service and the media session landed, and the owner reported the SAME symptom: minimised,
wifi → mobile, the music stops; **open the app and it plays instantly**. That last word is the whole
diagnosis. A dead Icecast socket cannot resume instantly — it needs a new element and seconds of buffering.
Instant sound means the audio was already flowing and simply was not reaching the output.

`ramp()` drove the cross-fade with **`requestAnimationFrame`, which does not fire in a hidden document.**
So a reconnect that landed while the app was backgrounded created a fresh element, set `a.volume = 0`,
armed the fade-in on `playing` — and never ran one frame of it. The stream played perfectly, at volume
zero, for as long as the app stayed closed. Reopening it resumed rAF and finished the fade in 500 ms.

Three things follow, and each is worth more than the fix:

- **The `currentTime` watchdog is blind to this by construction.** The element really is playing and
  `currentTime` really is advancing; only the gain is wrong. A liveness signal proves the bytes arrive, not
  that anyone can hear them. It remains the right signal for a dropped socket and the wrong one here.
- **The same hole silently broke PAUSE.** `stop()` fades to 0 and tears down in the ramp's `done`; the
  first step writes `from` (k=0), so a pause issued from the lock screen while hidden left the volume where
  it was and never tore the element down — the notification's own button would not have stopped the sound.
- **It read exactly like an OS problem.** A whole round of shell work — foreground service, renderer
  priority, MediaSession — went into a symptom whose cause was three lines of our own JavaScript. Both
  halves were needed anyway, but the order was wrong: *read your own code before theorising about the
  platform.*

The fix is two layers, because neither is sufficient alone: hidden → there is no fade worth hearing, so
jump to the target and finish synchronously; visible → drive it with a **timer**, since a page can be
starved of frames while still reporting itself visible, and elapsed-time maths makes a late timer snap the
fraction to 1 instead of stalling. `packages/gates/preflight.mjs` now fails any app whose `.volume` fade is
driven by rAF — dry-run across all 73 apps first, where it matched exactly once: this bug.
