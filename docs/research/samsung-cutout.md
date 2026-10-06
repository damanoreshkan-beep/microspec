# Samsung Internet + display:fullscreen PWA — black band under the camera cutout (S25, One UI 7/8)

## TL;DR
The band is Android **letterboxing the display cutout** because the app window hides the status bar while its `layoutInDisplayCutoutMode` is not SHORT_EDGES/ALWAYS. Nothing in the web manifest can request a cutout mode; the only web-side lever that is wired to it in Chromium (and therefore in Samsung Internet's Chromium 130–143 base) is **`viewport-fit=cover` + the HTML Fullscreen API** (`element.requestFullscreen()`). Our viewport meta and `--ms-safe-top` are correct; `display: "fullscreen"` without `display_override` and without any Fullscreen-API path is the gap.

## 1. Does Samsung Internet honour viewport-fit=cover / safe-area-inset?
- VERIFIED (caniuse data, `css-env-function.json`): `env()` supported in Samsung Internet since **10.1**; Fullscreen API unprefixed since **10.1**; manifest since 4.0. Samsung's own release notes/dev guide never mention cutout, viewport-fit or safe-area (checked `developer.samsung.com/internet/release-note.html` and the Web Development Guide — only "display set to 'standalone' or 'fullscreen'" as PWA-badge criteria).
- VERIFIED (Chromium source, the code SI ships): `DisplayCutoutController.computeDisplayCutoutMode()` at tags 130.0.6723.0 and 138.0.7204.0:
  ```java
  // Never draw under notch if it is not in fullscreen mode.
  if (!mDelegate.getWebContents().isFullscreenForCurrentTab()) return LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT;
  case COVER -> LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
  ```
  `isFullscreenForCurrentTab()` is **HTML Fullscreen API state only**, not `display: fullscreen`. In the same versions `WebappIntentDataProvider` builds display:fullscreen web apps as `new ImmersiveMode(/*sticky*/ false, LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT)` — status bar hidden, cutout mode DEFAULT → Android letterboxes. Chromium only changed this in **July 2026** (commit 8a4da86073 "Android: enable short-edges cutout mode in webapp and activity flows", feature `WebAppShortEdgesCutoutMode`, `FEATURE_DISABLED_BY_DEFAULT` in `chrome_feature_list.cc`; standalone additionally gated by `enable_standalone` param, commit ecb761158a, Sept 2026). SI 28/29/30 = Chromium 130/136/143 (Wikipedia + Threads report) → predates it.
- VERIFIED (Android docs, display-cutout page): "If your app targets SDK 35 and is running on an Android 15 device, LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS is the default behavior, and LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT is interpreted as ALWAYS for non-floating windows." Chromium `default_target_sdk_version` = 35 at tag 136, 36 at 143. INFERRED: this is why **Chrome** on your Android 15/16 S25 goes edge-to-edge even with DEFAULT (whisper-money PR #1080 saw the same black band on Chrome 150–157 emulators: "the WebAPK runs in immersive mode with LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT, so Chrome hides both system bars and letterboxes the camera cutout in black" — older emulator images).
- SI 30.0.0.25 targets **API 36** (APKMirror listing). So the SDK-35 rule should apply to SI's window too; the band therefore means SI's web-app activity (closed source, Samsung's own) either explicitly sets NEVER/letterbox or a One UI per-app override is active. **UNKNOWN** which — diagnose on device (below).
- Known bug reports: Samsung dev forum "PWA not displaying in fullscreen" (Feb 2024, S23 FE, 0 replies): manifest `display: fullscreen`, `matchMedia('(display-mode: standalone)')` → **true** → SI fell back to standalone. Counter-evidence Sept 2026 (sdroxide PR #490, Galaxy Tab S7+, `display_override: ["fullscreen","standalone"]`): "runs true full screen — the status bar is gone, so fullscreen is honoured". INFERRED: newer SI honours fullscreen (at least via `display_override`).

## 2. One UI per-app setting
- VERIFIED (SamMobile 2024; Samsung Community via search snippets): path is **Settings → Display → Camera cutout**, per-app list, option "Hide camera cutout" = forced black strip. "Full screen apps" (force-fullscreen) was **removed in One UI 7**; users on S25 report only "Aspect ratio" + "Camera cutout" remain. There is **no "draw under cutout" option** — the setting can only add the band, not remove a browser-requested letterbox. One UI 7/8 threads also report the camera-cutout setting being flaky/"broken" (S23 One UI 7, S24U One UI 8).
- App name in the list: VERIFIED (web.dev/learn/pwa/installation): WebAPKs are minted "by Google Chrome on devices with GMS, and by Samsung Internet browser, but only on Samsung-manufactured devices" (SI ≥ 9.2). INFERRED: an SI-installed PWA on an S25 is a real APK and appears under **the PWA's own name** (as in Chrome); a plain shortcut would appear under "Samsung Internet". Check both entries are "Show camera cutout"/default.
- No web API maps to `layoutInDisplayCutoutMode`; the only implicit mapping is viewport-fit in HTML fullscreen (§1).

## 3. Chrome WebAPK vs SI install
- Both mint WebAPKs on Galaxy devices (VERIFIED). SI's activity code is proprietary, so the fallback chain is not inspectable; evidence: SI ≤24 reported standalone fallback for `display: fullscreen`; SI ~30 honours `display_override: ["fullscreen", …]`. UNKNOWN whether `display: "fullscreen"` alone is honoured on SI 30; `display_override` is parsed by Chromium ≥89 so SI has it.

## 4. Web-side workarounds — removes vs paints
| Approach | Effect |
|---|---|
| `requestFullscreen({navigationUI:"hide"})` on a user gesture, with `viewport-fit=cover` | **Removes** — the one path in SI's Chromium that sets SHORT_EDGES (VERIFIED in source). Exits on back/navigation; re-arm on next gesture. |
| `display_override: ["fullscreen","standalone"]` | May change SI's display-mode selection (INFERRED from PR #490); harmless for Chrome. Does not by itself change cutout mode. |
| `theme_color`/`background_color` black | **Paints only**; letterbox strip is OS-drawn black anyway — cannot be coloured. |
| `window.visualViewport`, `screen.orientation.lock` | Reporting / orientation only — no effect. |
| Window Controls Overlay | Desktop only — no effect. |
| `display: "standalone"` | Status bar shown → cutout sits inside the status bar → no band, but no fullscreen either (whisper-money's choice). |

## 5. What the farm does (verified in repo)
- `packages/gen/scaffold.mjs:165` — `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` ✔ correct and required (without `cover` even HTML fullscreen returns DEFAULT).
- `scaffold.mjs:225` — manifest `display: "fullscreen"`, **no `display_override`** ✘ gap.
- `packages/runtime/runtime.css:34` — `--ms-safe-top: calc(max(env(safe-area-inset-top), var(--tg-safe-area-inset-top,0px)) + var(--tg-content-safe-area-inset-top,0px))` ✔ correct for SI; while letterboxed `env()` is 0 (cutout is outside the window) so layouts stay consistent either way.
- Nothing in the runtime calls the Fullscreen API ✘ gap. `apple-mobile-web-app-status-bar-style` is iOS-only (harmless).

## Recommendation (ranked by likelihood of actually removing the band)
1. **Diagnose once on the S25 inside the SI-installed app** (remote devtools or an on-screen debug line): `matchMedia('(display-mode: fullscreen)').matches`, `matchMedia('(display-mode: standalone)').matches`, `env(safe-area-inset-top)` via a probe element, `screen.height - visualViewport.height`, and `navigator.userAgent` includes `SamsungBrowser/30`. `standalone === true` ⇒ SI ignored fullscreen (fix 3 first); `fullscreen === true` ⇒ SI's immersive mode with DEFAULT/NEVER (fix 2).
2. **Fullscreen-API arm in `/_rt/`** (Samsung-only, feature-detected): on first `pointerup`/`click`, if `/SamsungBrowser/.test(ua)` and `matchMedia('(display-mode: standalone), (display-mode: fullscreen)')` and `!document.fullscreenElement` → `document.documentElement.requestFullscreen({navigationUI:'hide'}).catch(()=>{})`; re-arm on `fullscreenchange` exit. Highest-probability real fix (source-verified mechanism); no effect on Chrome, which is already edge-to-edge.
3. **Manifest**: add `display_override: ["fullscreen", "standalone"]` in `scaffold.mjs` (keep `display: "fullscreen"`). Cheap; matches the only positive SI fullscreen report.
4. **User-side check**: Settings → Display → Camera cutout → the PWA entry (and "Samsung Internet") must not be "Hide camera cutout". Cannot force-draw; only clears a forced band.
5. Do not: rely on `theme_color`, WCO, visualViewport, or Samsung Internet's own "Hide status bar" browser setting (tab-mode only, and users report content under the hole there).
6. Fallback if 1–3 fail and fullscreen matters more than the strip: nothing further on the web side; file on forum.developer.samsung.com (Samsung Browser category) with the diagnostic values — Samsung's web-app activity is proprietary.

## Sources
- Chromium source (GitHub mirror): `components/browser_ui/display_cutout/.../DisplayCutoutController.java` @130.0.6723.0, @138.0.7204.0, main; `chrome/android/.../webapps/WebappIntentDataProvider.java` @130/@136/main; `chrome/browser/flags/android/chrome_feature_list.cc` (kWebAppShortEdgesCutoutMode DISABLED_BY_DEFAULT); commits 8a4da86073 (2026-07-15), ecb761158a (2026-09-29); `build/config/android/config.gni` @136 (target 35), @143 (target 36).
- https://developer.android.com/develop/ui/views/layout/display-cutout
- https://developer.chrome.com/blog/new-in-chrome-69 (viewport-fit=cover, Chrome 69)
- https://github.com/whisper-money/whisper-money/pull/1080
- https://github.com/dividebysandwich/sdroxide/pull/490
- https://forum.developer.samsung.com/t/pwa-not-displaying-in-fullscreen/29558
- https://developer.samsung.com/browser/android/web-developer-guide.html ; https://developer.samsung.com/internet/release-note.html
- https://web.dev/learn/pwa/installation ; https://medium.com/samsung-internet-dev/new-year-new-samsung-internet-b74f282e4429 (WebAPK in SI 9.2)
- https://en.wikipedia.org/wiki/Samsung_Internet (SI 28→Chromium 130, 29→136); https://www.threads.com/@technicalbazs/post/DUuo3KckypS (SI 30→Chromium 143)
- https://www.apkmirror.com/apk/samsung-electronics-co-ltd/samsung-internet-for-android/samsung-internet-browser-30-0-0-25-release/ (target API 36)
- https://www.sammobile.com/news/hide-camera-cutout-galaxy-phones-with-one-ui/ ; https://r2.community.samsung.com/t5/Galaxy-S/S25-OneUI-7-Full-screen-app-setting-missing/td-p/18289729 ; https://eu.community.samsung.com/t5/galaxy-s23-series/s23-one-ui-7-camera-cutout-previously-fullscreen-apps-is-broken/td-p/12249736 ; https://eu.community.samsung.com/t5/galaxy-s24-series/camera-cut-out-broken-after-one-ui-8-update/td-p/13346846 (Cloudflare-blocked; via search snippets)
- caniuse raw data: https://raw.githubusercontent.com/Fyrd/caniuse/main/features-json/css-env-function.json, fullscreen.json, web-app-manifest.json
