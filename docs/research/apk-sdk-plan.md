# Anubis Shell SDK — full work plan

Plan pass, 2026-08-03. Builds on [`background-execution.md`](./background-execution.md) (what can run
when the app is closed) and [`system-bridge.md`](./system-bridge.md) (the thin-proxy principle).

**Goal:** a reusable SDK layer between the web and a real Android app, with a ready-made action
catalogue, so that turning any farm PWA into a system-capable APK is routine rather than a project.

**Non-goal:** a framework. No UI in Java, no state in Java, no per-app Android code. If an app needs
Java written for it, the SDK has failed.

**Status: nothing is implemented.** This document is the agreed shape and the work list.

---

## 1. "All the permissions an APK can get" — the honest answer

Not all. Android permissions fall into four classes and only two of them are ours.

| Class | How it is granted | Ours? |
|---|---|---|
| **Normal** (`INTERNET`, `VIBRATE`, `WAKE_LOCK`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE`, `CHANGE_WIFI_STATE`, `NFC`, `FOREGROUND_SERVICE`, `RECEIVE_BOOT_COMPLETED`, `BLUETOOTH`, `BLUETOOTH_ADMIN`) | at install, silently | **yes — declare all of them** |
| **Dangerous / runtime** (location, camera, mic, phone state, contacts, SMS, calendar, storage, body sensors, activity recognition) | runtime dialog, per permission | **yes — declare, request lazily** |
| **Special access** (overlay `SYSTEM_ALERT_WINDOW`, `WRITE_SETTINGS`, `MANAGE_EXTERNAL_STORAGE`, usage stats, battery-optimisation exemption, notification listener, accessibility) | user must walk into a Settings screen | **case by case — mostly no** (§1.2) |
| **Signature / system** (`READ_LOGS`, `CAPTURE_AUDIO_OUTPUT`, `INSTALL_PACKAGES`, …) | platform-signed or system apps only | **never** — unreachable for a sideloaded APK |

One real advantage of never publishing: **Play's policy restrictions do not apply to us.** SMS,
call log, `QUERY_ALL_PACKAGES`, exact alarms — all of these are gated by *Play review*, not by the OS.
We sideload, so the OS rules are the only rules.

### 1.1 DECIDED: the widest OS-legal set

Since the manifest is baked at build time (binary, unpatchable per request — `system-bridge.md` §3),
the `full` template declares **every normal and every dangerous permission the OS allows a sideloaded
app to hold** — including ones no capability uses yet (SMS, contacts, calendar, call log, body
sensors, activity recognition). Rationale: a template rebuild is a CI round *and* a reinstall on every
device that already has the shell, so the manifest is the one thing we do not want to iterate on.
Runtime requests stay lazy, so the user only ever sees a dialog for what an app actually uses.

Two consequences, accepted with eyes open:

- **Settings → App info → Permissions shows the full declared list**, including the unused ones. It
  will read as a very hungry app. This is the owner's call, taken deliberately.
- **Play Protect scans sideloads too**, and a broad dangerous set on an unknown-signer APK raises the
  warning's tone.

Because the declared surface is now maximal, the **runtime** gates carry all the weight, and none of
them is optional: `lite` (web parity, no bridge — §4.3) stays the default for arbitrary URLs, and the
bridge stays origin-locked, https-only and capability-listed (`system-bridge.md` §3). A maximal
manifest behind an unlocked bridge would be a remote-controlled spyware kit with our signature on it.

### 1.2 Deliberately excluded

`SYSTEM_ALERT_WINDOW` (overlay), accessibility service, notification listener, usage stats,
`MANAGE_EXTERNAL_STORAGE`. All four are the permissions malware asks for; all four are separately
gated behind Settings walks; none is needed by anything the farm does. Excluding them keeps the shell
explainable in one sentence. **Battery-optimisation exemption** is the one borderline case — it is the
difference between an alarm that fires and one Samsung silently drops — so it stays on the list as an
*optional, on-request* Settings hop, never asked for at install.

### 1.3 targetSdk 29 stays

Verified in `background-execution.md`: no `foregroundServiceType`, no runtime `POST_NOTIFICATIONS`,
legacy `BLUETOOTH`/`BLUETOOTH_ADMIN` instead of the 31+ split, sideload floor is API 24 through
Android 16. Every one of those is a permission-surface simplification. **UNKNOWN and to be measured on
the S25:** legacy-target background location on Android 15/16, exact-alarm behaviour for a legacy
target, and whether One UI's app-sleep kills our foreground service.

---

## 2. The SDK architecture

### 2.1 One channel, two forms

A single `@JavascriptInterface` — the only auditable entry point — carrying JSON:

- **`call`** — request/response, correlated by id, resolved as a Promise. `notify`, `alarm.set`,
  `wifi.scan`, `cell.info`.
- **`subscribe`** — a stream: the native side pushes events until cancelled. BLE advertisements, cell
  info updates, scan results, service state. Without this, every streaming capability degenerates
  into polling across the bridge.

Native replies via `evaluateJavascript` → a `CustomEvent` on `window`. The WebView thread never
blocks; the web side never sees any of it.

### 2.2 The action catalogue is the SDK

One declarative catalogue (`packages/shell/actions.json` or `.js`) is the **single source of truth**.
Each action declares:

    id            "wifi.scan"
    capability    "wifi"                  // bridge flag + permission group
    kind          "call" | "subscribe"
    args/result   JSON Schema (ajv-checked, same discipline as spec.json)
    android       ["ACCESS_WIFI_STATE", "ACCESS_FINE_LOCATION"]
    minBridge     3                        // §2.4
    web           "unsupported" | a browser implementation
    mock          deterministic gate fixture (§5)

From that one file we **generate**: the Java dispatch registry, the JS facade + typed helpers, the
permission enum in `spec.schema.json`, the gate mocks, and the capability table in the docs. Hand-
writing any of those five is how the two sides drift.

### 2.3 The facade

`packages/runtime/shell.js` — `shell.has(cap)`, `shell.call(id, args)`, `shell.subscribe(id, args, cb)`,
`shell.permission(name)`. In a browser: `has()` is false, `call()` rejects `unsupported`, and the
polyfilled `Notification` simply is not installed. Errors are one closed set — `unsupported`,
`denied`, `needsSettings`, `unavailable`, `failed`, `staleBridge` — so app code branches on a value,
never on a message.

### 2.4 Version negotiation is not optional

**The web ships in minutes; an APK ships when the user reinstalls it.** A page will routinely be
newer than the shell it runs in. So: the bridge reports `bridgeVersion`, every action declares
`minBridge`, and `shell.has()` accounts for both. When an app needs an action the installed shell
lacks, it degrades like any missing sensor and the profile surfaces one row: *update the app* → the
existing APK screen. This has to exist from day one; retrofitting it means a flag day.

### 2.5 Permissions unify

`packages/runtime/permissions.js` becomes one registry with two backends: the browser one it has
today, and the bridge one. A row reports the gate that is actually blocking — Android permission,
bridge capability, or bridge version — or it lies to the user (`system-bridge.md` §6).

---

## 3. Action catalogue v1 — the "ready-made actions"

Grouped by capability. This is the surface to build to; anything not here is v2.

| Capability | Actions | Android |
|---|---|---|
| `notify` | `notify.show`, `notify.cancel`, `notify.channel` + `Notification` polyfill | `POST_NOTIFICATIONS` (auto at tSdk 29) |
| `alarm` | `alarm.set`, `alarm.cancel`, `alarm.list` (survives reboot) | `RECEIVE_BOOT_COMPLETED`, exact-alarm |
| `background` | `bg.start`, `bg.stop`, `bg.status` (foreground service + its notification) | `FOREGROUND_SERVICE`, `WAKE_LOCK` |
| `wifi` | `wifi.scan` (call), `wifi.watch` (subscribe), `wifi.info` | `ACCESS_WIFI_STATE`, fine location |
| `cell` | `cell.info`, `cell.watch` | `READ_PHONE_STATE`, fine location |
| `ble` | `ble.scan` (subscribe), `ble.connect`, `ble.gatt` | `BLUETOOTH*`, fine location |
| `usb` | `usb.list`, `usb.open`, `usb.transfer`, `usb.serial` | intent filter |
| `location` | `location.watchBackground` | `ACCESS_BACKGROUND_LOCATION` |
| `files` | `files.pick`, `files.save`, `files.share` (SAF + intents) | none — SAF needs no permission |
| `system` | `system.info`, `system.settings(page)`, `system.battery` | normal |
| `server` | `server.start`, `server.stop`, `server.status` (LAN) | + foreground service |

`notify` + `alarm` are the two that justify the whole exercise: they are the only ones the web cannot
give us at all, at any price, in any browser (Notification Triggers is dead).

---

## 4. Build pipeline

- **Two templates** (`lite`, `full`) built by one GitHub Actions workflow → `template-lite.b64.js`,
  `template-full.b64.js` on the edge. Today's single-template assumption is baked into `edge/apk/*`
  and must be parameterised.
- **`assets/bridge.json`** — origin allowlist, capability list, bridge version. STORED, patched by the
  same Deno path as `start_url.txt`, so the patcher gains a file, not a mechanism.
- **Template smoke test in CI** — after each build: patch targets are STORED, the arsc sentinel is
  intact, `apksigner verify` passes (already our authoritative check), `bridge.json` parses.
### 4.1 DECIDED: per-app package via a padded sentinel — and it is cheap

Every generated APK is `world.anubis.shell` today, so installing one *replaces* another. The decision
is **one package per app**, patched in the binary `AndroidManifest.xml`.

Probed the real template (`edge/apk/template.b64.js`, 7034 bytes) — **VERIFIED**:

- the AXML string pool has `flags = 0x0`, i.e. **UTF-16**, so each string is
  `[uint16 charCount][UTF-16 units][NUL]` — length counted in characters, not bytes;
- `"world.anubis.shell"` is **one** string, index **35** at offset 1286, len 18;
- `"world.anubis.shell.MainActivity"` is a **separate** string, index 36 — the activity name the
  template deliberately fully-qualified. It is a *Java class* in `classes.dex` and must **not** change
  when the applicationId does. So exactly one string is in play.

Therefore **no offset surgery is needed**: give the template an applicationId of fixed length with
room to spare (e.g. `world.anubis.a` + 16 hex chars, derived from the start URL), and overwrite it
**in place**, preserving `charCount`. String offsets, chunk sizes and the file size all stay
byte-identical. This is precisely the sentinel trick already proven for the app name in
`resources.arsc`, so it reuses a mechanism instead of adding one.

### 4.2 DECIDED: the Anubis name goes — `apk.microspec`

The shell is a microspec artifact, not an Anubis one. Renaming is free *now* and expensive later, so
it happens in phase 1, in the same template rebuild as the sentinel.

| | Now | After |
|---|---|---|
| Java package / gradle `namespace` (constant, lives in `classes.dex`) | `world.anubis.shell` | **`apk.microspec`** |
| `applicationId` (the patched sentinel, per app) | `world.anubis.shell` | **`apk.microspec.` + 16 hex**, 30 chars fixed |
| Activity (fully-qualified, never patched) | `world.anubis.shell.MainActivity` | **`apk.microspec.MainActivity`** |

After the rename the applicationId is no longer a prefix of the activity's class — which is exactly
the case the template's fully-qualified activity name was written for; the manifest already carries
that comment. Both templates (`lite` and `full`) get the sentinel: two APKs built from two different
arbitrary URLs must not overwrite each other either.

Files to touch (phase 1, all in `microspec-edge`): `template/app/build.gradle` (namespace +
applicationId), `template/app/src/main/AndroidManifest.xml` (activity name),
`template/app/src/main/java/world/anubis/shell/MainActivity.java` → `java/apk/microspec/`, the
`anubis.world` fixture URLs in `edge/apk/apk.test.js` and `build-test-apk.ts`, then a GitHub Actions
rebuild to regenerate `template.b64.js`. Plus `apps/apkforge/RESEARCH.md` in the farm.

**One-way door for existing installs:** a package rename means an already-installed
`world.anubis.shell` APK is a *different app* to Android. It will not be updated or replaced — it sits
there until removed by hand. Only the owner's own test installs are affected, so the cost is one
manual uninstall, but it is worth doing before any APK is handed to anyone else.

**MEASURED, 2026-08-03 — the arsc question is closed, and the assumption was wrong.**
`resources.arsc` carries the **applicationId**, not the gradle namespace: its `RES_TABLE_PACKAGE`
chunk read back `apk.microspec.a0000000000000000`. The field is a fixed 128×uint16 array, so the same
fixed-length overwrite applies, and the builder now patches **both** containers rather than gambling
on how much Android cares that they disagree. Verified end to end through the public production URL:
habits → `apk.microspec.adf7bd3a0d9afba32`, cam → `apk.microspec.a67487317a1e20723`, each matching the
digest computed independently, and `aapt2 badging` in CI resolves
`launchable-activity: name='apk.microspec.MainActivity'` despite the differing identity — which is
what the fully-qualified activity name was for.

Remaining check (**UNKNOWN**):
- The `full` template must avoid anything else that embeds the applicationId — provider authorities,
  custom permission names. If `files.share` later wants a `FileProvider`, its authority must be
  derived from the same padded sentinel, or per-app packages break the moment two are installed.

---

### 4.3 `lite` is web parity, not INTERNET-only — found while building phase 0

The plan said `lite` declares `INTERNET` and nothing else. Building phase 0 showed that is not a
policy, it is a bug: `onPermissionRequest` and `onGeolocationPermissionsShowPrompt` can only grant what
the manifest already holds, so an INTERNET-only shell denies camera, mic and location **no matter how
the callbacks are written**. Every sensor app in the farm would stay broken inside a `lite` APK.

So `lite` declares exactly what a browser grants any site with the user's consent — `CAMERA`,
`RECORD_AUDIO`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `VIBRATE`, `WAKE_LOCK` — plus
`uses-feature required="false"` for each, so declaring them does not cut the APK off devices lacking
the hardware. **System** capabilities (wifi, cell, ble, usb, alarms, services, server) remain `full`'s
alone. The line between the templates is *web parity vs system power*, not *nothing vs everything*.

### 4.4 Blob downloads need one narrow JS interface

WebView has no blob download path at all: an `<a download href="blob:…">` does **nothing** — no
`DownloadListener` callback, no file, no error. That kills the farm's data exports (habits, wish,
grain) and the APK screen itself, so `lite` carries exactly one `@JavascriptInterface` method,
`__msDownload.save(name, mime, base64)`, and `packages/runtime/apk.js#downloadBlob` uses it when
present. It grants the page nothing a browser does not already grant `<a download>` — no system
access — and in phase 3 it is absorbed into the catalogue as `files.save`.

The web half of this deploys **without a reinstall**: the page inside the shell is loaded from
github.io, so a runtime fix reaches every already-installed APK on the next farm deploy. Worth
remembering when weighing what to put in Java versus in the runtime — Java is the expensive half.

## 5. How any of this gets tested

Blunt truth: **CI runs headless Chromium and will never run our APK.** So:

1. **Catalogue unit tests** — schemas valid; generated Java/JS/enum/docs match the catalogue (a
   generator diff check, the same shape as `counts.mjs --check`).
2. **Preflight rule** — app code touching `window.__ANUBIS*` directly is a failure; everything goes
   through `shell.js`. Same class of rule as the existing chrome-geometry ban.
3. **e2e with a fake bridge** — the gate injects a mock bridge from the catalogue's `mock` field, so
   the *has-bridge* branch of every app is exercised in Chromium. This is what stops "works in the
   browser, dead in the APK" from being invisible.
4. **A device checklist** — the Java side is verified by hand on the S25, once per template change,
   from a written list. It is not automatable and pretending otherwise is how `GATE_BLINDSPOTS.md`
   grows another entry.

---

## 6. `os` — the capability console (a new farm app, built in parallel)

A farm app, `apps/os`, title **microspec OS**: one place where every capability and every permission
is exercised for real. It is three things at once, and that is the point.

**A showcase.** The honest demonstration of what the shell can do — press a row, the thing happens,
the result and the time it took come back. Not a list of features: an instrument panel.

**The device checklist, executable.** §5 concedes that the Java side can only be verified by hand from
a written list. This app *is* that list, in code — after every template rebuild, open it, walk the
tabs, and every capability reports the truth about this device. A paper checklist rots; this one
fails visibly.

**The stress test for the permissions screen.** `os` declares *every* key in the registry, so it is
the one app that renders the §4 screen of `system-bridge.md` at full size. If grouping, the four
states, or the two-level truth per row are wrong, they are wrong here first.

Shape:

- **Capabilities** — the catalogue as a live matrix: bridge present · bridge version vs `minBridge` ·
  Android permission · last probe result. Each row is a button that runs the real action.
- **Probes** — show a notification, set an alarm for +60 s, start and stop the foreground service,
  scan Wi-Fi (count + strongest), read cell info, BLE scan, list USB devices, start the LAN server and
  show its URL as a QR.
- **Report** — bridge version, template, package name, targetSdk, Android build, model — sharable as
  text, so a device oddity travels as facts instead of a description.

Two rules it must obey, or it becomes maintenance debt:

1. **Generated from the catalogue, never hand-listed.** The moment a capability is added to
   `actions.json`, it appears here. A hand-written mirror of the catalogue would drift within a week
   and quietly stop testing whatever was added last.
2. **Populated under the gate.** Running in Chromium every capability is `unsupported`, which is an
   empty screen and a meaningless shot. So the gate fixture is the fake bridge from §5.3: `?mock`
   drives the full matrix with deterministic values, and the real state is a badge in real life.
   This makes `os` the primary consumer of the mock bridge — building them together keeps the mock
   honest.

Timing: **starts with phase 3** (it needs the bridge and `notify`/`alarm` to show anything) and grows
automatically with every later phase. It is not a phase — it is a parallel track that every phase
feeds.

## 7. Skill and docs updates (the "clep PWA→APK fast" part)

- **New `rules/shell.md`** in the microspec skill + one row in SKILL.md's read-on-demand table:
  the thin-proxy principle, the origin lock, `lite` vs `full`, version negotiation, and the rule that
  app code never calls Java directly.
- **`docs/AUTHORING.md`** — a "system capabilities" section: declare in `spec.profile.permissions`,
  call through `shell.js`, degrade honestly, and the `?mock` bridge for local work.
- **`packages/schema/SCHEMA.md` + `spec.schema.json`** — the permission enum grows from 5 to the
  registry; generated from the catalogue.
- **`docs/GATE_BLINDSPOTS.md`** — a new entry: the gate cannot see the APK at all.
- **Memory** — `[[reference_apk_generation]]` already points at these notes; a `[[reference_shell_sdk]]`
  once the catalogue exists.

---

## 8. Phases

| # | Work | Depends on | Size |
|---|---|---|---|
| **0** ✅ | Shell survival kit: `onPermissionRequest`, `onGeolocationPermissionsShowPrompt`, `onShowFileChooser`, `setDownloadListener` + web-parity manifest (§4.3) + blob downloads (§4.4) | — | **done 2026-08-03** — deployed; unverified on device |
| **1** ✅ | Rename to `apk.microspec` (§4.2) + per-app identity in manifest **and** arsc (§4.1) | — | **done 2026-08-03** — verified through the production URL |
| **2** | Catalogue + generator + `shell.js` facade + version negotiation, **zero capabilities** | 1 | medium; the SDK skeleton |
| **3** | `full` template + origin-locked bridge + `notify` + `alarm` | 2 | medium; first real power |
| **4** | Permissions registry + grouped screen + schema enum + uk/en | 3 | medium; whole-farm verify |
| **5** | `background` (foreground service) + `location.watchBackground` | 3 | medium |
| **6** | Radios: `wifi`, `cell`, `ble`, `usb` — the pay-off for gsmscan / lorawatch / hf | 5 | large |
| **7** | `files`, `system` | 3 | small |
| **8** | `server` (LAN) | 5 | large; new product surface |
| **9** | Skill + docs + memory (§7) | 3 | small, but do it *with* 3, not after |
| **∥** | **`os` — the capability console (§6)** | 3 | parallel track: born with 3, extended by every phase after |

Phase 0 is independent and worth doing regardless. Phases 2–3 are the SDK proper; everything after is
adding rows to a catalogue, which is exactly the point — and `os` is how we see that each new row
actually works on the device.

## Decision log

- **Per-app package name**, patched in place in the AXML string pool via a padded sentinel — not a
  single container APK. Closed (owner, 2026-08-03).
- **`world.anubis.shell` → `apk.microspec`** across the template, in the same phase-1 rebuild. Closed
  (owner, 2026-08-03).
- **Widest OS-legal permission set** in the `full` manifest, including capabilities not yet
  implemented; the runtime gates (lite default, origin lock, capability list) carry the safety.
  Closed (owner, 2026-08-03).
- **LAN server stays in scope** as phase 8. Closed (owner, 2026-08-03).
- Signature/system permissions are out of reach; special-access ones (overlay, accessibility,
  notification listener, usage stats, `MANAGE_EXTERNAL_STORAGE`) stay excluded — they are not
  "permissions the OS allows", they are separate Settings walks with their own UX, and none is needed.
  The battery-optimisation hop remains optional and on-request. Closed.
- Play policy does not bind us — we sideload. Closed.
- One catalogue generates Java, JS, schema enum, mocks and docs. Closed.
- Version negotiation exists from day one. Closed.
- The Java side is verified by a written device checklist, never by CI — and that checklist ships as
  the **`os`** app rather than a document. Closed.
- **`apps/os` (microspec OS)** is built in parallel from phase 3, generated from the catalogue, and
  populated under the gate by the mock bridge. Closed (owner, 2026-08-03).
