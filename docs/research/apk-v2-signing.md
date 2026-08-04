# APK Signature Scheme v2 — the recipe, in pure Deno

Research pass, 2026-08-04. Every claim below is **VERIFIED** against the primary source
(`source.android.com/docs/security/features/apksigning/v2`) unless labelled otherwise.

## Why

`targetSdk 29` is a ceiling, and it is the reason BLE scanning does not work: Android shows the
**precise/approximate location dialog only to apps targeting 31+**, so a legacy-target app gets
approximate location even when `checkSelfPermission(ACCESS_FINE_LOCATION)` reports granted — and a BLE
scan needs the real thing. It returns nothing, with no error, forever. Wi-Fi and cell survive on the
legacy path; Bluetooth does not.

`targetSdk >= 30` requires a **v2 signature**. Our signer is pure Deno and does v1 (JAR) only, which is
exactly why 29 was chosen at the start. So the blocker is not Bluetooth — it is the signer.

## What v2 is

A block inserted **immediately before the ZIP Central Directory**, leaving the entries and the CD
untouched. Structure, in order:

    uint64  size of block, EXCLUDING this field
    ...     sequence of uint64-length-prefixed ID-value pairs
    uint64  size of block again — same value as the first field
    16 B    magic "APK Sig Block 42"

The v2 signature lives in the pair with ID **`0x7109871a`**.

## What is digested

Four things are protected: the ZIP entries, the Central Directory, the End of Central Directory, and the
signed-data block itself.

Each of the first three is split into **1 MB (2^20 byte) chunks**, and every chunk is digested as:

    SHA-256( 0xa5 || uint32le(chunk length) || chunk bytes )

The final digest over all of them:

    SHA-256( 0x5a || uint32le(number of chunks) || concatenation of the chunk digests )

**The one field that must be rewritten:** when digesting the EOCD, the field holding the *offset of the
Central Directory* must be treated as holding the **offset of the APK Signing Block** instead. That is
the whole trick — the CD moves because the block was inserted before it, and the digest must describe
the file as it will be, not as it was.

Signature algorithm ID for RSASSA-PKCS1-v1_5 with SHA-256: **`0x0103`** — the same key and certificate
we already use for v1 (`edge/apk/{sign,cert,key}.js`), so no new key material and no new trust story.

## How it fits what we already have

We build the ZIP ourselves (`edge/apk/zip.js`, all-STORED) and sign it ourselves, so every offset is
already ours to compute. The work is:

1. build the ZIP as today, without the v1 META-INF;
2. digest entries + CD + EOCD-with-substituted-offset, chunked as above;
3. assemble the signed-data → signer → signature → public key structure, sign with the existing key;
4. wrap it as one ID-value pair in the signing block, insert before the CD, and **rewrite the EOCD's
   CD offset** to point past the inserted block;
5. keep v1 as well — a v1+v2 APK installs everywhere, and v1 alone stops working at targetSdk 30.

`apksigner verify` in CI is already the authoritative check and will report `Verified using v2 scheme:
true` when this is right — the same gate that has caught every signing mistake so far.

## What changes ON TOP of the signer (do not discover these later)

Raising the target is not just a number; each of these is a behaviour we currently rely on:

- **`POST_NOTIFICATIONS` becomes a real runtime permission** (33+). Notifications currently work because
  a legacy target gets them implicitly.
- **Foreground services need a declared TYPE** (34+), and `dataSync`/`location` types carry their own
  timeouts. Our `bg.start` has no type today.
- **Exact alarms need `SCHEDULE_EXACT_ALARM` to be granted**, not merely declared (31+), and the user
  can revoke it.
- **Bluetooth switches to the modern split** — `BLUETOOTH_SCAN`/`CONNECT`/`ADVERTISE` as runtime
  permissions, and the legacy `BLUETOOTH`/`BLUETOOTH_ADMIN` should carry `maxSdkVersion="30"` (which the
  official docs recommend and which I wrongly removed in bridge 9 chasing a symptom — restore it).
- **Storage** moves fully to scoped storage + the media types.

Every one of those is already verified working on the device at bridge 12, so each is a **regression
risk**, and `os` is exactly the instrument that will catch them: run the checklist after the raise and
compare against what we have today.

## Order of work

1. v2 signer in Deno + unit tests that recompute the digests independently (the shape `sign.js` already
   uses for v1).
2. `apksigner verify` in CI must report **both** v1 and v2 true, for both flavours.
3. Only then raise `targetSdk`, one step at a time — 31 first (it is where Bluetooth and precise
   location live), not straight to 36.
4. Re-run the `os` checklist on the device after each step; treat any red row as a blocker, not a note.

**Do not raise the target and write the signer in the same change.** If the APK stops installing, the
two candidate causes must not be entangled.
