# apkforge — research note (the one-shot build recipe)

**Goal.** A new systemic capability: turn any URL (including a micro-PWA's own URL) into a
**sideloadable Android APK, generated on demand** — a WebView shell whose start URL, launcher
icon and app name are patched per request, then **v1 (JAR) signed** — all in **pure Deno** on
`microspec-edge` (no Java, no Android SDK at runtime). Two surfaces: a standalone `apkforge`
farm app (arbitrary URL) and a systemic **"Download APK"** row in every app's profile
("генеруємо самі себе").

Decided architecture (owner): **generate on the edge, pure-Deno, no JVM.** The signing key is a
secret → lives on the private edge, never in the public client. Full identity (icon **and** name).

---

## 0. Why edge / pure-Deno (resource ground truth)

VPS is x86_64, 1 vCPU, **848 MB RAM (~98 MB free)**, **8.7 GB disk (1.5 GB free)**, no swap, already
running feed-proxy + microspec-edge. Adding a JVM + Android SDK (~400–500 MB disk + RAM pressure) is
**risky for the live feed-proxy** — rejected. Pure Deno needs neither: **v1 signing = SHA-256 digests +
RSASSA-PKCS1-v1_5**, both native in Web Crypto; ZIP + arsc surgery are byte work. Permission posture of
the edge is preserved: **no `--allow-read/-write/-run/-ffi`** — the template APK is embedded as a
base64 **module** (imports need no `--allow-read`), the signing key is read from `.env` via
`--allow-env=APK_SIGN_KEY`. No outbound fetch in the signer → fits **core** (secret-holding) cleanly and
rides the **sealed tunnel** unchanged.

## 1. Install policy — the make-or-break, VERIFIED (agent C, AOSP docs)

A **v1-only** APK with **`targetSdk 29` + `minSdk 24`** installs by sideload on **Android 15 / S25 Ultra**:

- **v2/v3 is mandatory only at `targetSdk ≥ 30`** (Android 11 behavior change). At ≤ 29, v1-only installs
  on Android 11–16. `minSdk` is irrelevant to this gate.
- **Min installable targetSdk = 24 on Android 15** (was 23 on Android 14). 29 clears it.
- **WebView at target 29 renders with the device's current Chromium engine** (updatable system component),
  independent of targetSdk.
- SHA-256 v1 digests need **minSdk ≥ 18** → 24 is fine.

**HONEST UX CAVEAT (must tell the user, not our bug):** on the S25 (One UI 7) **Auto Blocker is ON by
default and blocks *all* sideloads regardless of signature.** Two paths for the user: `adb install` over
USB (Auto Blocker doesn't gate adb), or Settings → Security & privacy → **Auto Blocker off** + grant
"install unknown apps". Surface this in the app and the profile sheet.

> Note: v2 would remove the "built for older Android" advisory, but pure-Deno v2 (APK Signing Block +
> chunked digests + exact ZIP offsets) is high-risk to get right one-shot. v1-only is the pragmatic MVP;
> a pure-Deno v2 signer is a future enhancement.

## 2. The template APK (agent D) — build once, patch forever

Minimal **Java** (no Kotlin → no `kotlin-stdlib`; no AndroidX) WebView shell. Lives in
`microspec-edge/template/` (private), built by **GitHub Actions** (`ubuntu-latest` ships the Android
SDK), artifact downloaded and embedded as `edge/apk/template.b64.ts`.

- `targetSdk 29`, `minSdk 24`, `compileSdk 34`. `INTERNET` permission. Framework theme
  `Theme.DeviceDefault.NoActionBar` (no AppCompat).
- One `MainActivity` reads **`assets/start_url.txt`** and loads it in a WebView (JS + DOM storage +
  DB on, wide viewport, zoom off, mixed-content never, `mediaPlaybackRequiresUserGesture(false)`).
  Back navigates WebView history then finishes. `configChanges` keeps the page on rotation.
  External schemes (`mailto:`/`tel:`/`intent:`…) dispatched via `startActivity`.
- **`android:label="@string/app_name"`**, `app_name` = a **fixed-length ASCII sentinel** (patch anchor
  in `resources.arsc`). We use a **40-byte** sentinel (room for real names; see §3).
- **Activity name is FULLY QUALIFIED** (`world.anubis.shell.MainActivity`) so a future package-rename
  patch won't break activity resolution.
- `androidResources { noCompress 'txt','png','arsc' }` → **patch targets are STORED uncompressed**, so
  the Deno patcher never re-deflates them.
- **Plain PNG launcher icon** at `res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}-v4/ic_launcher.png`
  (aapt2 adds the `-v4` qualifier). **No adaptive/anydpi-v26 vector** → icon swap = ZIP-entry replace.
- `minifyEnabled false` + `shrinkResources false` → res paths are **not** shortened to `res/aB.png`.
- Build **unsigned** (no `signingConfig`) → `app-release-unsigned.apk`. It accepts an external v1
  signature because there is no v2/v3 block to invalidate.

**Patch targets (confirm against the first build's `unzip -l`):**
`assets/start_url.txt` · `res/mipmap-*-v4/ic_launcher.png` (×5) · app label inside `resources.arsc`.

## 3. `resources.arsc` label patch — pure Deno, in-place (agent B)

Label string lives once in the arsc **global string pool** (`RES_STRING_POOL_TYPE`). We patch it
**in place on the uncompressed arsc bytes**, then re-emit the entry:

- UTF-8 pool string layout: `[charLen varint][byteLen varint][utf-8 bytes][0x00]`. Both prefixes are
  1 byte while `< 128`.
- **Zero-offset-shift condition:** replacement occupies the **same byte length** as the sentinel. Then no
  offset array / `stringsStart` / chunk `size` changes. The **only** bytes we rewrite: the raw string
  bytes and (if multibyte) the **1-byte `charLen` prefix** (`byteLen` stays = sentinel length).
- Algorithm: `indexOf(sentinel)` → validate prefixes+NUL → encode name UTF-8, **truncate at a codepoint
  boundary to ≤ 40 bytes, right-pad with 0x20 to exactly 40 bytes** → overwrite → recompute `charLen`
  (UTF-16 units) → write that 1 byte. **Cyrillic-safe** (Ukrainian names: ~20 letters fit in 40 bytes;
  the charLen-prefix rewrite is what makes multibyte work).
- Read-back verify (headless): re-parse the pool, assert every chunk `size`/offset byte-identical to
  pre-patch **except** the target string's raw bytes + charLen byte; assert the label decodes to the
  padded name. Unit-tested in the edge repo.

## 3b. Launcher icon — adaptive, both layers patched (2026-08-18)

Before: every APK carried a canvas letter tile in the 5 legacy `ic_launcher.png` buckets. Now the template is
the standard Image Asset Studio layout — `mipmap-anydpi-v26/ic_launcher.xml` = `@color/ic_launcher_bg` +
`@mipmap/ic_launcher_fg` (108dp bitmap buckets), legacy 48dp PNGs kept for API 24–25 — and the builder
patches all three:

- **PNG families are told apart by PIXEL SIZE, never by name.** AGP 8 shortens every res path (`res/9w.png`)
  even with `minifyEnabled false`; the IHDR width is the one invariant. 48/72/96/144/192 ← `icon`,
  108/162/216/324/432 ← `fg` (falls back to `icon`). `edge/apk/build.js`.
- **The background colour is patched in place in `resources.arsc`**, exactly like the label: aapt2 stores a
  `<color>` as `Res_value {size=8,res0=0,type=0x1c,data=u32 LE}`, so the 8 bytes `08 00 00 1C 9B 57 13 FF`
  (`#FF13579B`, values/colors.xml) are the anchor — exactly ONE hit asserted — and the last 4 are overwritten.
  `edge/apk/arsc.js patchIconBg`. CI reads it back with the real parser (`aapt2 dump resources`) and asserts
  badging shows `application-icon-65534:'res/….xml'` (65534 = anydpi).
- **The farm ships its own layers**: `deploy/icons.mjs` writes `icons/icon-fg-432.png` (glyph box 54dp of
  108, transparent — lucide art ≤22/24 stays inside the 66dp safe zone); `/_rt/apk.js fetchAppIcons()` sends
  `{icon: icon-192, fg, bg}` with bg sampled off the maskable tile's corner (= brand.bg). Arbitrary URLs and
  the letter fallback go through `adaptiveFromTile()`: tile at 46% on transparent + its corner colour.

## 4. v1 (JAR) signing — pure Deno + Web Crypto (agent A, verified vs apksig/OpenJDK)

Confirmed: **CERT.RSA signs the raw CERT.SF bytes directly, NO authenticatedAttributes** →
`subtle.sign({name:"RSASSA-PKCS1-v1_5"}, priv, certSfBytes)` *is* `SignerInfo.encryptedDigest`.
Web Crypto generates the RSA-2048 key and `exportKey("spki")`; the **X.509 self-signed cert and the
PKCS#7 SignedData are hand-DER-encoded** (templates in the edge signer). No Java, no OpenSSL.

Byte-exact rules (the silent install-killers):
- **MANIFEST.MF**: main section (`Manifest-Version: 1.0`, `Created-By`, blank). Per entry:
  `Name:` + `SHA-256-Digest: <base64(SHA-256(UNCOMPRESSED entry bytes))>`, blank line after each.
  **CRLF everywhere.** Line-wrap = **72 bytes** (first line 72; continuation = one space + 71), UTF-8.
  **Exclude** directories and `META-INF/{MANIFEST.MF,*.SF,*.RSA,*.DSA,*.EC}`; include everything else.
- **CERT.SF**: `Signature-Version: 1.0`, `Created-By`,
  `SHA-256-Digest-Manifest-Main-Attributes: <b64(SHA-256(main section bytes INCLUDING its trailing
  blank line))>`, `SHA-256-Digest-Manifest: <b64(SHA-256(WHOLE MANIFEST.MF))>`, blank. Per entry:
  `SHA-256-Digest: <b64(SHA-256(that entry's SECTION TEXT in MANIFEST.MF, INCLUDING its trailing blank
  line CRLF))>`. **No `X-Android-APK-Signed`** (that's a v2/v3 marker).
- **CERT.RSA**: DER PKCS#7 SignedData, version 1, digestAlgorithms {sha256}, encapContentInfo
  {data, content ABSENT (detached)}, certificates {our X.509}, one SignerInfo v1 with
  issuerAndSerialNumber (**byte-identical to the cert**), digest sha256, **no authAttrs**, encAlg
  `rsaEncryption`, encryptedDigest = the RSA sig over CERT.SF.
- X.509: TBS (v3, positive serial, sha256WithRSAEncryption, CN issuer=subject, validity in UTCTime
  `…491231235959Z`, SPKI from exportKey), signatureValue = `subtle.sign` over TBS DER.

**Order of operations:** (1) gather uncompressed bytes of all entries → (2) SHA-256 each → (3) build
MANIFEST.MF (record section byte offsets) → (4) CERT.SF → (5) CERT.RSA → (6) write the ZIP with all
entries + the three `META-INF/*` (MANIFEST.MF first, by convention). We **sign last**, so label/icon/URL
patches need no re-sign.

## 5. ZIP rebuild (pure Deno)

- Parse the template ZIP central directory; get each entry's **uncompressed** bytes
  (`DecompressionStream("deflate-raw")` for DEFLATE entries, as-is for STORED). Web Crypto + streams only.
- Modify: arsc bytes (§3, in place), `assets/start_url.txt` (= target URL), the 5 icon PNGs
  (= client-supplied PNG, or leave template icon if none).
- Re-emit **all entries STORED** (no DEFLATE needed), recompute CRC-32 per entry, write local headers +
  central directory + EOCD. **v1-only + targetSdk 29 ⇒ zipalign NOT required for install** (agents A, C).
  (If a strict loader ever complains about a stored `resources.arsc`, DEFLATE just that entry — sidesteps
  the A11 stored-arsc alignment note; not needed at target 29.)
- Content-type of the reply: `application/vnd.android.package-archive`.

## 6. Where the code runs (trust split, sealed tunnel)

- **core** `POST /feed/apk` (rides the sealed tunnel `/feed/f`): body `{url, name, icon?(base64 PNG)}` →
  patch + v1-sign (key from `.env`) → APK bytes returned base64 (`enc:"b64"`,
  `ct: application/vnd.android.package-archive`). **No outbound fetch** → no allowlist host, no VPN gate.
- **open** `GET /feed/appicon?url=` (arbitrary URL, SSRF-guarded like `/feed/videos`): fetch page, pick
  best PNG icon (`apple-touch-icon` / largest `<link rel=icon>`), return raw PNG bytes. Non-PNG/none →
  client falls back to a generated solid-tile PNG. The key-holding core never fetches a user URL — the
  split holds inside the envelope too.
- Client `/_rt/apk.js`: `fetch(VPS_PROXY+"/apk", {method:"POST", body})` (sealedfetch wraps it),
  `res.blob()` → `<a download>`. Skeleton, no spinner. Used by both apkforge and the profile row.

## 7. Verification path (green gate ≠ works)

- **Signature: authoritative.** A GH Actions job in the edge repo runs the Deno builder → **`apksigner
  verify --verbose --print-certs`** on the output (real Android verifier; Java+SDK exist in CI). This is
  the proof the v1 signing is correct.
- **Structural (headless, in `deno task test`):** rebuild a fixture template → sign → re-parse
  MANIFEST/CERT.SF, recompute every digest, `subtle.verify` the RSA sig; re-parse arsc and assert the
  label/URL/icon changed and the pool is internally consistent (§3 read-back).
- **End-to-end (follow-up):** an emulator install+launch smoke (`reactivecircus/android-emulator-runner`,
  API 29) is the only thing that proves the WebView actually opens — add as nightly if the fast checks pass.
- **Real device:** the S25, mindful of Auto Blocker (§1).

## 8. Known limitation (surfaced, not hidden)

All generated APKs share the template **package `world.anubis.shell`**, so installing one **replaces** any
previously-generated one (no side-by-side). Per-package uniqueness = patch the **binary
`AndroidManifest.xml`** `package` string (same string-pool primitive as the label, fixed-length
placeholder) — the template already fully-qualifies the activity name so this won't break resolution — but
it needs **on-device/emulator verification** before enabling. Deferred, documented in the UI.

## Durable techniques to fold into the baseline

- Pure-Deno APK v1 signer + arsc/ZIP surgery → `[[reference_apk_generation]]` memory (numbers above).
- Sealed-tunnel binary reply pattern (`enc:"b64"`) reused for a generated binary download.
