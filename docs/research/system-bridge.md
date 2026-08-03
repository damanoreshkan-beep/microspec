# The system bridge — a thin APK that proxies Android to the web

Design pass, 2026-08-03. Companion to [`background-execution.md`](./background-execution.md), which
establishes *what can run when the app is closed*. This one answers the follow-up: **the shell stays a
near-trivial proxy to Android, and the farm gets full system power through it.**

Nothing here is built yet. This is the shape to build to.

---

## 1. The principle

> The shell has **no UI, no product logic and no state**. It owns exactly one job: hand the page the
> Android capabilities the page cannot reach itself. Everything else — screens, storage, scheduling
> rules, i18n, taste — stays in the web app, where our whole toolchain already lives.

Two consequences that decide the entire design:

**(a) The bridge mirrors the WEB API, it does not invent a parallel world.** Where a standard API
exists, the shell polyfills *that* (`Notification`, `showNotification`); where the web has nothing
(Wi-Fi scan, cell info, alarms, a listening socket) the runtime exposes one small facade
(`packages/runtime/shell.js`) whose browser implementation reports `unsupported`. **App code never
knows Java exists.** An app written for Chrome runs unchanged inside the shell and simply gains
capabilities — which is also the only way our gates (which run headless Chromium, never the APK) stay
meaningful.

**(b) The shell must not grow dependencies.** Notifications, alarms, Bluetooth, Wi-Fi, telephony,
foreground services and sockets are **all framework classes** — `NotificationManager`,
`AlarmManager`, `BluetoothAdapter`, `WifiManager`, `TelephonyManager`, `ServerSocket`. Zero AndroidX,
zero Firebase, zero Play Services. The APK stays in the same size class it is today. The moment we
reach for FCM or TWA we lose that, which is a strong argument for **not** doing either
(`background-execution.md` §2).

---

## 2. What the shell must fix before it adds anything

Reading `microspec-edge/template/.../MainActivity.java`: the shell installs a bare
`new WebChromeClient()` and no download listener. A stock WebView **denies by default** everything
that goes through those callbacks, so today, inside an apkforge APK:

| Feature | Status in our shell | Missing hook |
|---|---|---|
| Camera / microphone (`getUserMedia`) | **denied silently** | `onPermissionRequest` |
| Geolocation | **denied silently** | `onGeolocationPermissionsShowPrompt` |
| `<input type="file">` | **dead** (no picker) | `onShowFileChooser` |
| Downloads (incl. our own APK row) | **dead** | `setDownloadListener` |
| Notifications | impossible in WebView at all | — native only |

**VERIFIED** by code read + MDN compat (`api.Notification.webview_android: false`).
**Not yet measured on device** — worth one manual pass on the S25 before we design around it.

This matters more than the exotic capabilities: every sensor app in the farm (cam, pipette, retouch,
compass, iss, weather…) is **already broken** in a generated APK, and nobody noticed because the gates
only ever see Chromium. Four callbacks, maybe 60 lines, fix the whole class. **That is phase 0.**

---

## 3. Two shells, not one

The Android manifest is binary and our patcher only rewrites `assets/`, `res/*.png` and a sentinel in
`resources.arsc` — so **the permission set cannot be patched per request**. It must be baked at build
time. Therefore: **two templates, both built once by GitHub Actions, both embedded on the edge.**

| | `lite` (default) | `full` |
|---|---|---|
| Permissions | **web parity** — `INTERNET`, camera, mic, location, vibrate, wake lock | the registry in §4 |
| Bridge | absent | present, origin-locked |
| Used for | apkforge on an **arbitrary URL** | farm apps, our own origins |

**Why the split is not optional:** apkforge turns *any* URL into an APK. A `@JavascriptInterface` that
exposes Wi-Fi scans and notifications to whatever page happens to load is a hole with our signature on
it. So the bridge is gated three ways, all read from `assets/bridge.json` (STORED, patched by the same
Deno code path as `start_url.txt`):

1. **origin allowlist** — the bridge object is injected only when the document's origin matches, and
   re-checked on every navigation (`onPageStarted`), never once at startup;
2. **https only** — no bridge over cleartext, ever;
3. **explicit capability list** — the page gets exactly the capabilities named in the file, nothing
   else, even if the shell implements more.

Default for a user-supplied URL: `lite`, no bridge, and the APK stays as small and boring as it is
today. The "full power" the farm gets is the farm's, not the whole internet's.

---

## 4. The capability registry

Columns: what the page calls · what Android needs · where it already works. **PWA** = installed PWA in
Chrome Android; **Shell** = our WebView + bridge.

### Already in the browser — the shell must only stop breaking them

| Capability | Web API | Android permission | PWA | Shell |
|---|---|---|---|---|
| Location | `navigator.geolocation` | `ACCESS_FINE_LOCATION` | ✅ | needs the callback (§2) |
| Camera / mic | `getUserMedia` | `CAMERA`, `RECORD_AUDIO` | ✅ | needs the callback (§2) |
| Motion / compass | `DeviceOrientation` | — | ✅ | ✅ |
| Vibration | `navigator.vibrate` | `VIBRATE` | ✅ | ✅ |
| Wake lock | `navigator.wakeLock` | `WAKE_LOCK` | ✅ | ✅ |
| Bluetooth (foreground) | Web Bluetooth | `BLUETOOTH*` | ✅ | bridge |
| USB (foreground) | WebUSB | intent filter | ✅ (hf, hackrf) | bridge |
| NFC (NDEF) | Web NFC | `NFC` | ✅ | bridge |

Note the shape: **for these, the APK is a downgrade unless we do work.** The shell's value is not here.

### Only through the bridge — the web has nothing at all

| Capability | Android | Why the farm wants it |
|---|---|---|
| **Local notifications** | `NotificationManager` + channel | the only way an APK notifies anything |
| **Scheduled alarms** | `AlarmManager` + `BOOT_COMPLETED` | offline reminders with **no server** — impossible on the web since Notification Triggers died |
| **Background work** | foreground service | sensor logging with the screen off (gsmscan, lorawatch, hf), background audio beyond a tab |
| **Wi-Fi scan** | `WifiManager`, `ACCESS_WIFI_STATE` + fine location | no web API exists, in any browser |
| **Cell info / GSM** | `TelephonyManager`, `READ_PHONE_STATE` + fine location | gsmscan stops guessing and reads the real radio |
| **Serial over USB** | USB host API | Web Serial does not exist on Android Chrome |
| **Background location** | `ACCESS_BACKGROUND_LOCATION` | tracks/logs while the screen is off |
| **LAN server** | `ServerSocket` + foreground service | the phone becomes a station other devices open |
| **Native share targets / SAF** | intents | receive files *into* a farm app |

**`targetSdk 29` earns its keep here** (VERIFIED in `background-execution.md`): no
`foregroundServiceType`, no runtime `POST_NOTIFICATIONS`, and the legacy `BLUETOOTH`/`BLUETOOTH_ADMIN`
compat path instead of the 31+ `BLUETOOTH_SCAN/CONNECT` split. The sideload floor stays API 24 through
Android 16, so 29 remains installable.

**UNKNOWN — measure on the S25 before designing on top:** legacy-target Bluetooth scanning on One UI
8; `SCHEDULE_EXACT_ALARM` for a legacy target on Android 15/16; Samsung "sleeping apps" versus a
long-lived foreground service; Wi-Fi scan throttling (4 scans / 2 min foreground since Android 9,
harsher in background — a platform limit no targetSdk avoids).

---

## 5. The bridge surface

One injected object, one facade, both boring:

- **Native side** — a single `@JavascriptInterface` taking `(id, capability, method, jsonArgs)` and
  replying asynchronously with `evaluateJavascript` → a `CustomEvent` on `window`. Correlated by `id`,
  so the shell never blocks the WebView thread and never needs more than one entry point to audit.
- **Web side** — `packages/runtime/shell.js`: `shell.has(cap)`, `shell.call(cap, method, args)`, plus
  polyfills that install `Notification`/`showNotification` when the bridge is present. In a browser
  every `has()` is `false` and every `call()` rejects with `unsupported`. Under the gate, the module
  is inert — no bridge, no branch taken, existing e2e untouched.

Every app then reads one way: *ask the capability, degrade honestly if absent.* Same discipline the
farm already uses for sensors.

---

## 6. The permissions screen at 15+ entries

The screen already exists — `PermissionsScreen` in `render.js:454`, history-backed, opened from a
profile row, driven by `spec.profile.permissions`, backed by a 5-entry registry in
`packages/runtime/permissions.js` with an `enum` mirror in `spec.schema.json:122`. So this is not
"build a screen", it is **"make the existing screen survive a registry 4× larger"**.

What changes:

1. **Groups, not a flat list.** Location & surroundings · Radios & devices · Media · Background work ·
   System. A flat 18-row list is a wall; five short groups is a page.
2. **A fourth state.** Today: `granted` / `denied` / `unsupported`. The registry adds **"needs the
   app"** — real on this device, unreachable in this browser. Honest and useful: it is exactly the
   line that explains what the APK is *for*. Per the no-hand-holding rule this is a badge and nothing
   more — no explanatory paragraph.
3. **Apps still declare a subset.** `profile.permissions` keeps listing only what the app actually
   uses. The registry is the catalogue; the screen is never the catalogue.
4. **Two-level truth per row.** A bridge capability has *two* gates — the Android permission and the
   bridge capability flag. The row must report the one that is actually blocking, or it lies.
5. **Both locales.** Labels live in `permissions.js` (built-in uk/en, deliberately not per-app i18n) —
   every new key needs both, and each new group heading too.

Cost to be honest about: this touches `render.js` and `packages/runtime/*` — the **bootstrap closure**
— so it is a **whole-farm verify**, plus a `spec.schema.json` enum change (ajv) and new SYS keys.

---

## 7. Order of work

| Phase | What | Why first |
|---|---|---|
| **0** | Four WebChromeClient callbacks + download listener in the shell | fixes camera/geo/file/download for *every* app already generated; smallest possible diff |
| **1** | `full` template + origin-locked bridge + `shell.js` facade + notifications & alarms | the two capabilities the web structurally cannot give us |
| **2** | Permissions registry + grouped screen + schema enum + uk/en | the surface that makes 1 usable |
| **3** | Radios: Wi-Fi scan, cell info, background location, foreground service | the pay-off for gsmscan / lorawatch / hf |
| **4** | LAN server | a new product surface, not an improvement to an old one |

Phase 0 stands alone and is worth doing whatever we decide about the rest.

## Decision log

- Shell carries **no** UI and **no** logic; it is a capability proxy. Closed.
- Bridge mirrors web APIs; apps never call Java directly. Closed.
- **Two** baked templates (`lite` / `full`); permissions cannot be patched per request. Closed.
- Bridge is origin-locked + https-only + capability-listed via `assets/bridge.json`; arbitrary-URL
  apkforge gets `lite`. Closed.
- No AndroidX / FCM / TWA — framework classes only, so the APK stays tiny. Closed.
- The permissions **screen** is not new work; the **registry** and its grouping are. Closed.
