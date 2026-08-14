# wall — the room's screens are not a browser you control

One phone types; every other phone in the Wi-Fi watches. The owner's half is an ordinary farm app on
`https://…github.io`. The room's half is a page served by the phone itself over **plain http on a private
IP**, and that single fact removes capabilities that are normally free. This note is what the build encodes.

Validated by me against primary sources; the Codex thread that surveyed them is a hypothesis set, not a
citation. Everything below says how it was checked.

## 1. The transport is a toy, and the toy decides the design

`microspec-edge/template/app/src/full/java/apk/microspec/LanServer.java` — read in full, lines cited.

| Fact | Line | What it forces |
|---|---|---|
| One connection handled at a time, in one thread (`accept()` then `handle()` inline) | 51-63 | **No long-poll, no SSE, no WebSocket.** A client that holds the socket freezes the whole room. |
| `client.setSoTimeout(5000)` | 72 | A stalled client blocks every other viewer for up to 5s. Responses must be short and immediate. |
| `connection: close`, `content-length`, `cache-control: no-store` | 108-114 | Every poll is a fresh TCP connection. Keep the polled resource tiny. |
| GET/HEAD only; 405 otherwise; 404 for an unknown path | 91-94 | The viewer page can never send anything back. **One-way by construction.** |
| `hits++` only on a 200 (`res != null`) | 96 | 404s are invisible to the counter. |
| `ROUTES` survives `stop()`; `hits` resets to 0 in `start()` | 39, 49, 128-133 | A restart makes the counter go backwards — the audience estimate must detect that. |
| `new ServerSocket(want)` with no retry | 47 | A busy port throws `BindException`. `port: 0` (schema: "0 lets the OS choose") is the fallback. |
| Runs inside the foreground service | class comment, 28-30 | The station survives backgrounding. Minimising the app does not kill the wall. |

**No `Access-Control-Allow-Origin` header is written** (108-114). The owner's https page therefore cannot
fetch its own station to verify it — and mixed content would block it anyway. `server.status` is the only
view the owner has of their own server.

## 2. Wake Lock is not available to the room. This is normative, not a Chrome quirk

- `navigator.wakeLock` is `[SecureContext]` — WebIDL read at
  https://w3c.github.io/screen-wake-lock/ : `[SecureContext] partial interface Navigator { [SameObject]
  readonly attribute WakeLock wakeLock; }`.
- `http://192.168.x.x` is **not** a potentially trustworthy origin — the algorithm at
  https://w3c.github.io/webappsec-secure-contexts/ admits `https`/`wss`, `127.0.0.0/8`, `::1/128`,
  `localhost`/`.localhost`, and `file`. **RFC1918 ranges are absent.**

So on the viewer page `window.isSecureContext === false` and `navigator.wakeLock` is `undefined`. A bare
call throws `TypeError` before any promise exists — feature-detect, never try/catch a missing namespace.

**Consequence, split by side:**

- **Owner** — served from github.io over https, so `/_rt/sensors.js` `wakeLock.acquire()`
  (`packages/runtime/sensors.js:98-105`) works normally. The typing screen holds it while broadcasting.
- **Room** — no API exists. The screens obey the device's own display timeout, and nothing the page does
  changes that.

**Fullscreen is the one lever that survives.** The Fullscreen Standard carries no `[SecureContext]`
annotation (https://fullscreen.spec.whatwg.org/#api), so `requestFullscreen()` is available over http — it
just needs transient user activation. That is worth having on its own: it drops the URL bar and gives the
poster the whole panel.

### The video keep-awake trick is UNVERIFIED and the build does not depend on it

The classic workaround is NoSleep.js: a looping `playsinline` video. Codex reported its assets (WebM 5,577
bytes / MP4 3,753 bytes decoded, `src/media.js`) and that upstream has not changed since 2020, and could
**not** find any 2025-26 source confirming Android Chrome still ties that playback to a display wake lock.
I cannot test it either — Chromium is banned on this device and I have no way to watch a phone screen from
proot. So it is **not shipped**: an unverifiable 3.7 KB of someone else's base64, guarding a behaviour I
cannot demonstrate, is exactly the "confident wrong constant" this project keeps paying for.

Left as a 30-second owner-side experiment: open the poster, put the phone down, watch. If it sleeps and
that hurts, the trick becomes a measured change with a real before/after.

## 3. Navigating to the station from a QR is not blocked

Distinguish two things that get confused:

- **A public https page fetching a private IP** → Local Network Access / PNA, prompted since Chrome 142.
  **Not what we do.**
- **A top-level navigation to `http://192.168.x.x:8080/`** → ordinary HTTP load. Chromium's own test
  `HttpsUpgradesBrowserTest.NonRoutableIPAddress_ShouldNotUpgrade` asserts a private IP is *not* upgraded
  under the default HTTPS-upgrade mode. A user who has explicitly turned on strict "Always use secure
  connections" gets an upgrade attempt, a failure and an interstitial they must bypass.

Chrome-behaviour claims, sourced to a Chromium browsertest name rather than read line-by-line by me:
treat "strict mode shows an interstitial" as the risk to remember, not as a number to build on.

## 4. Cyrillic to base64, measured on this box

The old app used `btoa(unescape(encodeURIComponent(s)))` — `unescape` is deprecated. Measured with
`deno eval`, V8 (same engine family as Android Chrome):

- `new TextEncoder().encode("Привіт").toBase64()` → `0J/RgNC40LLRltGC`. `toBase64` is a **function** here.
- `String.fromCharCode(...new Uint8Array(n))`: 65,536 ok · 125,000 ok · **130,000 → RangeError**.

So: `toBase64()` when present, chunked `btoa` (32,768-byte slices) as the fallback. The page we serve is
~4 KB, far under the cliff, but the *phrase* path runs on every keystroke and must never throw.

## 5. Fitting the phrase to the screen

Three candidates; the choice is forced by wrapping and by Cyrillic metrics.

- **CSS `clamp()`/`cqi` from character count** — 0 reflows, and wrong: `ШШШ` and `ііі` have the same length
  and very different advance widths. Rejected.
- **SVG `<text>` + `viewBox`** — the browser scales it for free, but SVG text does **not** line-wrap
  (SVG 2 Text). Multi-line means hand-built `<tspan>`s and measuring anyway, which throws away the benefit.
- **Binary search over `font-size`, measured with `scrollWidth`/`scrollHeight`** — measures the real font
  and the real wrapping, so Cyrillic needs no special case. Chosen.

Bounds: `hi = 2 × max(box side)`, `lo = 1`, stop at a quarter-pixel. From 1664px that is
`ceil(log2(1663 / 0.25)) = 13` passes — I re-derived this rather than taking the report's "11".
`overflow-wrap: anywhere` is required, or one long unbreakable word shrinks the whole poster to fit itself.

The algorithm lives once, in `packages/runtime/fittext.js`, and the viewer page gets the **same** function
by source (`fitText.toString()`), because that page cannot import from `/_rt/`. A unit test pins both the
convergence and the self-containment that makes the source-inlining safe.

## 6. The counter lies, and the fix is arithmetic

`hits` is requests, not people: at a 700ms poll one viewer produces ~86 hits a minute. The old app rendered
it beside an eye glyph, so one person read as a crowd of 86.

Every viewer polls on a period we choose, so each contributes exactly `1000 / pollMs` requests per second:
`viewers = rate × pollMs / 1000`. Deltas are smoothed before rounding (a poll landing either side of a
sample boundary otherwise flickers the number), and a *negative* delta means the station restarted rather
than that the room emptied. `packages/runtime/audience.js`, unit-tested.

## Open / UNVERIFIED — the build must not lean on these

- Whether a looping video still defeats the Android display timeout in 2026 (§2). Not shipped.
- Whether a strict HTTPS-First user sees an interstitial for the QR URL (§3) — sourced to a test name only.
- What a **third-party QR scanner's embedded WebView** does with a cleartext URL; only Chrome was reasoned
  about. The QR carries a full `http://host:port/` so a scanner that hands off to the browser is fine.
