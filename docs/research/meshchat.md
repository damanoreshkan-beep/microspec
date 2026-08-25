# meshchat — off-grid chat over raw 802.11 (research + build blueprint)

Phones talk directly over the air with **no internet, no AP, no cell** — the RTL8852AU (ASUS USB-AX56)
injects and sniffs raw 802.11 beacons no-root, and a message rides in a beacon's vendor-specific IE. Second
app on the ax56 capability (after the `ax56` monitor/viewer), and the one that exercises **all** of it: RX,
TX, and their coexistence.

## What is built and PROVEN (browser-free, this session)

The whole "brain" runs and is unit-tested with no hardware — 19 tests, part of the 700-test barrel:

- **`packages/runtime/meshchat.js`** — the transport-agnostic protocol: a 14-byte chunk header
  (magic·ver·flags·room·src·msgId·frag·total), `fragment`/`encodeMessage`, `decodeChunk`, a bounded
  `Deduper` (collapses the carrier's repeats on `src:msgId:frag`) and a `Reassembler` (per `src:msgId`,
  out-of-order, dup-safe). Pure/sync. `MAX_CHUNK_PAYLOAD = 224` is the one wire limit (a 251-byte vendor IE
  minus header).
- **`packages/runtime/meshcrypto.js`** — the envelope: a room passphrase → AES-256-GCM key (PBKDF2, salt from
  the room name so peers derive the same key with no exchange). `seal`→`open` box = `nonce||ct+tag`; a wrong
  key/tamper returns null (dropped, never shown). `fingerprint(pass,room)` is a separate KDF output for a
  visual "same room" check that never exposes the key.
- **`packages/runtime/mesh.js`** — the session: text → seal → fragment → carrier (×`repeats`), and heard
  frames → decode → room-filter → dedup → reassemble → open → a line. Carrier is **injected** (usbsession's
  lesson: a device that never runs Chromium can't be tested behind a global). `loopbackBus()` is the
  in-memory carrier for the gate and the end-to-end test.

Reliability model: broadcast to a room, **no MAC ACK**. The carrier repeats each chunk N times; the receiver
dedups + reassembles. Best-effort — a message lands when every fragment has been heard at least once. App-ACK
+ retransmit is a later layer; the wire already carries `src`/`msgId` for it.

## The transport reality — why native, and what WebUSB can/can't do

A pure browser PWA **cannot** do the real path (measured on the RTL8852AU userspace driver):

- **Modeswitch is a hard WebUSB wall.** The adapter boots as USB Mass-Storage (`0bda:1a2b`); WebUSB is
  forbidden from claiming the mass-storage class, so it can't send the SCSI eject that switches it to wifi
  mode (`0b05:1997`). Native (the shell) does it.
- **Firmware blob** — fwdl needs Realtek's proprietary `.bin`, which the public farm does not redistribute;
  the native shell bundles it.
- **Speed** — bring-up (fwdl + ~11k-op replay + cal) is ~0.5–0.9 s over native libusb and **proven**; over
  WebUSB it would be tens of seconds (every op a JS→browser→OS→device round-trip) and the gapless fwdl burst
  risks the fw timing out (unproven). Steady-state chat (a few frames/s on EP5/EP84) is trivial for either.

So the real carrier is **native `usb.batch`** (the shell bridge the farm exposes to a PWA): the shell does
modeswitch + fwdl + monitor bring-up once, then N farm PWAs drive the adapter through it. The chat PWA is
thin and the protocol is transport-agnostic — `loopbackBus()` today, `usb.batch` carrier tomorrow, no change
above the carrier seam.

## Still to build (needs the adapter + shell)

- **The wifi carrier** — wrap a chunk into a beacon (fixed body + vendor IE, OUI + our sub-type + chunk) with
  a `[txdesc][frame]` prefix, radiate via `usb.batch` bulk-OUT EP5; and on RX, pull our vendor IE out of the
  beacons the RX frame parser isolates. Needs the **txdesc + 802.11 frame builders ported** from the driver
  (`rtl8852au-userspace` `tool/ax56tx.ts`) — not yet in the farm.
- **The pivotal hardware test: TX+RX in ONE bring-up.** Today they are two chip states (RX = monitor tail, no
  cal; TX = tail + live cal, and the TX run's tail-RX was CSI-only). A chat needs both without a ~20-40 s
  re-bringup. Test cold-chip + monitor tail + live cal, then inject AND read in one run: if both work the
  carrier is full/half-duplex-instant; if not, the protocol already tolerates half-duplex (listen→backoff→send).

## The app (to author)

A `type:"tool"` fit screen on the /_rt kit: a message list + composer, a room/passphrase join (+ the
fingerprint), a peers/connection island, and an honest hardware state (mock demo when no adapter). Locale
`en`+`uk`. Gate against `loopbackBus()` with a seeded conversation (isGate||MOCK), a `[data-live]` marker on a
message line, and the routing-back invariant on the join sheet.

## Honesty gates specific to this app

- **The air is a broadcast in the clear** — every message is encrypted (FLAG_ENCRYPTED); an unencrypted mode
  is not offered. The room's security IS the passphrase/key, never the 16-bit roomId.
- Never imply the PWA drives the radio itself — the native shell does; the mock is labelled, and a real
  carrier replaces it.
- **No attack tooling** — this injects our own broadcast beacons to a room; no deauth/spoofing (the driver
  repo's standing constraint).

## Files

```
packages/runtime/meshchat.js  + tests/meshchat_test.js    protocol: chunk codec, dedup, reassembly   (11)
packages/runtime/meshcrypto.js+ tests/meshcrypto_test.js  envelope: AES-GCM group key, fingerprint    (5)
packages/runtime/mesh.js      + tests/mesh_test.js        session + loopback carrier (end-to-end)      (3)
apps/<id>/{spec.json, view.js, i18n/{en,uk}.json, brand.*, e2e.spec.mjs}   the PWA (to author)
(hardware, later) the wifi carrier: beacon+vendor-IE+txdesc build over usb.batch; parseRx vendor-IE extract
```

## Validation log

- Protocol round-trip, out-of-order + dup reassembly, dedup eviction — `meshchat_test.js` (the blesend-style
  "what we emit must decode back to what we intended" gate).
- Encryption: re-derived-key round-trip, wrong-key/room drop, tamper drop, nonce freshness — `meshcrypto_test.js`.
- End-to-end over a shared bus: two peers exchange, a wrong-key third hears nothing, multi-fragment survives
  the 3× repeat — `mesh_test.js`. Full barrel: 700 passed.
- Transport constraints (modeswitch wall, blob, speed) — the `rtl8852au-userspace` driver `hwdriver.c` runs.
