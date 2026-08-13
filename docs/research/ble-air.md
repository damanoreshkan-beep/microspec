# BLE proximity-pairing protocols — analyzer + own-device transmitter (home lab)

**Question.** Build a home-lab tool, tested between the owner's OWN TWO devices, that (A) reads raw BLE
advertisements and classifies/decodes the common Apple + Android + Microsoft proximity-pairing protocols,
and (B) can emit each one so the owner can see what it does on his own second device. What are the exact
byte layouts, what text (if any) is free-form, and what does the shell need to gain to transmit them?

**Status: research complete, build NOT decided; transmitter needs a shell change (see §5).** This is
dual-use security/education research on owned devices. The transmitter ships behind a first-run consent gate
(§6) and never as a public farm capability.

Sources are labelled: **SPEC** (vendor primary), **RE-CONSISTENT** (multiple independent reverse-engineering
sources agree), **RE-SINGLE** (one RE source), **UNKNOWN**. Every load-bearing byte table below was read by
me from the cited source, not summarised second-hand.

---

## 1. The decisive constraint, in our own tree (VERIFIED)

`packages/shell/actions.json` → `ble.advertise`: the payload is carried under **company id `0xFFFF`**, and the
schema says why: *"the shell fixes it so a page cannot impersonate a vendor."* iOS/Android/Windows all ignore
`0xFFFF`. **So today the farm physically cannot emit any of these popups.** Every protocol below needs either a
different company id (Apple `0x004C`, Microsoft `0x0006`, Samsung `0x0075`) or a **service-data** AD structure
(`0x16`) that `ble.advertise` does not build at all. This gap, not the app, is the real work.

## 2. The one honest answer about custom text ("тук тук")

| Target | Mechanism | Free-form text? |
|---|---|---|
| **iPad / iPhone** (old iOS) | Apple Continuity Nearby Action / Proximity Pairing | **NO** — text is fixed by an action/model code (§3). Only hashes travel in the packet. |
| **Windows PC** | Microsoft Swift Pair | **YES** — an uncapped "Display Name" field; Windows shows *"New <name> found"* (§4, SPEC). |
| **Android** | Google Fast Pair | **NO** — the shown name comes from Google's hosted model-ID database, not the advertisement (§4, SPEC). |

So the owner's stated goal (a custom-named popup on his **old-iOS iPad**) is **not achievable** — Continuity
carries no free-form string. A custom-named popup is achievable **only against a Windows machine** via Swift
Pair. This is a hard protocol fact, verified against furiousMAC (Apple) and Microsoft (Swift Pair) primary docs.

## 3. Apple Continuity — company id `0x004C`, manufacturer data `0xFF`, TLV of `type · len · value`

Read from **furiousMAC/continuity** (academic RE dissector), `messages/*.md`. **RE-CONSISTENT** with
Celosia & Cunche, *Discontinued Privacy* (PoPETs 2020).

**Nearby Action — type `0x0F`** (`messages/nearby_action.md`). Layout: `0F · len · action-flags(1) ·
action-type(1) · auth-tag(3) · params(var)`. Action-type table (the popup selector):

| Code | Action | Popup |
|---|---|---|
| `0x01` | Apple TV Setup | yes |
| `0x06` | Apple TV Pair | yes |
| `0x08` | **Wi-Fi Password** | yes — the "share this network's password?" sheet (the thing the owner remembered) |
| `0x09` | iOS Setup / "Setup New Device" | yes |
| `0x0B` | Speaker (HomePod) Setup | yes |
| `0x0D` | Whole-Home Audio Setup | yes |
| `0x04/05/07/0A/0C/0E–0x17` | Mobile Backup, Watch Setup, Internet Relay, Repair, Apple Pay, dev/call events | mostly silent |

The Wi-Fi Password params are **hashes only** — SSID hash (3B), Apple-ID hash (3B), phone hash (3B), email
hash (3B). **No text field anywhere.** VERIFIED.

**Proximity Pairing — type `0x07`** (`messages/proximity_pairing.md`): `07 · len · prefix(0x01) ·
deviceModel(2, e.g. 0x0e20 AirPods Pro) · status · batteries(3) · charging(3) · caseBattery · lidCounter ·
color · 0x00 · encrypted(16)`. Battery/charging/**lid counter** are dynamic — static values are why old
static spam payloads stopped firing. VERIFIED.

**Nearby Info — type `0x10`** (`messages/nearby_info.md`): `10 · 05 · statusFlags(4b)+actionCode(4b) ·
dataFlags · auth(3) · [postAuth(1) on newer iOS]`. Broadcasts device usage state; **it accompanies the others**,
which is why a lone Nearby Action is less reliable than one paired with a plausible Nearby Info. VERIFIED.

**Find My — type `0x12`** (`messages/findmy.md`): offline-finding key beacon. For the ANALYZER to classify
only; we do not emit it. (Cross-refs the AirTag research already in memory.)

**iOS version behaviour** (corrected 2026-08-13, §9): the *crash/DoS* on iOS 17.0–17.1 was partially fixed in
17.2 and fully in 18 (VERIFIED). Whether the *popups still fire* on iOS 18/26 with a STATIC MAC + static
auth/payload is **UNKNOWN** — every RE corpus that reliably re-fires (AppleJuice, tutozz) rotates MAC/auth
each cycle, and the one device-tested analysis (jb0x168) only covered iOS 17–17.1.1. The owner's OLD-iOS iPad
is the most permissive case; on 18/26 a static Continuity preset may give at most a first prompt, and the copy
must not promise more. This corrects an earlier "popups still fire on current iOS" that had no citable device
test for 18/26.

## 4. Android & Windows

**Google Fast Pair** — **service data** AD (`0x16`), 16-bit UUID **`0xFE2C`** (little-endian on air: `2c fe`).
Discoverable (pairing-mode) frame = **3-byte model id**; non-discoverable = `0x00` + account-key filter. The
"Tap to pair" half-sheet's **name+image come from Google's hosted model-ID DB**, keyed by that 24-bit id — not
from the packet. SPEC (`developers.google.com/nearby/fast-pair`). So an unregistered id shows a generic/no
sheet; only known ids render a name. **Not free-form.**

**Microsoft Swift Pair** — manufacturer data (`0xFF`), company id **`0x0006`**. Payload: `beaconId ·
subScenario · reservedRSSI(0x80) · [DisplayName variable]`. Sub-scenario: `0x00` LE-only, `0x01` BR/EDR-only,
`0x02` LE+BR/EDR SC. **Display Name is free-form and uncapped**; Windows renders *"New <DisplayName> found"*.
Must be in the **main advertisement** (Windows does not active-scan → nothing usable in scan response). SPEC
(learn.microsoft.com/.../bluetooth-swift-pair). **This is the only free-form-text path.** Exact beacon-id
bytes live in figure images, not text → verify offsets with a sniffer (INFERRED on exact offsets).

**Samsung EasySetup** — Galaxy Buds/Watch pairing sheet, company id `0x0075`. Byte table NOT yet read from a
primary/RE source (the mayhem wiki only described behaviour). **UNKNOWN — do not build the Samsung emitter
until its bytes are read from Flipper Xtreme-Apps source or an RE writeup.**

**Eddystone** — service data (`0x16`), UUID **`0xFEAA`** (`aa fe`), first value byte = frame type (`0x00` UID,
`0x10` URL, `0x20` TLM). Benign, open SIG format — the harmless demo tile and a good analyzer self-test. SPEC.

## 5. What the shell must gain (the build gate)

`AdvertiseData.Builder` on Android supports both `addManufacturerData(companyId, bytes)` and
`addServiceData(ParcelUuid, bytes)`. The current action exposes neither knob — it hard-codes company `0xFFFF`,
manufacturer only. To transmit §3–4 the shell needs a **new, separate capability** (proposal:
`advertise-raw`, distinct from `advertise`, so the farm-wide `advertise` stays vendor-locked):

- accept an **array of AD structures**, each `{ kind: "mfg"|"svc", id: <companyId|uuid16>, data: <hex> }`,
  assembled verbatim — Continuity is often two structures (Nearby Action + Nearby Info), so one payload is not
  enough (VERIFIED by §3);
- optional advertised **device name / appearance** (Swift Pair prefers a Bluetooth friendly name);
- keep non-connectable legacy, 31-byte budget, the existing 180 s timeout ceiling.

Cost is the shell path from `rules/shell.md`: catalogue → publish → Java in `microspec-edge`
(`AdvertiseData.Builder` + `BLUETOOTH_ADVERTISE`) → template rebuild in CI → **hand-verify on device** (CI
never runs the radio). Edge commit = deploy, so this needs the owner's explicit go-ahead. **Design the
capability, get the OK, then touch edge.**

## 6. Safety posture (decided)

- **Transmitter behind a first-run consent gate** — a "RadioPrime"-style screen (mirrors the camera's
  `CameraPrime`, `rules/invariants.md`): "own devices only, controlled space, at your own risk," gated on an
  explicit acknowledgement, re-shown, and the emit path stays inert until acknowledged.
- **`advertise-raw` is its own capability**, named in exactly one app's capability list; the general
  `advertise` never gains vendor impersonation.
- **Analyzer needs no shell change** — `ble.scan` already returns the raw ScanRecord hex; it ships first.

## 7. UNVERIFIED / to close on the device — the build must not depend on these

- Samsung EasySetup Watch byte layout — **now VERIFIED from source (§9)**; Buds still deferred (needs a
  scan-response channel the shell lacks). UI appearance on One UI 7/8 remains UNKNOWN — device-test it.
- Swift Pair exact beacon-id byte offsets (§4) — INFERRED from field order; confirm with nRF Connect.
- The reliable "make Continuity fire" recipe on old vs new iOS: MAC-rotation cadence, whether Nearby Info
  must accompany, which dynamic fields are load-bearing — RE-SINGLE / INFERRED; tune on the owner's iPad.
- Whether our `AdvertiseData.Builder` path accepts a 16-bit service-data UUID and arbitrary company id as
  expected on the reference device — VERIFIED as an API, UNVERIFIED on our APK until the shell change ships.

## 8. Build order

1. **Analyzer app** on `ble.scan` — the §3–4 classification grid with per-type byte decode. No shell change.
   This alone satisfies "grid of cards, each explained, all Apple/Android variants."
2. Design `advertise-raw` (§5), bring to owner for go-ahead, then the edge/Java/CI/device path.
3. **Transmitter app** behind the §6 gate: Eddystone + Swift Pair first (open/SPEC), Continuity next
   (fixed-text, own iPad), Fast Pair, Samsung last (once its bytes are read).

## 9. 2026 reality check — which buttons actually work, and the wire ceiling (2026-08-13)

Prompted by "Fast Pair doesn't pop on my S22, nor on the other S22". Codex surveyed the current RE corpus;
every load-bearing byte below was re-read by me from the cited source.

**What raises UI on a CURRENT stock device, ranked by confidence:**

| Vector | Static-advertisement verdict | Source |
|---|---|---|
| **Swift Pair** (Windows 11) | **VERIFIED** — one notification per session, MAC must stay static; rotation *hurts* (reads as a new device). Best fit for our one-shot emitter. | [MS Swift Pair](https://learn.microsoft.com/en-us/windows-hardware/design/component-guidelines/bluetooth-swift-pair) |
| **Fast Pair** (Android) | **VERIFIED protocol** — discoverable Model ID over `0xFE2C`, BLE address *shall not rotate*, interval ≤100ms. Half-sheet needs a *registered* model id + the receiver's "Scan for nearby devices" toggle ON + internet. UNKNOWN whether 2026 GMS filters a non-connectable advert before showing the sheet → we emit **connectable**. | [Google Provider Advertising](https://developers.google.com/nearby/fast-pair/specifications/service/provider#advertising_when_discoverable) |
| **Samsung EasySetup Watch** | **VERIFIED bytes**, UI on One UI 7/8 **UNKNOWN** (no dated device test) → ships as *experimental*, copy promises nothing. | RE below |
| **Apple Nearby Action / Proximity Pairing** | **UNKNOWN on iOS 18/26** with a static MAC (see corrected §3). Kept as legacy/experimental, own-iPad only. | jb0x168 (iOS 17 only) |
| **Eddystone URL** | **No stock UI on any OS** since Google killed Nearby Notifications 2018-12-06. It is a decoder self-test / beacon, NOT a popup button. | [Nearby Notifications discontinued](https://android-developers.googleblog.com/2018/10/discontinuing-support-for-android.html) |

**THE WIRE CEILING (VERIFIED, `packages/shell/actions.json` → `ble.advertiseRaw`).** `kind` enum is
`["mfg","svc"]` only; `assemble()` emits AD type `0xFF` or `0x16`. So the full 3-AD working Fast Pair form —
`03 03 2C FE` (service-UUID list) + `06 16 2C FE <model>` (service data) + `02 0A <tx>` (TX power) — is
**physically inexpressible without a Java shell change** (a new `uuid16`/`txPower` kind, or
`setIncludeTxPowerLevel(true)` + `addServiceUuid`). `connectable` IS an arg, so it needs no shell change. TX
power being *required* is [jb0x168](https://github.com/jb0x168/ble-spam-analysis#breakdown-of-packet)
(RE-SINGLE), not a Google requirement — so the service-data-only form may still pop; the receiver-side toggles
are the likelier cause of "nothing shows".

**Samsung Galaxy Watch EasySetup — VERIFIED bytes.** manufacturer id `0x0075`, manufacturer data
`01 00 02 00 01 01 FF 00 00 43 <watchId>`. Full manufacturer AD: `0E FF 75 00 01 00 02 00 01 01 FF 00 00 43 <watchId>`.
Watch ids: `01`–`0C`/`11`–`18`/`1B`–`20` are Watch4/5/6 colour variants, `1A` = fallback. Read from
[wirebits ESP32 source](https://github.com/wirebits/ESP32-Samsung-BLE-Spammer/blob/main/ESP32-Samsung-BLE-Spammer/ESP32-Samsung-BLE-Spammer.ino)
(Sep 2025) and cross-checked against [simondankelmann Kotlin generator](https://github.com/simondankelmann/Bluetooth-LE-Spam).

**Samsung Galaxy Buds — DEFERRED.** The working corpus (`42 09 81 02 14 15 03 21 01 09 <id0><id1> 01 <id2>
06 3C 94 8E 00 00 00 00 C7 00`) rides a SEPARATE manufacturer scan-response, which `ble.advertiseRaw` cannot
express (single main-payload channel). A main-AD-only Buds preset would be round-trip-green but unproven —
skip until the shell grows a `scanResponse` channel.

**MAC rotation (VERIFIED):** Fast Pair and Swift Pair *want* a static MAC; only the Apple/Samsung *flood*
PoCs rotate it, and that is spam cadence, not a measured OS cache timeout. Our one-shot static emitter is the
right shape for the two vectors that actually matter.

**Runtime-half vs Java-half.** Everything above except the Fast Pair 3-AD form and Samsung Buds is a pure
runtime change (github.io deploy, reaches every installed APK, no reinstall): `samsungWatch` encoder +
`connectable` on the Fast Pair preset + honest copy. The 3-AD Fast Pair form + Buds scan-response is a
separate edge/Java/deploy task, to be brought to the owner for go-ahead (outward-facing).
