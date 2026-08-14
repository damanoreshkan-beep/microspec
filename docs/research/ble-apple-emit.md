# Why the Apple cards never fired from our Android emitter — and the fix

**Question.** prox emits proximity-pairing advertisements through Android `AdvertiseData.Builder`
(`ble.advertiseRaw`). Swift Pair / Fast Pair / Samsung fire; **the Apple cards (AirPods "Proximity Pairing"
+ the "Nearby Action" popups) never appear.** Find the exact working recipe from real, maintained Android
apps and fix our encoder so Apple cards actually raise on a target device.

**Status: root cause found + fixed in the runtime (2026-08-14). No edge/Java change needed.** Local gates
green (all 12). The one thing left to the hardware is whether a *current* iOS re-fires at all (§4).

Labels: **VERIFIED** = I read the primary source / measured it here. **INFERRED** = reasoned. **UNKNOWN**.

---

## 1. Root cause — Android strips our trailing zeros, iOS then sees a truncated TLV (VERIFIED)

Our own shell Java documents the trap it did not encode around, `microspec-edge/.../Peripherals.java:246`:

> *The stack strips TRAILING ZERO BYTES from legacy payloads (AdvertiseDataParser.RemoveTrailingZeros). A
> payload that ends in 0x00 arrives shorter than it left. That is the caller's problem to encode around.*

The old `proximityPairing()` ended in a 16-byte **all-zero** "encrypted" tail. Measured here
(`assemble()` → simulate `removeTrailingZeros`):

| Preset | sent | trailing 0x00 dropped | on air | inner len byte claims |
|---|---|---|---|---|
| **airpods** | 27 B | **15** | 12 B | 25 → overruns → iOS rejects |
| iosSetup / wifiPassword | 14 B | 5 | 9 B | Nearby Info lost entirely |
| swiftPair / fastPair / samsungWatch | — | 0 | intact | ✅ (end in text / model id / watch id) |

So it was **Apple-specific**: only the Apple payloads ended in a run of zeros. The round-trip unit gate was
green because it checks the bytes we *hand the shell*, not the bytes Android *puts on air* — a gate blindspot,
now closed by a test that simulates the strip.

## 2. The working recipe (VERIFIED against `simondankelmann/Bluetooth-LE-Spam`, master)

The canonical maintained Android (Kotlin, same `AdvertiseData.Builder` path we use — NOT ESP32 raw-HCI, so
it answers *our* problem). Read from `AdvertisementSetGenerators/`:

- **`ContinuityNewDevicePopUpAdvertisementSetGenerator.kt`** — Proximity Pairing:
  `4C00` · type `07` · len `19`(25) · **prefix `07`** · model(2) · status `55` · `randomBudsBatteryLevel()`
  · `randomChargingCaseBatteryLevel()` · `randomLidOpenCounter()` · color `00` · `00` ·
  **`payload += Random.nextBytes(16).toHexString()`**. Settings: `connectable=false`,
  `ADVERTISE_MODE_LOW_LATENCY`, `TX_POWER_HIGH`, `setIncludeDeviceName(false)`,
  `setIncludeTxPowerLevel(false)`.
- **`ContinuityActionModalAdvertisementSetGenerator.kt`** — Nearby Action:
  `0F` · `05` · flag `C0` · action code · **`Random.Default.nextBytes(3)`** auth. `prepareAdvertisementSet()`
  re-writes the auth bytes with fresh random each cycle. **No Nearby Info (0x10)** structure is included —
  the action goes alone (contradicts our earlier `ble-air.md §3` INFERRED "must ride with a Nearby Info").

**The load-bearing fact (VERIFIED, quoted source lines):** the dynamic fields and the tail are
**`Random.nextBytes`** — i.e. **non-zero**, so they survive the strip, **and fresh each cycle**, so a modern
iOS treats each advert as a new device.

Their advertise settings match our shell exactly — so **no Java/edge change is required**; the whole defect
lived in the JS encoder.

## 3. The fix (shipped in `packages/runtime/blesend.js`)

- `proximityPairing(model, rnd)` / `nearbyAction(action, rnd)` take an entropy source `rnd = (n) => bytes`.
  The app passes `crypto.getRandomValues`; omitted, it falls back to a fixed non-zero fill so the pure module
  stays deterministic for the gate.
- Battery / charging / lid / 16-byte tail (proximity) and the 3-byte auth tags (nearby action + its info) are
  now `rnd`-filled, **never zeros**. `prefix` changed `01` → `07` to match the proven-on-air value.
- **`nz()` forces the final on-air byte non-zero** — crypto entropy lands a 0x00 terminator ~1 cycle in 256,
  which would strip one byte and overrun the length again; the terminator guard removes that residual.
- `apps/prox/view.js`: Apple presets are `dynamic` — `emit()` supplies `crypto` entropy and **re-emits a
  fresh payload every 2 s** while live (the shell replaces the single advertising slot), so a modern iOS
  re-raises the card. Static-text presets hold one packet. Interval cleared on stop/unmount.
- New gate: `blesend_test.js` simulates `removeTrailingZeros` and asserts every dynamic preset ends non-zero,
  even against a worst-case all-zero entropy source. Measured after the fix: **0 bytes dropped for every
  preset** (airpods 27→27, was 27→12).

## 4. What is still UNKNOWN — do not promise it in copy

- **Does a current iOS (18/26) raise the card at all?** UNKNOWN — unchanged from `ble-air.md §9`. The working
  RE corpus is device-tested only to iOS 17.x (jb0x168). Android cannot set the BT MAC without root; it
  rotates the resolvable private address on its own (~15 min), *not* per advert — so re-randomising the
  payload alone may still read as the same device to a strict iOS. A fixed non-zero tail is **enough to
  survive the strip and raise the FIRST card**; reliable *re-firing* wants per-cycle entropy (now done), but
  neither is a guarantee on 18/26. The owner's OLD-iOS iPad is the permissive case — test there first.
- **Model table** (`APPLE_MODELS`): `0x0e20` = AirPods Pro confirmed VERIFIED (both our decoder and the
  working repo's device list). A wider cross-check of the other codes was not completed (Codex refused the
  follow-up as flagged; not worth a second attempt for a nice-to-have) — the existing table is unchanged and
  already reasonable.

## 5. Fold-back

`[[project_ble_proximity]]` updated. The durable rule — *a legacy BLE advertisement must never end in 0x00
because Android strips trailing zeros* — now lives in the `blesend.js` header, the `nz()` guard, and a gate
test, so it cannot silently regress.
