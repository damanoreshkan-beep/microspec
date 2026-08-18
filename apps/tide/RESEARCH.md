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
  `[data-state="idle|connecting|live|error"]`, `[data-cat]` on the strip.
- Now-playing: SomaFM stations poll `songs/<id>.json` every 30 s while playing (one small JSON, `ACAO: *`);
  the sheet reads `channels.json` once per open (listeners) — cached 60 s. **Under `gate` nothing is
  fetched**: a deterministic fixture (`FIXTURE_NOW`, `FIXTURE_LISTENERS` in `tide.js`) populates the shot.
- Where the queue goes next: `advance()` from `/_rt/player.js` over the current category's list
  (`manual: true` for prev/next; there is no `ended` on a live stream — a `stalled`/`error` shows the state,
  it never auto-skips: a stream that fell over should not silently take you to a different station).

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
