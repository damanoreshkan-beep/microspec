# hive — research note

What a phone can honestly say about the radio around it, and what it cannot. Written before the build, so
the build encodes measurements instead of impressions.

The long read was delegated to Codex (bounded brief, cited claims). **Everything load-bearing below was
re-checked here against the primary source** — the "checked" column says how. Where my check disagreed with
the delegated report, my check wins and the disagreement is recorded.

## The three findings that decide the product

1. **RSSI is not a distance.** It is a noisy proximity observation. Encoding metres would be a fabricated
   measurement.
2. **A stock phone has no bearing to a passive emitter.** No public Android API returns an angle. The only
   bearing that exists is one the user *earns* by sweeping the phone — and even that is "strongest observed
   direction", not angle-of-arrival.
3. **No standard specifies when to raise a tracker alert.** DULT specifies the *accessory*, not the
   detector. Every threshold in Guard is our own product policy and must be worded as such.

Together these kill the obvious design (devices pinned at a bearing and a distance on a dome). See
**The dome is an uncertainty volume** below for what replaces it.

---

## A. RSSI → distance

The log-distance model, with RSSI as received power in dBm and `d0 = 1 m`:

    d̂ = 10 ^ ((A − RSSI) / (10n))

`A` = expected RSSI at 1 m for *this* transmitter and *this* receiver; `n` = path-loss exponent;
the omitted term is zero-mean log-normal shadowing.

**Why this cannot be shown as metres** — arithmetic I recomputed rather than accepted:

| Reference-power error | n = 2 | n = 3 | n = 4 |
|---|---|---|---|
| −10 dB | ×0.32 | ×0.46 | ×0.56 |
| +10 dB | ×3.16 | ×2.15 | ×1.78 |

`10^(10/20) = 3.162` — **checked: recomputed by hand.** At `n = 2`, doubling the true distance changes RSSI
by only `10·2·log10(2) = 6.02 dB`, while body shadowing and orientation routinely move it by 10 dB or more.
The nuisance is larger than the signal. A 20 dB spread of transmit-power settings is a **10×** distance
ambiguity.

Transmit power really does span tens of dB across ordinary devices — Nordic nRF52832 is programmable
−40…+4 dBm, nRF52840 −40…+8 dBm, TI CC2640R2F ≈ −21…+5 dBm (**checked: chip datasheets, cited in the
delegated report; treated as the available-settings range, not a population distribution**).

There is **no public dataset** of the actual advertising-power distribution across real trackers, phones and
earbuds. **UNVERIFIED — the build must not depend on a population prior.**

> **Decision.** No metres anywhere in the UI. Strength renders as bands (immediate · near · far · faint),
> and the band boundaries are dBm cut-offs — a number we actually measured — never a converted distance.
> `A` and `n` exist in the runtime only as *explicit named arguments* for a future per-device calibration,
> so nothing can silently default to the folk constant `A = −59, n = 2`. That value is a beacon-profile
> calibration, not a Bluetooth constant.

## B. Smoothing

Stationary BLE traces span roughly 5–15 dB peak-to-peak, with excursions past 20 dB under multipath and
body blocking. There is **no defensible universal consecutive-sample standard deviation** — published work
uses different intervals and hardware. **UNVERIFIED as a constant; recorded as a magnitude only.**

Consequence encoded in the build: **a 6 dB jump is not evidence that anything moved.**

Filter choice — time-based EWMA, because advertisement intervals vary:

    α = 1 − e^(−Δt / τ),   τ = 1.5 s to start

**Checked: filter arithmetic recomputed.** A fixed per-sample α silently changes meaning when the
advertising rate changes, which is the trap a copied constant walks into. A 1-D Kalman filter over a
constant-state scalar reduces to an adaptive exponential smoother, so it buys nothing until there is a
motion model to justify it — not built.

Raw samples, not smoothed ones, feed the heading accumulator: smoothing before binning drags a value across
the bins it is supposed to discriminate.

## C. What is in an advertisement

AD structures are `[length][type][value…]`; `length` counts the type octet but not itself; zero length
terminates. Legacy payloads cap at 31 bytes; extended advertising can fragment. **Checked: Bluetooth Core
Vol 3 Part C §11 / Assigned Numbers.**

Types worth keeping: `0x01` flags · `0x02/03/06/07` service UUIDs · `0x09` complete local name ·
`0x0A` Tx power · `0x16/20/21` service data · `0x19` appearance · `0xFF` manufacturer data (first two value
octets are the company ID, little-endian).

### The identifier registry — checked myself, and the delegated report needed correcting

Fetched `assigned_numbers/uuids/member_uuids.yaml` from the Bluetooth SIG public repo:

| UUID | Registry says | Note |
|---|---|---|
| `0xFCB2` | **Apple Inc.** | The DULT service-data UUID (draft §3.6) is registered to Apple, *not* to "DULT" |
| `0xFEED` | Tile, Inc. | |
| `0xFD5A` | Samsung Electronics | |
| `0xFE2C` | Google LLC | Fast Pair — headphones and accessories, **not** a tracker marker |
| `0xFEAA` | Google LLC | Eddystone — a generic beacon protocol, **not** a tracker marker |

**Correction to the delegated report:** it described `0xFCB2` as "the DULT 16-bit service UUID". The draft
does use it for the DULT service data TLV, but the registry attributes it to Apple. Both are true; the
framing matters, because "an open standard's UUID" and "a vendor's UUID that a draft adopted" imply
different coverage.

**A company ID is a vendor, never a device class.** Apple `0x004C` covers iPhones, watches, earbuds and
Continuity. This is the single easiest way to build a false-positive machine.

### Address rotation — why identity by MAC is impossible

DULT §3.5.1, quoted from the draft text I fetched:

- near-owner state → **rotate every 15 minutes**;
- separated state → **rotate every 24 hours**, explicitly *"allows a platform's unwanted tracking algorithms
  to detect that the same accessory is in proximity for some period of time"*;
- rotate on every state transition.

**Checked: read verbatim in `draft-ietf-dult-accessory-protocol-00`, lines 525–545.**

Address type is readable from the top two bits of the most significant octet: `00` non-resolvable private,
`01` resolvable private, `11` static random, `10` reserved. **Checked: consistent with the draft's own
§3.5 discussion of setting non-resolvable vs resolvable private addresses.** Caveat: Android's
`BluetoothDevice.getAddress()` does not hand an app the over-air address *type*, so this is an inference
from bytes, not a reported field.

> **Decision.** No cross-rotation identity is invented. Devices are keyed by address within an epoch, and a
> rotation is shown as what it is — the trail ends. Merging two addresses because their RSSI and vendor look
> similar would manufacture a follower out of two strangers carrying the same model of earbud.

## D. Guard — and the negative result the whole feature rests on

The IETF working-group document is `draft-ietf-dult-accessory-protocol-00`, revision `-00`, **expired
2025-05-08, not an RFC**. **Checked: Datatracker API.**

The draft specifies accessory behaviour with real constants — separated after >30 minutes, 15 min / 24 h
rotation, sound-maker timers, ≥60 phon peak.

**It specifies nothing for the detector.** The delegated report claimed this; I checked it and the truth is
blunter than the claim. Section 6, *"Platform Support for Unwanted Tracking"* — the section that would carry
detector requirements — reads in full:

    6.  Platform Support for Unwanted Tracking

       This section details the requirements and recommendations for
       platforms to be compatible with the accessory protocol behavior
       described in the document.

       TODO

**Checked: `draft-ietf-dult-accessory-protocol-00`, lines 1853–1859.**

Apple and Google both describe their alerts only qualitatively ("moving with you over time", "travelling
with you and separated from its owner") and publish **no** duration, displacement, sighting count or RSSI
threshold. **UNVERIFIED and unverifiable — treat any blog's exact numbers as one journey on one OS build.**

> **Decision.** The 30-minute figure is an *accessory* state constant and is never used as an alert
> threshold. Guard's thresholds are ours, are named as our policy in the copy, and the screen says
> "possible" rather than asserting a tracker. No claim of standards compliance is made anywhere.

### The one thing that IS spec-grade — found after the delegated pass, by reading the draft

Everything above is why Guard cannot be confident. This is why it can be more than a co-motion guess.

A conforming accessory **announces its own separation**. The draft's Table 1 (§3.4.2, "Location-enabled
advertisement payload format") lays out the service data for UUID `0xFCB2`, AD type `0x16`:

| Bytes | Field |
|---|---|
| … | Service Data TLV, type `0x16`, value `0xFCB2` |
| 13 | Network ID |
| 14 | **Near-owner bit** (least significant bit) + 7 reserved |
| 15–36 | optional proprietary payload |

So within the service data value, after the two UUID octets, come the Network ID and then a byte whose
**bit 0 is the near-owner flag** — `0` meaning **separated from its owner**, which is exactly the state
that justifies telling the user anything. §3.4.5 also requires the separated-mode address to rotate every
**24 hours** *specifically* so a detector has a usable observation window.

**Checked: read in `draft-ietf-dult-accessory-protocol-00`, the payload table around line 400 and the
rotation policy at 525–545.** This is read state, not inference, and it is the difference between a guard
worth shipping and a co-travel heuristic. Implemented as `dultState()` in `packages/runtime/radar.js`.

### What legitimately follows you

Own earbuds, watch, laptop; a family member's devices; every other passenger on the same train; a colleague
with the same commute; a neighbour sharing the lift; parked cars; retail beacons on a fixed route. Plus two
failure modes of our own making: one rotating device split into many "unknowns", and several identical
products merged into one phantom follower.

Guard therefore requires *all* of: tracker-protocol evidence (not a vendor ID), repeated sightings across
separated time windows, real user displacement rather than GPS jitter, co-motion across more than one
context segment, absence from a known-devices registry, and suppression while stationary at a familiar
place. Confidence decays. This is a screening aid, and the copy says so.

## E. Scanning behaviour

AOSP scan windows/intervals — implementation defaults, **not SDK guarantees**: low power 500/5000 ms (10%),
balanced 2000/5000 ms (40%), low latency 5000/5000 ms (100%).

Roughly **5 scan starts per 30 seconds per app** before the framework pushes back. The design consequence is
structural: **one long-lived subscription, never a scan per UI refresh.**

An **unfiltered** scan is stopped when the screen turns off; a scan carrying at least one `ScanFilter` is
not. A foreground service improves process survival but does **not** override controller scheduling,
throttling, or the screen-off rule. A scan gap is "unknown", never "the device left".

## F/G. What we are throwing away, and what does not exist

The Java holds a full `ScanResult` and forwards `addr/name/rssi` only. Worth adding: raw `ScanRecord` bytes
(canonical — a reduced schema cannot classify a protocol invented later), `timestampNanos`, tx power,
service UUIDs, service data, manufacturer data, `dataStatus`, `isLegacy`, `isConnectable`, PHY, SID.
API-26+ getters are guarded by `SDK_INT`; **that fact is verified by the compile itself**, which is why it
is not pinned as a constant here.

**Wi-Fi RTT (802.11mc FTM) is the one API that returns a real range** — Android documents 1–2 m, and
controlled studies report sub-metre LOS medians. But it needs `FEATURE_WIFI_RTT`, an AP advertising
`is80211mcResponder()`, API 28, and it is throttled. Ordinary home routers mostly do not enable it, and
there is no 2026 census. **Finding zero responders is a normal outcome** — so RTT can only ever be an
opportunistic bonus, never a promise the UI makes before scanning.

Everything that would give a true bearing is out of reach: BLE 5.1 AoA/AoD needs an antenna array and
exposes no public Android API for IQ samples; Bluetooth 6.0 Channel Sounding has no public Android ranging
API; UWB needs a cooperating, authorised peer. **Checked: these are platform-doc negative results, and a
negative result is exactly what stops a build aiming at something that does not exist.**

---

## The hive: a honeycomb, because a honeycomb has no compass

The design consequence of findings 1 and 2, and the reason this app is worth building in 3D at all.

A dome that pins each device at an azimuth and a radius would be inventing both numbers. So the dome does
not show *where things are*. It shows **what we know about where they are**, and the geometry is the
evidence:

- **Height** = signal as a percentage of THAT RADIO's own dBm range. The three radios are not one
  quantity, so each is scaled against its own floor and ceiling (`SCALE` in `packages/runtime/radar.js`).
- **Position** = RANK, not direction. Cells spiral out from the centre strongest-first. A honeycomb tiles a
  plane; it has no compass, so no angle in it can be misread as a bearing — which is exactly why it
  replaced the ring-and-centre dome that came first.
- **Hunt still owns angles**, and only there: `df.js` withholds a bearing until concentration and coverage
  earn it, so an omnidirectional antenna honestly produces a circle that never narrows.
- **Height is not a data axis.** We have no elevation information, so nothing is placed by altitude. The
  vertical dimension is the uncertainty band's own geometry.

This is why the phone must be a window into a world-locked scene: the rings are anchored to true north via
`compass`, so turning the phone turns the world and the user's sweep is legible as motion through it.

## Reuse, not reinvention

- `packages/runtime/df.js` — the polar accumulator, circular statistics, `BEARING_MIN_R = 0.15`,
  `BEARING_MIN_COVERAGE = 0.75`, `hasBearing()`. Already unit-tested. **Hunt mode is this module.**
- `packages/runtime/sensors.js` — `compass.start` already applies the World Magnetic Model, so headings are
  **true** north with no app-side declination. `tilt` for parallax; `geo.watch` for Guard's displacement.
- `packages/runtime/shell.js` — `has`/`why`/`call`/`subscribe`; degrade honestly, never pretend.
- `reference_webgl_threejs_in_farm` — lazy import inside the effect, probe-guarded on `getContext("webgl")`
  (not gate-guarded, so CI shoots the real 3D), colours read from CSS and re-read on a `data-theme`
  mutation, DOM fallback keeps `data-mark` and the a11y surface.

## The UNVERIFIED list — the build must not depend on these

- Any population distribution of real advertising transmit power.
- A universal consecutive-sample RSSI standard deviation.
- Apple's or Google's actual alert thresholds.
- A single passive frame format identifying every Google Find My Device accessory.
- Current MAC-rotation cadence for Tile and Samsung SmartTag models.
- The installed-base share of FTM-capable access points.

## Wording rules this research imposes

Never: "distance", metres, "bearing to device", "angle of arrival", "direction finding", "tracker detected",
"DULT compliant".

Instead: strength bands; "strongest observed direction"; "sweep confidence"; "possible tracker"; and a plain
statement that thresholds are ours.

---

## Naming the manufacturer — where that question has an answer

The IEEE MA-L registry maps a 24-bit prefix to an organisation, so an access point's BSSID names its
maker. **Measured** (`tools/oui/build.mjs`, 2026-08-05): 39,895 usable MA-L assignments, 19,627 distinct
organisations, 3.8 MB of source CSV. Packed to 519 KB (243 KB gzipped) by delta-encoding the sorted
prefixes and deduplicating names into a string table; the names alone are 288 KB, which is the floor.
Lazy-loaded once, only on a screen that shows names, and cached by the service worker.

**The trap, and why the lookup refuses more often than it answers.** A BLE *random* address is
cryptographic padding with two type bits on top — it is not an IEEE assignment, so running it through the
table returns a confident and entirely invented manufacturer. Worse, the bytes cannot settle it: Android
never exposes the over-air address type, and Espressif's real OUI `24:0A:C4` has the same top two bits as
a non-resolvable private address.

So two independent signals must agree before a name is shown:

1. the address is **globally administered** — the U/L bit (`0x02` of the first octet) is clear;
2. the prefix is **actually in the registry**.

and a resolvable private address — the dominant rotating kind — is excluded outright. A random address
coincides with a registered prefix in roughly **0.2%** of cases (≈40k assignments out of 16.7M).

The result: Wi-Fi access points almost always get a name, rotating BLE devices never do, and a cell gets
nothing because it has no MAC at all. The row says `rotating address` instead — which is the true
statement about it.

---

## The motion system (2026-08-10 premium pass) — decisions, so they are not re-derived

The comb is a live instrument; the original render was a still that TELEPORTED between states (rank change,
signal change, ring growth, device arrival were all attribute jumps). The motion pass is CSS-only —
transform + opacity, compositor-only, every transition names its property, reduced-motion switches the
whole system off, and under the gate the entrance classes are omitted so shots stay deterministic.

- **Layout by transform, never by attribute.** The viewBox is a constant `-100 -100 200 200`; one
  `.hv-scale` group carries `scale(s)` (ring growth = the whole field breathes outward, 700 ms), each cell
  group `.hv-cell` carries its `translate()` in comb units (rank change = a glide, 620 ms, expo-out
  `cubic-bezier(.22,1,.36,1)`). `viewBox` itself cannot transition; a transform can.
- **Signal = area, animated as scale.** The filled hex is drawn full-size once (`CELL`) and scaled by
  `k = √(pct/100)` on its own `.hv-fill` group — 500 ms with a slight overshoot, so a cell "наливається".
- **SVG transform-origin is a trap twice over.** Every transformed group states `transform-box` +
  `transform-origin` explicitly — and the viewBox must start at `0 0`: `transform-box: view-box` anchors
  its reference box at the ORIGIN of the viewBox coordinate system, not at its min-x/min-y corner, so a
  `-100 -100 200 200` viewBox shifted every origin by 100 units and the first deploy rendered the comb off
  the left edge. With `0 0 200 200` both readings coincide; the centring lives in the transform chain
  (`translate(100px,100px) scale(s)`), and per-cell groups use `fill-box`+center (cell geometry is centred
  on local (0,0), so the origin is the cell centre).
- **Hairlines via `vector-effect="non-scaling-stroke"`** — 1 px comb lines and a 2 px accent target ring at
  any comb size, instead of strokes that fatten as the field shrinks.
- **The petal morphs through CSS `d`.** Chromium/Firefox transition the `d` property when the point count
  is fixed (ours is always 72 + Z); the attribute stays as the semantic fallback. The bearing needle is a
  rotated group fed by `unwrapDeg()` (`packages/runtime/radar.js`, unit-tested) so 359° → 1° takes the
  short arc, never a 358° spin.
- **Clarity marks, not captions:** scanning = a pulsing accent dot beside the tally (idle keeps the word);
  LTE cells are hatched (`<pattern>`, currentColor) because a tower is infrastructure, not a personal
  device; the target is a steady accent ring.
- **Entrance:** cells bloom (opacity+scale, 450 ms, 24 ms stagger capped at 20 cells); keyframes declare
  only `from`, so they land on the element's own computed values and cannot fight inline transforms.

### The 2026-08-10 owner pass — reimagined, still honest

- **The comb is the farm's material now, not a wireframe.** Each cell carries a drawn bevel: the three
  upper edges take one token of the `--nm` pair, the three lower the other — occupied cells are the page
  extruded, empty comb is recessed. The lit edge is DRAWN, never inherited (the brick lesson), and the
  tokens flip with the theme for free.
- **Hunt is a heading-up compass.** The dial (ticks, petal, needle) rotates by −heading with NO easing
  (the magnetometer is already smooth; easing makes the world lag the hand); a fixed lubber mark shows the
  phone's forward direction, so "walk the arrow onto the lubber" is the whole instruction. North is the
  accent tick and it moves because the world does.
- **The arrow exists from the first sample — as a PROVISIONAL reading.** df.js's thresholds are untouched;
  what changed is the rendering of the state below them: a dashed, half-opacity needle inside an
  uncertainty wedge whose span is `90°·(1−r)` (clamped 12–80°). The wedge is the honesty — a guess and an
  earned bearing can never look alike, and the arrow the owner asked for appears the moment a target is
  picked and heard.
- **The arrow LEADS because the rose forgets** (owner field report: "стрілка має вести"). `newRose(72,
  30_000)` opts hive's rose into time decay — every bin fades by e^(−Δt/τ), the per-bin weight becomes
  decayed MASS (strength × recency), so a weaker fresh reading out-votes a stronger stale one and the
  bearing follows the walk. homin's stationary fox-hunt rose stays tau-less and bit-for-bit unchanged.
- **The dial blends, unwrapped** (owner field report: "все поплило при зміні напряму"). Sensor events
  arrive in discrete steps, so an un-eased dial judders; the fix is the farm compass's own idiom — a short
  transition (100 ms linear; apps/compass uses duration-100) — but fed a CONTINUOUS unwrapped angle, which
  apps/compass does not do and therefore spins the long way at 359°→0°. The needle blends at 200 ms; at
  500 ms it visibly swam against the turning dial.
- **Hot/cold lives in the dial's centre.** The target's live percent + dBm, with a trend mark only past a
  6 dB shift of window medians (`sightTrend` in radar.js) — RESEARCH §B says a stationary trace wanders
  5–15 dB, so anything smaller is noise and the mark stays away. Medians, not means: one body-shadow
  dropout must not flip the verdict.
