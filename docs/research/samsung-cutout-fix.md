# Samsung Internet — PWA edge-to-edge under camera cutout

## VERDICT (short)
There is **no reliable non-Fullscreen-API web-only fix** that makes an installed PWA draw
under the camera cutout in **Samsung Internet today**. The black band is the same Chromium
WebAPK behaviour Chrome had: in `display:fullscreen` the app runs immersive with
`LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT`, which **letterboxes the cutout in black** and a page
has no lever over it. The real cure is the Chromium `WebAppShortEdgesCutoutMode` feature — off
by default, landed upstream ~July 2026, and **not yet shipping/enabled in Samsung Internet 30**.
So the practical win is a **device-side setting the user toggles**, plus a **manifest change**
that avoids the band by not using fullscreen at all. Details, ranked, below.

---

## RANKED — try in this order

### 1. Web fix: switch `display` from fullscreen → standalone (SHIP THIS) — INFERRED→VERIFIED
The exact scenario is documented in a real PWA fixing this on Chrome WebAPK:
> "`display: fullscreen` caused Android PWAs to display a solid black band at the top … in
> fullscreen mode, Chrome runs the WebAPK in immersive mode with
> `LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT`, which hides system bars and **letterboxes the camera
> cutout in black**." The fix: **revert to `display: standalone`** — "Chrome paints the status
> bar from the page's `<meta name="theme-color">`." "**No web lever: for a WebAPK there is
> nothing a page can do about the … black bar**."
Source: https://github.com/whisper-money/whisper-money/pull/1080
Action: set manifest `"display": "standalone"` (optionally `display_override:["standalone"]`).
The top status bar reclaims that row and is painted from `theme-color`/`color-scheme`, so **no
black band** — but you get a normal status bar, not true edge-to-edge under the hole. This is
the only solid web-side win right now. (The user already has fullscreen → that is the cause.)

### 2. Device-side: One UI 7/8 → Camera cutout per-app toggle (TELL THE USER) — VERIFIED
Settings → Display → **Camera cutout** (One UI 7 renamed the old "Full screen apps"). Search the
app, tap it. "**Hide** draws a black bar across the top row so the punch hole blends into the
bezel"; the other state lets it go edge-to-edge.
Sources: https://www.sammobile.com/news/samsung-one-ui-tip-change-display-aspect-ratio-and-camera-cutout-options/
, https://androxus.com/blogs/customize-camera-cutout-android
Caveats (VERIFIED the feature is flaky on One UI 7): the installed PWA may list under its own
name **or** under "Samsung Internet"; several S23/Fold users report the list/toggle broken or
"Full screen apps" removed in One UI 7.
Sources: https://eu.community.samsung.com/t5/galaxy-s23-series/s23-one-ui-7-camera-cutout-previously-fullscreen-apps-is-broken/td-p/12249736
, https://eu.community.samsung.com/t5/galaxy-z-fold-z-flip/full-screen-apps-feature-removed/td-p/12231822
Action: have the user find the PWA (and "Samsung Internet") in that list and flip the cutout
state; this is the most likely immediate relief on the actual S25.

### 3. Wait for / probe `WebAppShortEdgesCutoutMode` — the real upstream fix — VERIFIED (exists), UNKNOWN (in SI)
Chromium is wiring "short-edges cutout mode" into WebApps/TWAs/immersive Custom Tabs so installed
PWAs finally extend **behind** the status bar while keeping interactive elements out of the
cutout via safe areas. "Edge-to-edge content with the page under the bar requires
**WebAppShortEdgesCutoutMode, which is off by default**." Landed ~15 Jul 2026, no stable date.
Sources: https://tech-ish.com/2026/07/15/google-chrome-for-android-pwa-edge-to-edge/
, https://github.com/whisper-money/whisper-money/pull/1080 (notes it was "deliberately not prepared for")
Samsung Internet 30 = Chromium 143, released **11 May 2026** — i.e. **before** this feature
landed, so it is almost certainly **not present** in SI 30.
Sources: https://en.wikipedia.org/wiki/Samsung_Internet , https://browsercalendar.com/browsers/samsung-internet
Action (probe, UNKNOWN if present): in Samsung Internet open **`internet://flags`** (SI's
chrome://flags equivalent — confirmed to exist) and search "cutout"/"short edges"/"edge".
`internet://debug` also exists. If the flag is absent, it cannot be enabled — the feature simply
isn't in this build.
Source: https://r1.community.samsung.com/t5/others/tips-improve-chrome-performance-by-enable-hidden-experimental/td-p/3697515

### 4. `display_override:["fullscreen", …]` — WON'T fix it — INFERRED
`display_override` only changes which mode is *chosen*; choosing fullscreen is exactly what
triggers the letterbox (item 1). Samsung Internet is also reported to **fall back to standalone**
even when fullscreen is requested, and PWAs "not displaying in fullscreen" is a standing SI
complaint. So forcing fullscreen via override does not get you under-the-cutout; it reintroduces
the band (or is ignored).
Sources: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/display_override
, https://superpwa.com/docs/article/how-to-test-pwa-on-samsung-internet-browser/
, https://forum.developer.samsung.com/t/pwa-not-displaying-in-fullscreen/29558

---

## env() / safe-area — coordinator's angle (answered)

- **(1) Samsung-proprietary env() vars? NONE.** VERIFIED: the only spec'd env vars are
  `safe-area-inset-*`, `safe-area-max-inset-*`, `titlebar-area-*` (desktop Window-Controls-Overlay
  only), and `viewport-segment-*` (foldables). No `env(samsung-*)` exists; firt.dev's PWA quirks
  and Samsung's web dev guide list none. `safe-area-max-inset-*` and `viewport-segment-*` have
  **no browser support in any browser** — so they are not a lever.
  Sources: https://developer.chrome.com/docs/css-ui/edge-to-edge ,
  https://developer.mozilla.org/en-US/docs/Web/CSS/env() ,
  https://developer.samsung.com/browser/android/web-developer-guide.html
- **(2) Does SI report non-zero `safe-area-inset-top` while letterboxing?** INFERRED: **No / zero.**
  In the fullscreen WebAPK letterbox the page is clipped to *inside* the black band, so there is
  no cutout overlapping content and nothing for the inset to describe — the band is drawn by the
  OS/WebAPK shell, not inside the web viewport. `env(safe-area-inset-*)` only becomes non-zero
  once content is actually allowed under the cutout (viewport-fit=cover + edge-to-edge granted),
  which is exactly what SI is refusing. So you **cannot detect the band via env() and pad around
  it** — there is nothing to detect. (Worth a 1-line runtime check on the device to confirm:
  log `getComputedStyle` of `env(safe-area-inset-top)` inside the installed app.)
  Source: https://dev.to/oncode/display-your-pwa-website-fullscreen-4776 (letterbox vs cover)
- **(3) `@media (display-mode: …)` / `interactive-widget` / `@viewport`:** VERIFIED standalone vs
  fullscreen media queries work (Chromium/SI), but they only tell you the mode — they don't grant
  cutout drawing. `interactive-widget=resizes-content` affects the virtual-keyboard viewport, not
  the cutout. `@viewport` is deprecated/unsupported — irrelevant.
  Source: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/display_override
- **(4) env() support / release notes:** `safe-area-inset-*` supported in SI since its Chromium
  base gained it (long ago); no SI release note adds new env vars. VERIFIED none found.

---

## Known-bug status
No dedicated public Samsung bug-tracker entry for "PWA under cutout" found. It maps onto the
Chromium issue (opened Mar 2025) that `WebAppShortEdgesCutoutMode` fixes, and onto standing SI
"PWA not fullscreen / falls back to standalone" forum reports (no official fix stated).
Sources: https://tech-ish.com/2026/07/15/google-chrome-for-android-pwa-edge-to-edge/
, https://forum.developer.samsung.com/t/pwa-not-displaying-in-fullscreen/29558

## Bottom line
Ship **`display:standalone` + good `theme-color`/`color-scheme`** to kill the band cleanly
(no true cutout fill). For actual edge-to-edge now, it's **device-side** (Settings → Display →
Camera cutout) only; a web-only cutover waits on `WebAppShortEdgesCutoutMode` reaching a Samsung
Internet build. Probe `internet://flags` on the S25 to confirm it's absent.
