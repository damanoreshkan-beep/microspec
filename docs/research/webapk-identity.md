# The installed app's identity is BAKED — why reel would not rotate

Research note, 2026-08-20. Trigger: reel, installed from Samsung Internet on the reference device (S25
Ultra), stays portrait no matter how the phone is turned. Every other app on the home screen behaves the
same way. The web manifest already says `orientation: "any"` and has since 2026-08-19 — so the interesting
question is not "what locks it", it is "why does a shipped manifest not reach an installed app".

## What actually happens on install

Installing a PWA on Android does not create a bookmark. Chrome and Samsung Internet both hand the manifest
to Google Play's WebAPK minting service, which returns a real APK, and a set of manifest fields are written
into its `AndroidManifest.xml` at that moment:

    android:screenOrientation="{{{android_orientation}}}"     ← chromium/chrome/android/webapk/shell_apk/AndroidManifest.xml

VERIFIED — the template is in the Chromium tree at that path (the `{{{…}}}` placeholder is filled at mint
time). The consequence is the whole bug: **`orientation` is enforced by the Android activity, before a byte
of our code runs.** No web API can undo it — `screen.orientation.unlock()` returns the document to its
*default* orientation, which for an installed WebAPK *is* the baked lock, and Chrome on Android only honours
`screen.orientation.lock()` in fullscreen. There is no client-side fix. reel was installed while every
manifest in the farm still said `orientation: "portrait"` (fixed farm-wide in 61c2d03), so the APK on the
phone is portrait-locked and will stay portrait-locked until it is replaced.

The same is true of `name`, `short_name`, `icons`, `background_color`, `display`, `scope`, `shortcuts`,
`start_url`, `theme_color`, `web_share_target` — the full trigger list from web.dev. They are not live
values; they are the app's **identity**, photographed at install.

## How that identity is ever allowed to change

Only one path exists (VERIFIED, web.dev/articles/manifest-updates):

1. the app is **launched**, and the manifest has not been checked in the **last 24 hours**;
2. the browser fetches `manifest.json`, parses it, and diffs it against what it baked;
3. on a difference it requests a new APK from the minting service;
4. the swap lands only when the device is **plugged in, on WiFi, and every window of the PWA is closed**.

In practice: a day or two, up to three. When a check *fails*, the interval backs off to **30 days**.

So the update is rare, throttled, and entirely dependent on step 2 returning the truth.

## Why step 2 was lying — the service worker

The manifest fetch in step 2 is an ordinary subresource request with `destination: "manifest"` (it carries
`Sec-Fetch-Dest: manifest`). It is **not** exempt from service-worker interception. Ours cached it:
`deploy/sw.mjs` puts `./manifest.json` in every app's precache, and `sw-core.js` served every same-origin
hit stale-while-revalidate.

That is a loop with no exit in the bad case. The update check reads the cache, sees the manifest the app was
installed with, concludes nothing changed, and re-arms the 24-hour throttle — while the background
revalidation that would have fixed it is *deliberately skipped* on `onLine === false`, `saveData`, and
`2g`/`slow-2g` (see `offline-first-sw.md`, defect 4's fix). On a phone that is often on a metered or weak
link, **the app's own offline cache pins its own identity indefinitely.** In the good case it still costs a
launch: launch 1 answers stale and refreshes behind the response, launch 2 answers fresh — and launch 2 is
≥24h later.

### The fix (shipped)

`sw-core.js` treats the manifest as the single exception to SWR: network **first**, cache only as the
offline fallback, and the network request is `cache: "no-cache"` so the browser's own HTTP cache cannot
re-introduce the staleness one layer down. A non-200 (a 404 mid-deploy, a captive portal) falls back to the
copy we hold — a broken manifest read is worse than yesterday's one, because the browser treats whatever it
gets as the app's identity. Cost: one request per launch. Gated by two tests in
`packages/runtime/tests/sw_test.js`.

`packages/runtime/tests/manifest_test.js` already forbids any app from locking orientation. The two gates
are complementary: one keeps the *shipped* manifest right, this one keeps the *installed* app able to read
it.

## What the fix does NOT do

It cannot unlock an APK that was already minted with `portrait`. The owner's installed copies must be
replaced. Fastest → slowest:

- **uninstall + reinstall** from the store page — instant, mints from the current manifest;
- force-stop the app in Android settings, relaunch, leave it plugged in on WiFi overnight — the normal
  update path, 1–3 days;
- in Chrome, `chrome://webapks` → *Update* after a force-stop. Samsung Internet exposes no equivalent page.

## Is reel actually usable in landscape? (checked, yes)

Verified with the eye at 832×384 (`vps/eye.sh reel --w 832 --h 384`): the slide is `h-[100dvh]`, the main
`<video>` is `object-contain` over a blurred `object-cover` copy of itself, so a 9:16 clip letterboxes into
a wide viewport with the fill behind it and a 16:9 clip fills the frame. Header, source island and dock all
land inside the 384px height with the dock clearance intact. Nothing to fix in the layout — the app was
adaptive all along; only its container was locked.

## Unverified / not pursued

- Whether Samsung Internet honours the 24h/30d schedule exactly as Chrome documents it. Samsung Internet
  mints WebAPKs through the same Play service and is Chromium-based, so the mechanism is shared, but Samsung
  publishes no schedule of its own. UNKNOWN — it does not change the fix.
- A separate report exists of Samsung Internet *failing to apply* a TWA's orientation lock (the mirror
  image of this bug). Not reproduced here and not relevant: we lock nothing.

## Sources

- <https://web.dev/articles/manifest-updates> — update triggers, the 24h/30d schedule, the plugged-in +
  WiFi + windows-closed condition, `chrome://webapks`.
- <https://github.com/chromium/chromium/blob/main/chrome/android/webapk/shell_apk/AndroidManifest.xml> —
  `android:screenOrientation` baked into the shell APK.
- <https://pwatoapp.com/blog/pwa-screen-orientation-display-modes-android> — orientation read from the web
  manifest into `AndroidManifest.xml` at build/mint time; `any` vs `portrait` semantics.
- <https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/fetch_event> — manifest
  requests reach the worker with `destination: "manifest"`.
