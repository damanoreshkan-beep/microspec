# Delete audit — which apps earn their tile

**Date:** 2026-08-08. **Status:** measured; every recommendation needs the owner's decision.
DISTILLATION.md §4. This is the only workstream that actually reduces the farm, and it is the one the code
cannot decide on its own — no measurement says whether an app is worth having.

## Signals that did NOT work, and why that matters

Two obvious ideas were tried first and produced nothing:

- **Git activity.** Every app's last commit is 2026-08-06 and every app has 10–17 commits. A farm-wide
  refactor touched everything, so recency cannot distinguish a loved app from an abandoned one. There are
  no stale apps to find this way.
- **Line count.** Thin does not mean pointless — the eight data-only catalogues are thin *because* the
  runtime carries them (§0), which is the farm working correctly, not a defect.

So the audit rests on three signals that do measure something: **shared domain modules** (functional
overlap, not stylistic similarity), **hardware the app cannot work without**, and **efficacy that has never
been demonstrated**.

## A. Functional overlap — apps that share a domain module

`packages/runtime/*` imports were inverted to find which apps compute the same things. Chrome modules
(i18n, ui, gate, db, feed, sensors…) are excluded — they say nothing. What remains:

| Shared module | Apps | What it means |
|---|---|---|
| `globe.js` | globe, iss, quakes, sun | All four render the **same `Globe` component** |
| `astro.js` | compat, sigil, sun, transit | Shared ephemeris |
| `zodiac.js` | compat, horoscope, transit | Shared sign machinery |
| `synastry.js` | compat, transit | Shared element/modality tables |
| `ai-text.js` + `translate.js` + `lastgen.js` | imagine, retouch | Same AI image pipeline |
| `colour.js` | pipette, synesth | Same camera → colour path |

### The three merge candidates this actually supports

**1. `imagine` + `retouch` → one app, two tabs.** The strongest case in the farm. Both are a single tool tab
plus a profile (`imagine`: `make`, `retouch`: `edit`). Both import the same three runtime modules, both post
to the same edge image endpoint, both are "AI makes you a picture". The only difference is whether you
supply a source photo. That is a tab, not an app.
*Cost:* one merged view, two i18n dicts folded together, one store tile lost.

**2. `globe` + `iss` + `quakes` → one globe with layers.** All three mount the same `Globe` and differ only
in what they plot on it: countries and facts, one propagated satellite, live seismic events. A single globe
where you switch the layer is a better product than three tiles that each spin the same earth.
*Not `sun`* — it uses `Globe` too, but its job is a solar compass (azimuth, golden hour), which is a
different question that happens to want a sphere.
*Cost:* three specs into one, layer routing, three e2e suites into one.

**3. `compat` → a tab inside `transit`.** `compat` is the smaller half of an apparatus `transit` already
carries: it imports `zodiac.Sign`, `astro.eclipticPositions` and `synastry.{signOf,compat,band}`, all of
which `transit` also imports alongside `natal`, `birth`, `skydial` and houses. Synastry between two people
is a genuinely different reading from transits to your own chart — but it is a reading, not an app.
*Cost:* a second birth-record input inside transit; `compat`'s tile lost.

**Explicitly NOT recommended:** `pipette` + `synesth` share `colour.js` but do opposite things — one reads a
colour off the world, one turns colour into sound. Shared code, unrelated products. And the esoterica
cluster beyond `compat` (`horoscope`, `tarot`, `sigil`, `pendulum`) shares almost nothing: Codex measured
12–21 exact shared lines, and tarot/sigil/pendulum are separate engines.

## B. Hardware-gated — six apps need a device that may not exist

`ether`, `fmradio`, `gsmscan`, `homin`, `lorawatch`, `subclone` all declare `usb` (as of commit `9c189eb`)
and open a HackRF One over WebUSB. That is **six tiles — 9% of the farm** — whose entire surface is a
"connect your device" screen for anyone without a ~$300 SDR.

This is not a code question and not a quality question. Every one of them is well built. The question is
only: **does the owner have the hardware, and is the farm meant to ship apps that only the owner can run?**
Both answers are defensible; the audit cannot pick.

If the answer is "no device" or "not for the public store", the cheapest correct move is **not deletion** —
it is a store-level distinction (a `hardware` category, or hiding them behind a toggle), because the code is
sound and deleting it destroys work that a later device would restore.

## C. Efficacy never demonstrated — `sonar`

`sonar` is fully built, unit-tested, in the store, and its `RESEARCH.md` §6 states plainly that the S25
Ultra's acoustics above 17 kHz are UNVERIFIED: real carrier SNR, whether a sharp low-pass or notch exists,
the minimum usable gain — all unknown. CI structurally cannot test it (`docs/GATE_BLINDSPOTS.md`).

So its value rests entirely on a measurement nobody has taken. **This is a two-minute test, not a deletion
decision:** open `/sonar/`, go to the Signal tab, read the carrier SNR it prints. Delete only if the tone
does not survive the device.

The same shape may apply to other sensor apps, but `sonar` is the only one whose own research note admits it.

## D. Everything else — keep

The remaining ~57 apps show no overlap signal, no hardware gate, and no efficacy question. The eight
data-only catalogues in particular are cheap by design and were already ruled out of merging in §0 with
measurements.

## Recommendation, in order of confidence

| # | Action | Confidence | Tiles removed |
|---|---|---|---|
| 1 | `imagine` + `retouch` → one app | **High** — same pipeline, same shape, differ by one input | 1 |
| 2 | `globe` + `iss` + `quakes` → layered globe | **High** — same component, different data | 2 |
| 3 | `compat` → a tab in `transit` | Medium — subset apparatus, distinct reading | 1 |
| 4 | hackrf ×6 → owner's call (category, not deletion) | Blocked on the owner | 0–6 |
| 5 | `sonar` → measure before deciding | Blocked on a device pass | 0–1 |

Items 1–3 remove **4 tiles**, 68 → 64, with no capability lost. That is the honest ceiling of what a delete
audit finds here, and it is small — which is itself the finding: the farm does not contain junk, it
contains a lot of small, working, deliberate apps.

If the tile count is still the problem after this, that is the argument for §5 (the sources host), and it
should be taken on those terms rather than as a code-quality argument.
