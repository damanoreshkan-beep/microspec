# BLE advertisement as a broadcast transport — the "ether"

**Question.** One phone puts a short text message into BLE advertisements; every other phone running our
APK nearby reads it out of the raw advertisement bytes. No GATT, no pairing, no internet, broadcast-only,
anonymous. Is the payload big enough and the channel good enough for a product, and what does it cost?

**Status: research complete, build NOT decided.** Reference device: Galaxy S25 Ultra, Android 16.
Farm target: minSdk 24, targetSdk 31, framework classes only.

Codex thread `019ff524` produced the hypothesis set. Every load-bearing number below was re-checked by me
against AOSP source I downloaded and read; the validation column says which file and line. Nothing here
rests on the report alone. Where I could not reach a primary source it says UNKNOWN and the build must not
depend on it.

AOSP source read from `platform/packages/modules/Bluetooth`, branch `main`, on 2026-08-12.

---

## 1. What we already have (verified in our own tree)

`microspec-edge/template/app/src/full/java/apk/microspec/Peripherals.java`:

| Fact | Line | Consequence |
|---|---|---|
| `raw` is `rec.getBytes()` — the whole `ScanRecord` | 102 | The receiver can already read an arbitrary payload. No receiver change needed for legacy. |
| `ScanSettings` built with **no** `setLegacy()`, **no** `setPhy()` | 157–160 | Platform default → legacy-only (see §4). |
| `setScanMode(SCAN_MODE_LOW_LATENCY)` | 159 | 100% duty while the screen is on. This is the single best fact in this document. |
| `dstat` / `legacy` / `sid` only at `SDK_INT >= 26` | 109–118 | Reassembly state is unavailable on API 24–25. |
| One scan per process; a second `subscribe` replaces the first | 149 | The ether app and `hive` cannot scan simultaneously. |
| `ACCESS_FINE_LOCATION` **and** location services ON, or the scan silently returns nothing | 122–143 | Already a known farm scar. Applies to the receiver only — see §5. |

**The transmitter does not exist.** There is no `ble.advertise` in `packages/shell/actions.json`
(bridgeVersion 25). That is the whole gap.

---

## 2. The payload budget — legacy advertising

Arithmetic from `framework/java/android/bluetooth/le/BluetoothLeAdvertiser.java`, which I read directly:

```
MAX_LEGACY_ADVERTISING_DATA_BYTES = 31        line 63
OVERHEAD_BYTES_PER_FIELD          = 2         line 65   (AD Length + AD Type)
FLAGS_FIELD_BYTES                 = 3         line 67
MANUFACTURER_SPECIFIC_DATA_LENGTH = 2         line 68   (16-bit company ID)
```

**The decisive line is 152:**

```java
boolean hasFlags = isConnectable && isDiscoverable;
```

A **non-connectable** advertisement is charged **no 3-byte flags structure**. That is what makes this
viable at all.

```
  31   legacy limit
-  1   AD Length
-  1   AD Type (0xFF, manufacturer specific)
-  2   company identifier
= 27   bytes of application payload
```

Same 27 for service data under a 16-bit UUID (`OVERHEAD_BYTES_PER_FIELD + uuidLen`, line 709). A private
**128-bit** UUID collapses it to 13 — not usable.

Connectable + discoverable costs the flags: **24 bytes**. We want non-connectable anyway, so nobody can
open a GATT session against the phone.

**Header, and what is left for text.** Identity cannot live in the MAC (§6), so it lives in the payload.
Codex proposed 8 bytes; I tightened it to 6 — 16M sender ids is ample for "phones within 30 metres", and a
1-byte message counter is enough for a short TTL:

| Bytes | Field |
|---:|---|
| 1 | magic (4b) + version (4b) |
| 3 | sender id, random per install |
| 1 | message id, wrapping counter |
| 1 | fragment index (4b) + fragment count − 1 (4b) → 1–16 fragments |

```
27 − 6 = 21 bytes of UTF-8 text per advertisement
```

- Latin/ASCII: **21 characters**
- Ukrainian Cyrillic (2 bytes/char in UTF-8): **10 characters**

A 16-fragment message is 336 bytes ⇒ **168 Cyrillic characters**, if every fragment arrives.

**Scan response doubles it — at a price.** `startAdvertising(settings, adv, scanResponse, cb)` checks the
two payloads against 31 **separately**, and the scan response is never charged flags
(`totalBytes(scanResponse, false)`, line 154). So +27 bytes. And the receiver really does see them joined:
in `system/stack/btm/btm_ble_gap.cc` the scan response is `cache.Append`-ed to the advertisement (line
2015) and only the merged vector is reported. `ScanRecord.getBytes()` returns that merged vector.

---

## 3. Two traps in the receive path that a spec would not tell you

Both found by reading `btm_ble_gap.cc`, both able to make the app silently not work.

**Trap 1 — legacy advertising is ALWAYS scannable, and Android withholds the report until the scan
response arrives.** `BluetoothLeAdvertiser` line 167 hard-codes `parameters.setScannable(true)` with the
comment *"legacy advertisements we support are always scannable"*. Android's scanner is **active**
(`BTM_BLE_SCAN_MODE_ACTI`, lines 1547/1549 — there is no public switch to passive), and:

```cpp
if (is_active_scan && is_scannable && !is_scan_resp) {
    // If we didn't receive scan response yet, don't report the device.
    return;                                            // line 2026–2030
}
```

So **every** one of our advertisements requires a successful scan-request/scan-response round trip before
the receiving app hears about it at all — even if we put nothing in the scan response. This is a real
extra loss term, not a theoretical one, and it argues for *using* the scan response since we are paying
for it regardless.

**Trap 2 — trailing zero bytes are stripped.** Line 2008, for legacy only:

```cpp
AdvertiseDataParser::RemoveTrailingZeros(tmp);
```

A binary payload ending in `0x00` arrives shorter than it was sent. **The header must carry an explicit
length, or the encoding must never end in a zero byte.** Codex did not find this one.

And line 2032: `AdvertiseDataParser::IsValid(adv_data)` — a malformed AD structure is dropped whole. The
payload must be a well-formed AD structure, which the framework builder gives us for free as long as we go
through `AdvertiseData.Builder`.

---

## 4. Extended advertising — bigger, and it does NOT break `hive`

`ScanSettings.Builder` defaults, read in `framework/java/android/bluetooth/le/ScanSettings.java`:

```
mScanMode     = SCAN_MODE_LOW_POWER          line 302
mCallbackType = CALLBACK_TYPE_ALL_MATCHES    line 303
mReportDelayMillis = 0                       line 305
mLegacy       = true                         line 308
mPhy          = PHY_LE_1M                    line 309
```

So our scanner is **legacy-only today**, confirmed. But the doc on line 440 is the part that matters:

> *Set whether **only** legacy advertisements should be returned in scan results. […] This is true by
> default for compatibility with older apps.*

`setLegacy(false)` therefore means "do not restrict to legacy" — it **widens** the result set, it does not
swap it. **`hive` keeps seeing everything it sees today.** I had assumed the opposite; the doc says
otherwise, and this removes the main blast-radius objection to touching the shared scanner.

Caveat on the same page (line 452): `setPhy()` applies only when legacy is false, and *"selecting an
unsupported phy will result in failure to start scan"* — so `PHY_LE_ALL_SUPPORTED` must be guarded by
`isLeCodedPhySupported()`, or we lose the scan entirely.

Ceiling: `getLeMaximumAdvertisingDataLength()` is controller-dependent; the HCI range tops out at 1650.
**UNKNOWN: what the S25 actually returns, and how many concurrent advertising sets it allows.** No public
Samsung spec answers this and `isMultipleAdvertisementSupported()` returns a boolean, not a count. It has
to be probed on the device — which needs Java, which means it cannot be measured before the first shell
change. Extended also drops API 24–25 and any controller without BLE 5.

---

## 5. Rate, loss, and repetition

Advertising intervals, `BluetoothLeAdvertiser` lines 169–175 (verbatim, with AOSP's own comments):

| Mode | units | interval |
|---|---:|---:|
| `ADVERTISE_MODE_LOW_POWER` | 1600 | 1000 ms |
| `ADVERTISE_MODE_BALANCED` | 400 | 250 ms |
| `ADVERTISE_MODE_LOW_LATENCY` | 160 | 100 ms |

Scan duty cycle, `android/app/src/com/android/bluetooth/le_scan/ScanManager.java` lines 85–97:

| Scan mode | window | interval | duty |
|---|---:|---:|---:|
| `LOW_POWER` | 140 | 1400 | 10% |
| `BALANCED` | 183 | 730 | 25% |
| `LOW_LATENCY` | 100 | 100 | **100%** |
| screen-off low power | 512 | 10240 | 5% |
| screen-off balanced | 183 | 730 | 25% |

**This is why the app should be a foreground, screen-on experience.** Our scanner already asks for
`LOW_LATENCY`, so with both phones awake and the app open the receiver is listening continuously and the
duty-cycle loss term disappears; what remains is RF loss and the scan-response round trip of §3. Codex's
repetition table (22–44 repeats) was computed for a 10%-duty scanner and does **not** describe our case.

Honest statement of the channel: **fire and forget, no ack, no ordering, no congestion feedback.**
Reliability can only be repetition + receiver-side dedup. Sensible starting policy, to be tuned on the
device: advertise at 100 ms, cycle fragments round-robin, hold a message alive for 5–10 s, dedup on
(sender id, message id, fragment index), never surface a message until every fragment is present, and
expire incomplete reassembly. Bluetooth Mesh uses exactly this idiom (non-connectable advertising, explicit
source/sequence, TTL, duplicate suppression, 1–8 retransmissions) — cited as an idiom, not as our numbers,
since Mesh assumes near-100% scanning.

**A hold is capped at 180 seconds by the platform.** `AdvertiseSettings.java:71` defines
`LIMITED_ADVERTISING_MAX_MILLIS = 180 * 1000`, and `setTimeout` **throws** above it rather than clamping —
so a longer hold is an exception on the device and nothing in the air. Anything longer must be re-armed by
the page. Found while writing the Java, after the catalogue had already shipped a 300 s ceiling.

**UNKNOWN and unmeasurable from here:** actual packet error rate, collision behaviour in a crowded 2.4 GHz
band, whether One UI throttles or kills long-lived advertising, and whether advertising survives screen-off
in practice. All device work.

---

## 6. Sender identity — the MAC is unusable, and that is settled

- Android rotates the advertiser's private address. AOSP `system/gd/hci/le_address_manager.cc` refreshes on
  a randomized interval documented at **7–15 minutes**, device-overridable.
- `AdvertisingSet.getOwnAddress()` is hidden and requires `BLUETOOTH_PRIVILEGED` — unavailable to us.
- Google's Exposure Notifications shipped around the same constraint (≈15 min rotation, no callback when
  the address changes).

⇒ **Reassembly must key on (payload sender id, message id), never on MAC.** A single message can and will
be observed under two different addresses. This is a correctness requirement, not a nicety.

---

## 7. Permissions

Transmitter, targetSdk 31:

```xml
<uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />
<!-- already present with maxSdkVersion="30": BLUETOOTH, BLUETOOTH_ADMIN -->
```

`BLUETOOTH_ADVERTISE` is a **runtime** permission on Android 12+ (Nearby devices dialog) — declaring it is
not enough, it must be requested, which our `system.grant` already does. On API 24–30 the legacy
install-time `BLUETOOTH`/`BLUETOOTH_ADMIN` cover it.

**Advertising needs no location permission and no location services.** That requirement is scan-side only.
`neverForLocation` is a flag on `BLUETOOTH_SCAN` and does not apply to advertising. So the transmitter is
the *cheap* half permission-wise; the receiver keeps the location scar it already has.

Play Protect note: nothing here is in the blocked-at-sideload class (`READ_SMS` etc.), so the manifest
addition is safe for installability.

---

## 8. Prior art, corrected

- **Bluetooth Mesh** — genuine advertisement-data transport (`ADV_NONCONN_IND`), with segmentation, TTL,
  duplicate suppression and 1–8 retransmissions. The framing idiom to copy.
- **Eddystone** — 16-bit service UUID `0xFEAA`, first service-data byte = 4-bit frame type + reserved bits.
  Copy the "spend a nibble on type/version" idea. No fragmentation.
- **Exposure Notifications** — identity in payload, rotated deliberately, uncorrelated with the MAC.
  Confirms §6. Not a fragmentation precedent.
- **Bitchat — NOT prior art.** Codex checked the source: its advertisements only announce a service; the
  messages go over a **GATT characteristic**, and its fragment planner works on that connected transport.
  I had half-assumed otherwise. Same correction for **Briar** (connection-oriented) and **Nearby/AirDrop**
  (BLE discovers, another medium carries the payload).

**Nobody ships arbitrary text over BLE advertisements.** That is either the reason this is interesting or
the reason it is a bad idea, and the research cannot decide which — the numbers can only say it is
physically possible at ~10 Cyrillic characters per packet.

---

## 9. What this costs to build

1. `ble.advertise` (start/stop) + `ble.state` extended with `extAdv` / `maxAdvLen` / `multiAdv` — catalogue
   first, published before the template build (`rules/shell.md`).
2. Java in `microspec-edge`: `BluetoothLeAdvertiser`, non-connectable, `AdvertiseData.Builder` manufacturer
   data, plus the runtime permission path.
3. Template rebuild in CI (no local Java toolchain), reinstall, hand-verify on the S25 through `apps/os`.
4. Only then the app itself, which is ordinary farm work.

**CI can never test any of this.** The Chromium gate sees the catalogue mock; the radio is verified by hand
on one device. That is the honest price.

## 10. Open questions the device must answer

- `getLeMaximumAdvertisingDataLength()` and `isLeExtendedAdvertisingSupported()` on the S25.
- Concurrent advertising sets.
- Does advertising survive screen-off / backgrounding on One UI, and for how long?
- Real delivery rate at 100 ms advertise + `LOW_LATENCY` scan, phone to phone, and how it decays with
  distance and with a second transmitter present.
- Whether the scan-response round trip (§3) measurably costs delivery versus a non-scannable extended
  advertisement.
