# radar — research note

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

## The dome is an uncertainty volume

The design consequence of findings 1 and 2, and the reason this app is worth building in 3D at all.

A dome that pins each device at an azimuth and a radius would be inventing both numbers. So the dome does
not show *where things are*. It shows **what we know about where they are**, and the geometry is the
evidence:

- **Radius** = measured strength band. A band, not a metre. This is real: it is dBm.
- **Azimuth** = a device with no sweep evidence is drawn as a **complete ring** at its band. It occupies
  every direction because every direction is still possible. Nothing is pinned, so nothing is fabricated.
- **Hunt carves the ring.** As the user sweeps, `df.js` accumulates strength against true heading and the
  ring contracts into the measured petal. When concentration and coverage pass `hasBearing()`, it resolves
  to a lobe. The user watches their own evidence take shape, and an omnidirectional antenna honestly
  produces a ring that never narrows — the instrument shows its own limit by its shape, exactly as `homin`'s
  dial already does.
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
