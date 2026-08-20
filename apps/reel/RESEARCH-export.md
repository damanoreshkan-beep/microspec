# reel — exporting a clip (MP4 / GIF) and sharing it

Research note for the "save this clip" + "share it" pair. Written 2026-08-20, before any code.

Every load-bearing claim below carries **how it was validated**. Codex was used for the farm-side mapping;
its report was re-checked here and **one claim of its was wrong** (see the i18n row) — which is the reason
this section exists rather than a paste of the thread.

---

## 1. The format question is not cosmetic

The owner asked for "a GIF, but high quality, without losing frames or quality". Those three properties are
mutually exclusive in the GIF container, and the numbers say so:

| Claim | Validated by | Consequence |
|---|---|---|
| GIF89a stores a per-frame delay as a 16-bit integer **in centiseconds** | GIF89a Graphics Control Extension; corroborated across format references | 30 fps needs 3.33 cs and cannot be encoded. Exactly representable: 50 / 25 / 20 / 12.5 / 10 fps. A "30 fps GIF" is really 33.3 fps, or judder from alternating delays |
| GIF is capped at **256 colours per frame**, LZW-compressed | format spec | "no quality loss" is unreachable *in the container*. The only question is how well the loss is hidden |
| Chromium caps `navigator.share({files})` at **10 files / 50 MB total** | Chromium issue 408128761; web.dev Web Share guide | a full-length, full-quality GIF **cannot be shared** — the share button would fail on exactly the file the quality request produces |
| Telegram **converts every uploaded GIF to MP4 server-side** | Telegram's own API documentation, "Working with GIFs" | a pristine GIF is re-encoded to H.264 the moment it arrives. What Telegram *calls* a GIF is a silent MP4 |

**Therefore**: a silent MP4 is not a substitute for the owner's request — for the Telegram destination it *is*
the request, and it is the only artifact that can honour "full fps, full resolution, no colour loss". A true
`.gif` remains worth shipping for destinations that demand the actual format.

**Decision (owner, 2026-08-20): ship BOTH buttons, and export the WHOLE clip, not a window.**

## 2. The quality recipe, when a real GIF is asked for

Two-pass `palettegen` / `paletteuse` is the established high-quality path, not a single-pass conversion.

- `palettegen` derives a 256-colour palette from the clip's own colours instead of using a fixed web palette.
- `stats_mode=single` with `paletteuse=new=1` computes a palette **per frame** — the best quality available in
  the format, at a materially larger file. `stats_mode=diff` weights the moving part of the frame, which is
  the right bias for video where the background is static.
- Scale with **lanczos**, never the default bilinear.
- Pick a frame rate that divides 100: **20 fps (5 cs)** or **25 fps (4 cs)**. This is the "no dropped frames"
  request honoured as far as the container permits.

### MEASURED on our own box, 2026-08-20 — this replaces the estimates that were here before

Source clips: two real Mixkit clips the app actually serves, both 1080x1920, ~24 fps, ~16 s, ~60 MB.
`src.mp4` is aerial surf (**worst case for GIF** — every pixel changes every frame, so there is no
inter-frame redundancy to exploit); `calm.mp4` is flowers (typical case). ffmpeg 9.0, 6-core VPS.

All rows 360px wide, `palettegen=stats_mode=diff`:

| fps · duration | waves (worst) | flowers | wall |
|---|---|---|---|
| 12.5 fps · 6 s | 11.1 MB | — | ~5 s |
| 15 fps · 6 s | 13.0 MB | 7.7 MB | 4.7 s |
| 20 fps · 6 s | 16.9 MB | — | 5.8 s |
| 12.5 fps · 10 s | 17.8 MB | — | — |
| **12.5 fps · whole 15.9 s** | **27.2 MB** | ~16 MB | — |
| 480px · 20 fps · 6 s | 32.9 MB | — | 9.3 s |
| 480px · 20 fps · whole | 82.4 MB | — | 22.6 s |

**The earlier estimate in this note ("6 s ≈ 4-10 MB") was wrong by 3-8x.** It was labelled UNVERIFIED and
required measuring, which is the only reason it did not become a UI promise.

**Dither is not the lever folklore says it is.** Hypothesis: error-diffusion (`sierra2_4a`) destroys
inter-frame redundancy, so `bayer` should win 2-3x. Measured at 360px/15 fps/6 s:
sierra2_4a 14.0 · bayer:3 13.6 · bayer:5 13.0 · none 12.7 MB — a **9% spread, not 2-3x**. On high-motion
content the footage dominates and the dither choice barely registers. Hypothesis dropped after one test,
per the 2-attempt budget. `bayer:bayer_scale=5` is kept because it is marginally smaller *and* visually clean.

*Harness pitfall worth recording: the first run of this comparison returned **byte-identical** sizes for
three different dithers. That is not a finding, it is a broken measurement — a `shift 3` in the test function
made the dither argument read past the end of the argument list, so every run silently used ffmpeg's default
`paletteuse`. Identical numbers across supposedly different inputs are the tell; fix the check before
concluding from it.*

### Verified by eye, not by parameter faith

A frame of the produced GIF was stacked against the same frame of the source scaled to the same width and
read as an image. Smooth water — the classic GIF failure zone — shows **no banding, no colour shift, no
posterization**; only the finest spray detail is lost. 360px/12.5 fps is a genuinely good-looking GIF, and
that claim rests on having looked at it.

## 3. Why this cannot be done in the browser

Two independent blockers, both already established in this repo:

1. **The bytes are guarded.** reel's clip URLs are gated on `Referer` + `UA` (+ a per-site cookie).
   `Referer` is a forbidden header name for `fetch`, so the page cannot state it. This is why
   `/feed/frame` exists at all — see the long note at `apps/reel/view.js:40-51` and the referer measurement
   in `edge/core.js` at the `/feed/frame` branch (no referer → 404, asset origin → 404, page origin → 206).
2. **Even with the bytes, a canvas capture is not the ask.** Re-encoding frame-by-frame in JS drops frames
   under load, which is the one property the owner named.

*Validated by reading `apps/reel/view.js:40-51` and the `/feed/frame` handler in `edge/core.js`.*

## 4. Why the transcode needs a NEW container

*Validated by reading `edge/compose.yml` and by `ssh vps` on 2026-08-20.*

- **ffmpeg exists nowhere**: not on the host (`which ffmpeg` → none), not in `microspec-browser`,
  not in any other container.
- **`core` and `open` cannot run it.** Both are launched without `--allow-run` (and without
  `--allow-read`/`--allow-write`/`--allow-ffi`) — see the two `command:` blocks in `edge/compose.yml`. This is
  deliberate, and weakening it to add a feature would be the wrong trade.
- **Headroom is fine**: 6 cores, 7.8 GB RAM, 220 GB free on `/`.

So the transcoder is a **third process** in the same trust class as `open`: no secrets in its environment,
unrestricted egress (it fetches user-supplied URLs), plus `--allow-run` scoped to ffmpeg and a temp dir.
`core` forwards to it over loopback exactly as it already forwards to `open`.

**Risk to hold**: ffmpeg parses attacker-controlled media. Mitigations that must be in the first version —
SSRF guard on the URL before fetching (reuse `safeUrl`), a hard duration ceiling, a hard output-size ceiling,
a wall-clock timeout that kills the subprocess, and no secret of any kind in that container's environment.

## 5. The client side — what already exists

*Validated by reading each cited file.*

| Need | What exists | Where |
|---|---|---|
| Binary reply through the sealed tunnel | **works** — `out.enc === "b64"` is decoded to bytes and returned as a normal `Response` with the upstream `content-type`, so `r.blob()` behaves | `packages/runtime/sealedfetch.js:93-100` |
| Sealed **request** bodies | JSON strings only; a non-string body falls through unsealed | `packages/runtime/sealedfetch.js:72-78` |
| Saving a file | `downloadBlob(blob, filename)` / `downloadUrl(url, filename)` | `packages/runtime/apk.js:125-155` |
| Sharing a file | no exported runtime helper. Three apps hand-roll the same shape | `apps/sigil/view.js:60-70`, `apps/grain/view.js:279-285`, `apps/cam/view.js:84-100` |

### The share path has a fork that is easy to miss

**A WebView has no `navigator.share`.** Stated as a measured fact in `apps/os/view.js:346-347`, which is why
that app shares via the shell bridge instead:

```
shell.call("files.share", { name, mime, base64 })     // minBridge 21 → { shared, uri, bytes }
```

*Validated at `packages/runtime/shell-actions.js:499-509`.*

So inside the installed APK — which is how the owner actually runs these apps — the share button must go
through the shell action, and that action takes **base64**. `downloadBlob` has the same shape in the shell:
it `FileReader.readAsDataURL`s the whole blob and hands the base64 across the bridge
(`packages/runtime/apk.js:127-138`).

**This makes the size ceiling a hard requirement, not a nicety**: a 100 MB GIF becomes a ~133 MB JavaScript
string crossing a JS bridge. The "whole clip" decision and this constraint meet here, and the resolution is
in §6.

## 6. How "the whole clip" and the size ceilings reconcile

**Resolved by measurement (§2): at 360px / 12.5 fps the whole clip fits.** 27.2 MB for a 15.9 s worst-case
clip, roughly half that for typical content — comfortably inside the 50 MB share cap. The owner's two stated
wishes ("the whole clip" and "a proper GIF, smaller") turned out not to be in conflict once the numbers
existed; the apparent conflict came from assuming 480px/20 fps, which costs 82.4 MB for the same clip.

**12.5 fps is chosen over 15 fps for a reason beyond size**: 12.5 fps is exactly 8 cs, so every frame delay
is representable. 15 fps needs 6.67 cs and rounds to 7 cs (14.3 fps), which either runs slow or judders from
alternating 6/7 cs delays. See §1.

**The remaining ceiling is duration, and it is stated rather than hidden.** Worst case measures ~1.7 MB per
second of source. The 50 MB share cap therefore lands at about **30 s**. Beyond that the export is trimmed
to 30 s and the UI **says so, with the number** — a truncated export that reports success is exactly the
"wrong beats missing" failure this project has already paid for.

The rest of the reconciliation still stands:

- **MP4** is a 720p H.264 re-encode (CRF 23, veryfast). It began as a stream copy on the reasoning that a copy
  is free and lossless — and the end-to-end measurement killed that: a 1080x1920 source copies to **63.6 MB in
  12.6 s**, which is both LARGER than the same clip's GIF (24.4 MB) and past the 50 MB share ceiling. The
  format argued for on the grounds that it shares well was the only one that could not be shared. Re-encoded:
  **2.8 MB in 3.8 s** — 23x smaller and 3x faster, since the copy still has to pull and remux all 60 MB.
  Indistinguishable at phone size.

  *This is the second estimate in this note that measurement reversed. Both were reasoned from properties of
  the format ("a copy loses nothing", "GIF is bloated") rather than from a number, and both were backwards.*
- **GIF** of a whole clip can legitimately run to hundreds of MB. The server therefore enforces a stated
  ceiling and **fails with a number**, never silently truncating — a truncated export that claims success is
  the "wrong beats missing" failure this project has already paid for.
- **Saving always works; sharing is what degrades.** The 50 MB cap is the share sheet's, not the download's.
  When the artifact is too large to share, the button says so and offers the save instead of throwing.

## 7. Gates this touches

*Validated by reading the cited gate sources; the i18n row was re-measured after Codex reported it wrong.*

- **i18n**: reel currently has **44 keys in each of en/uk** — measured with `deno eval`, not taken on faith
  (Codex's report said 45). Every new visible string lands in both files in the same edit.
- **e2e**: `apps/reel/e2e.spec.mjs` asserts **zero buttons inside `[data-reel]`** (lines 76-86) and exactly one
  of each island control (85-87). Buttons belong on the full-clip overlay, never on a slide.
- **Service worker**: importing `apk.js` into `apps/reel/view.js` **expands reel's static import closure**, so
  `apps/reel/sw.js` goes stale and `deno run -A deploy/sw.mjs` must be rerun. `deploy/sw.mjs --check` fails the
  *unit* job, which `verify` needs — the easiest gate in the farm to forget.
- **`Player` has no action slot**: `Player({url, title, locale, onClose, poster, startAt, onTime, type})` at
  `packages/runtime/video.js:78`. Once `full.url` resolves, `FullClip` hands the whole overlay to `Player`
  (`apps/reel/view.js:448-452`) — so buttons added only to reel's preliminary header **disappear the moment
  the clip loads**. This is the single most likely way to build the feature and ship it invisible.

## 8. Open / UNVERIFIED — the build must not lean on these

- ~~Actual MB-per-second for GIF on real reel clips.~~ **CLOSED — measured, see §2.**
- Whether every reel source yields a progressive MP4 that stream-copies cleanly, or whether some are HLS-only
  and need a real re-encode (and therefore real CPU time).
- The practical base64-over-bridge ceiling in the installed shell. Known to be finite, magnitude unmeasured.
- Whether ffmpeg should be allowed to speak HTTP for HLS, or whether segments should be fetched by the
  service and handed to ffmpeg as local files with `-protocol_whitelist file`. The second is safer; the first
  is far less code. Undecided.
