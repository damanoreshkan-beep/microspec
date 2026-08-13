# Capability proposal: `ble.advertiseRaw` — for owner approval BEFORE touching edge

**Status: DRAFT for sign-off.** Nothing in `microspec-edge` changes until the owner approves this shape.
This is the transmitter half of the BLE proximity-protocol lab (`docs/research/ble-air.md`). It deliberately
removes, for ONE explicitly-scoped capability, the guard that keeps the farm-wide `advertise` locked to
company id `0xFFFF`.

## Why a new capability, not a wider `ble.advertise`

The shipped `ble.advertise` hard-codes company `0xFFFF` *"so a page cannot impersonate a vendor."* That guard
is correct for every normal app and stays. Emitting Continuity / Fast Pair / Swift Pair needs the opposite —
arbitrary company id, service-data structures, several AD structures at once. So it gets its **own capability
name**, listed by exactly one app, gated by a consent screen. The general `advertise` never gains this.

## Catalogue entry (`packages/shell/actions.json`)

```jsonc
{
  "id": "ble.advertiseRaw",
  "capability": "advertise-raw",              // NOT "advertise" — a separate power, separately listed
  "kind": "call",
  "minBridge": 27,                            // wire changes → bridge bump (ble.advertise shipped at 26)
  "android": ["BLUETOOTH_ADVERTISE"],
  "summary": "Assemble and broadcast one or more raw AD structures verbatim — arbitrary company id or 16-bit service UUID. The lab transmitter for studying proximity-pairing protocols on your OWN devices. Gated behind an in-app consent screen; its own capability so no ordinary app can reach it.",
  "args": {
    "type": "object",
    "required": ["structures"],
    "additionalProperties": false,
    "properties": {
      "structures": {
        "type": "array", "minItems": 1, "maxItems": 4,
        "items": {
          "type": "object", "required": ["kind", "id", "data"], "additionalProperties": false,
          "properties": {
            "kind": { "enum": ["mfg", "svc"] },              // manufacturer data (0xFF) | service data (0x16)
            "id":   { "type": "integer", "minimum": 0, "maximum": 65535 },  // company id | 16-bit UUID
            "data": { "type": "string", "pattern": "^([0-9a-f]{2})*$", "maxLength": 58 }
          }
        }
      },
      "name":        { "type": "string", "maxLength": 26 },   // advertised local name (Swift Pair friendly-name path)
      "connectable": { "type": "boolean" },                  // default false; true costs the 3-byte flags
      "ms":          { "type": "integer", "minimum": 0, "maximum": 180000 }  // 0 = until ble.silence; ceiling is the platform's
    }
  },
  "result": {
    "type": "object", "required": ["advertising"], "additionalProperties": false,
    "properties": {
      "advertising": { "type": "boolean" },
      "bytes":       { "type": "integer" },   // total assembled AD bytes, so the page asserts what went out
      "replaced":    { "type": "boolean" }    // a prior advertisement was stopped — one set at a time
    }
  },
  "mock": { "advertising": true, "bytes": 17, "replaced": false }
}
```

- **Stop** reuses the existing `ble.silence` (already capability `advertise`) — or a sibling under
  `advertise-raw`; decide at implementation. No new stop action needed if `ble.silence` stops any set.
- **Budget**: the Java rejects an assembled payload over the 31-byte legacy limit (non-connectable, no flags →
  the same arithmetic as `ble-ether.md` §2) and returns `advertising:false` with the byte count, so the page
  can show why. Extended advertising is out of scope for v1.
- **No company-id allowlist.** The point is to emit Apple/Microsoft/Google/Samsung ids on the owner's bench;
  the safety is the consent gate + capability scoping + own-device framing, not a filter that would defeat the
  purpose.

## Java (`microspec-edge`, on approval)

`AdvertiseData.Builder`: `addManufacturerData(id, bytes)` for `kind:"mfg"`, `addServiceData(ParcelUuid.fromString(0000<id>-0000-1000-8000-00805F9B34FB), bytes)` for `kind:"svc"`, `setIncludeDeviceName` when `name` is set. Non-connectable legacy `AdvertiseSettings`, `BLUETOOTH_ADVERTISE` runtime permission (the path `system.grant` already drives). Then the `rules/shell.md` flow: publish catalogue → `java-gen` → template rebuild (CI) → **hand-verify on the owner's phone with nRF Connect / the second device** → scp + restart. Bridge → 27; update both `Catalogue.java` and hand-written `ShellBridge.java` (the two-places trap from `ble-ether.md` §10).

## Safety posture (already decided, encoded here)

- **First-run consent gate** ("RadioPrime", mirroring `CameraPrime`, `rules/invariants.md` + the camera-priming
  memory): a screen stating *own devices only, controlled space, at your own risk*; the emit path stays inert
  until an explicit acknowledgement, persisted, and re-shown. `ble.advertiseRaw` is never called before it.
- **`advertise-raw` appears in exactly one app's `profile.permissions`.** No other app lists it; the farm-wide
  `advertise`/`ble` are untouched.
- **CI never runs the radio** — the gate mock exercises the has-bridge branch; the emit is verified by hand.

## The decision for the owner

1. Approve the capability name + shape above? (`ble.advertiseRaw`, separate `advertise-raw` capability.)
2. Approve touching `microspec-edge` (edge commit = deploy) once the analyzer UI is in hand?

On "yes" to both, the order is: finish the analyzer app UI → implement + publish the catalogue → edge Java →
device verify → transmitter app behind the gate.
