/**
 * # runtime/mediasession.js — hold audio focus so a synthesised player survives the background
 *
 * Background audio + OS media session for SYNTHESISED players (rave, kalimba, ambient…). A pure Web Audio
 * page has no `<audio>`/`<video>` element, so the OS does not consider it a media player: leave the browser
 * and Chrome drops the page's audio focus, suspends the AudioContext and intensively throttles the
 * setInterval scheduler — the beat dies a few hundred ms in. A real music app gets the fix for free by
 * holding audio focus, so `holdAudio` plays a tiny SILENT looping element (the WAV is synthesised by
 * `silentWav`, no sample file) purely to own that session, wires MediaSession metadata and transport
 * handlers, and re-resumes the AudioContext on the way back to the tab. Inside the APK the web API is absent
 * (`api.MediaSession` is `webview_android: false` for every member), so where a shell is present the session
 * is POLYFILLED over the bridge: `media.show` owns a framework MediaSession plus a MediaStyle notification
 * carried by a foreground service, `media.command` is the return leg of setActionHandler, and an older shell
 * still gets the generic ongoing notification through `bg.start`. Callers never branch.
 *
 * ![mediasession.js: a silent looping element holds the session, MediaSession metadata and handlers in a browser, the shell's media.show and media.command in the APK](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-mediasession.svg)
 *
 * ## Import
 * ```js
 * import { holdAudio } from "/_rt/mediasession.js";                        // an app's page: the import map resolves /_rt/
 * import { silentWav, holdAudio } from "@microspec/core/runtime/mediasession.js";   // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link holdAudio} — `holdAudio({ title, artist, artwork, onPlay, onPause, onPrev, onNext, resumeCtx })` → a
 *   handle `{ supported, setPlaying(title?), setPaused(), meta(title), position(durationMs, positionMs, rate?),
 *   release() }`; a no-op stub with `supported: false` where `document` or `Audio` is absent.
 * - {@link silentWav} — `silentWav(ms = 250, rate = 8000)` → a `data:audio/wav;base64,…` URI of 16-bit mono PCM
 *   silence (empty payload where `btoa` is absent). Pure, so the unit gate asserts the RIFF/WAVE header.
 *
 * ## In practice
 * The rave drum machine: one session per play, owned inside the start gesture, released on stop.
 * ```js
 * import { holdAudio } from "/_rt/mediasession.js";   // apps/rave/view.js
 *
 * function start() {
 *   const e = ensure(); if (!e) return;
 *   $playing.set(true);
 *   if (np) np.release();                                            // one live session; a lingering one is a phantom notification
 *   np = holdAudio({ title: npTitle(), artist: "microspec", artwork: artUrl(),
 *     onPlay: () => { if (!$playing.get()) start(); },                // lock-screen / headset transport
 *     onPause: () => stop(), onPrev: () => stepTrack(-1), onNext: () => stepTrack(1),
 *     resumeCtx: () => e.resume() });
 *   np.setPlaying(npTitle());
 * }
 * function stop() {
 *   $playing.set(false);
 *   if (np) { np.release(); np = null; }
 * }
 * ```
 * tide keeps the handle across stations and calls `np.meta(s.name)` on a station change.
 *
 * ## How it fits
 * Imports `shell` from shell.js (`shell.present`, `shell.has("media.show")` / `shell.has("bg.start")`,
 * `shell.call`, `shell.subscribe("media.command")`). No other runtime module imports it; tests/mediasession_test.js
 * asserts the `silentWav` header. 8 farm apps import `holdAudio` — the synthesised and streamed players: rave,
 * handpan, grain, drift, ether, fmradio, tide, v2m.
 *
 * ## Invariants and pitfalls
 * - Call `setPlaying` inside a user gesture (the same tap as `start()`): the silent element's `play()` is
 *   subject to autoplay policy; a blocked play is swallowed and the app still sounds, but owns no session.
 * - `setPaused` marks the session paused but keeps the element playing, so the lock-screen play control can
 *   resume it. `release` is the full teardown — a session left behind is a phantom notification whose
 *   buttons reach a page that is no longer playing. One live session per player: release the old one first.
 * - In the APK `shown` flips on the ASK, not on the reply: `release()` can land before a real bridge answers,
 *   and a skipped hide would leave a notification with inert buttons.
 * - Re-calling `media.show` REPLACES the notification, so `meta(title)` while shown is both post and update.
 * - The generic `bg.start` hold (shells older than the media capability) has no buttons; it exists only to
 *   keep the foreground service up, and paused is not a reason to hold one — `setPaused` stops it.
 * - `resumeCtx` runs on every visibility return: the OS may have suspended the context regardless of the
 *   session, so the app's `ctx.resume()` belongs here, not in a one-off.
 * - `position` feeds `setPositionState` and is silently ignored where unsupported; the headless stub does not
 *   carry it, so a caller that runs in the gate checks `supported` (or `typeof np.position`) before calling.
 * @module
 */
// GENERATED by tools/dts.mjs from packages/runtime/mediasession.js — edit the JSDoc there, never this file.
/**
 * Synthesise a minimal valid silent WAV (16-bit mono PCM, all-zero samples) as a data URI.
 * @param ms duration of silence in milliseconds (default 250)
 * @param rate sample rate in Hz (default 8000)
 * @returns a `data:audio/wav;base64,…` URI (empty payload where `btoa` is absent)
 */
export function silentWav(ms?: number, rate?: number): string;
/**
 * Hold audio focus for a synthesised player: own an OS media session (or its shell polyfill in the APK),
 * publish now-playing metadata and transport handlers, and re-resume the AudioContext on return to the tab.
 * A no-op stub where audio/mediaSession is absent, so callers never branch.
 * @param options `title`, `artist`, `artwork`, transport callbacks `onPlay`/`onPause`/`onPrev`/`onNext`, and
 *   `resumeCtx` — called on visibility return to resume the app's AudioContext
 * @returns a handle `{ supported, setPlaying, setPaused, meta, position, release }`
 */
export function holdAudio({ title, artist, artwork, onPlay, onPause, onPrev, onNext, resumeCtx }?: {
    title?: string;
    artist?: string;
    artwork?: any;
    onPlay?: any;
    onPause?: any;
    onPrev?: any;
    onNext?: any;
    resumeCtx?: any;
}): {
    supported: boolean;
    setPlaying(): void;
    setPaused(): void;
    meta(): void;
    release(): void;
} | {
    supported: any;
    setPlaying(t: any): void;
    setPaused(): void;
    meta(t: any): void;
    position(durationMs: any, positionMs: any, rate?: number): void;
    release(): void;
};
