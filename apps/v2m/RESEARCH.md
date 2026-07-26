# V2 Player — the store, the size story, the 3D hero

Measured 2026-07-26, against the exact `assets/v2synth.wasm` the app ships. Everything below is a reading,
not a recollection — reproduce it with `deno eval` before changing any of it.

## 1. Where V2M tunes actually live

There is **no JSON API for V2M anywhere**. Checked and rejected:

| Source | Verdict |
|---|---|
| GitHub code search (`extension:v2m`) | binaries aren't indexed; the only hits are MSBuild cache files |
| archive.org (`metadata` API, `advancedsearch`) | CORS is `*` and the API is good, but **no V2M items** (`numFound: 0`) |
| Demozoo API (`demozoo.org/api/v1/`) | CORS is `*`, rich metadata — but files are zipped prods on scene.org, not playable tunes |
| wothke's webV2M | a player, no collection; its own docs point at modland |
| The Mod Archive / Modland "allmods.zip" | `allmods.zip` is 5.7 MB for the whole archive — the wrong shape for a phone |

**modland's V2 tree is the archive.** `81` authors, `347` tunes, nginx *fancyindex* HTML listings. Three
mirrors, all answering `Access-Control-Allow-Origin: *` to a github.io `Origin`, so the app fetches them
**directly — no proxy, no key**:

```
https://modland.com/pub/modules/V2/
https://ftp.modland.com/pub/modules/V2/
https://modland.ziphoid.com/pub/modules/V2/
```

(`ftp.amigascne.org`'s mirror has no CORS — it would need the VPS proxy, and buys nothing.)

A listing row carries exactly two facts:

```html
<a href="thesis.v2m" title="thesis.v2m">thesis.v2m</a></td><td class="size">   128953</td>
```

A filename and a **byte count** — which is precisely what a store built around size needs, so the store is
live with no snapshot behind it. `parseAuthors` / `parseListing` in `/_rt/v2m.js` are unit-tested against
that markup, and were re-checked against all three mirrors' real HTML (byte counts match `Content-Length`).

**Size distribution across the 347 tunes:** min 0.5 KB · p25 27 KB · **median 50 KB** · p75 95 KB ·
p95 416 KB · max 1.5 MB.

**Duration is NOT in a listing.** It exists only after `v2m_open` (`v2m_duration_ms()`), so "×N smaller than
MP3" is a *player* line, not a store line — the store shows the byte count, the player shows the ratio once
the tune is open. That split is what let the offline verification pass be dropped entirely.

## 2. The synth clips, and diverges below 44.1 kHz

Rendered whole tunes through the wasm and measured true peak. **12 of 14 sampled tunes peak above 1.0**;
one reached **15.5**. This was shipping straight into the destination node.

| Tune | 44.1 kHz | 48 kHz | 32 kHz |
|---|---|---|---|
| Dubmood — the scene is dead | **1.27** | **15.49** | 3.6e35, 14.2 M non-finite samples |
| Quickyman — the freaker | 1.60 | 3.68 | — |
| Dafunk — scream | 1.07 | 1.06 | 6.9e-2, 17.4 M non-finite samples |

Two conclusions, both now in the code:

- **32 kHz makes the V2 filters diverge into NaN.** A device or Bluetooth route running at 32 kHz would have
  produced garbage. The context is created with `{ sampleRate: 44100 }` (V2's native rate, and the tamer of
  the two on every outlier measured), falling back to the default rate if the browser rejects the option.
- **Normalise by loudness, never by peak.** A tune peaking 15× is loud *throughout*; scaling it by 1/15
  would make it inaudible. The player reads rms off the analyser and eases `preGain` toward
  `TARGET_RMS / rms` (clamped 0.25–2.5), then a `DynamicsCompressor` (-10 dB, ratio 12) catches whatever
  peak survives. The worklet additionally clamps to ±4 and maps non-finite to silence — a NaN reaching the
  destination can poison the whole graph.

Rendering throughput, if a future offline pass is ever wanted again: **27–92× realtime** (track-dependent).

## 3. The hero — the tune's own bytes

`byteCloud(bytes)` in `/_rt/v2m.js`: every three bytes become one point in spherical coordinates
(`theta = b0`, `phi = acos(2·b1−1)`, `r = 0.55 + 0.45·b2`), sub-sampled by a stride above 16 384 points.
So the **point count is the file size** — a 9 KB tune is a visibly sparser object than a 90 KB one, and the
app's argument needs no caption. Audio-reactive via the shared `/_rt/spectrum.js` maths (bass → scale,
treble → point size, centroid → hue nudge, violet 262° → cyan 190°).

Integration follows `[[reference_webgl_threejs_in_farm]]`: `three` in the app's import map only, lazy import
inside the effect, **probe-guarded on `getContext('webgl')`** (never gate-guarded, so CI's headless Chrome
renders the real thing), Canvas2D orthographic projection as the fallback, `data-haswebgl` / `data-render` /
`data-err` breadcrumbs, and an e2e guard that turns "silently fell back to 2D" into a red gate.

## 4. What the gate does instead of the network

`gate` (headless or `?mock`) seeds a six-tune fixture and makes `bytesFor` return the bundled
`demo.v2mz`, so the whole store → play → library flow is exercised end to end without a single request to
modland.
