/* @ts-self-types="./mediasession.d.ts" */
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
import { shell } from "./shell.js";

/**
 * Synthesise a minimal valid silent WAV (16-bit mono PCM, all-zero samples) as a data URI.
 * @param ms duration of silence in milliseconds (default 250)
 * @param rate sample rate in Hz (default 8000)
 * @returns a `data:audio/wav;base64,…` URI (empty payload where `btoa` is absent)
 */
export function silentWav(ms = 250, rate = 8000) {
  const frames = Math.max(1, Math.round(rate * ms / 1000)), bps = 2, ch = 1;
  const dataLen = frames * bps * ch, buf = new ArrayBuffer(44 + dataLen), v = new DataView(buf);
  const str = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + dataLen, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, ch, true); v.setUint32(24, rate, true); v.setUint32(28, rate * ch * bps, true);
  v.setUint16(32, ch * bps, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, dataLen, true);
  const bytes = new Uint8Array(buf); let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = typeof btoa === "function" ? btoa(bin) : "";
  return "data:audio/wav;base64," + b64;
}

/**
 * Hold audio focus for a synthesised player: own an OS media session (or its shell polyfill in the APK),
 * publish now-playing metadata and transport handlers, and re-resume the AudioContext on return to the tab.
 * A no-op stub where audio/mediaSession is absent, so callers never branch.
 * @param options `title`, `artist`, `artwork`, transport callbacks `onPlay`/`onPause`/`onPrev`/`onNext`, and
 *   `resumeCtx` — called on visibility return to resume the app's AudioContext
 * @returns a handle `{ supported, setPlaying, setPaused, meta, position, release }`
 */
export function holdAudio({ title = "microspec", artist = "microspec", artwork = null,
  onPlay = null, onPause = null, onPrev = null, onNext = null, resumeCtx = null } = {}) {
  const noop = { supported: false, setPlaying() {}, setPaused() {}, meta() {}, release() {} };
  if (typeof document === "undefined" || typeof Audio === "undefined") return noop;

  let el = null, live = true, curTitle = title;
  const ensureEl = () => { if (!el) { el = new Audio(silentWav()); el.loop = true; el.preload = "auto"; el.volume = 1; } return el; };
  const play = () => { try { const p = ensureEl().play(); if (p && p.catch) p.catch(() => {}); } catch { } };
  const pause = () => { try { el && el.pause(); } catch { } };

  const ms = typeof navigator !== "undefined" && "mediaSession" in navigator ? navigator.mediaSession : null;
  const setMeta = (t) => {
    curTitle = t != null ? t : curTitle;
    if (!ms || typeof MediaMetadata === "undefined") return;
    try { ms.metadata = new MediaMetadata({ title: curTitle, artist, album: "microspec", artwork: artwork ? [{ src: artwork, sizes: "512x512", type: "image/png" }] : [] }); } catch { }
  };
  const handler = (name, fn) => { if (!ms) return; try { ms.setActionHandler(name, fn ? () => { try { fn(); } catch { } } : null); } catch { } };
  const setState = (s) => { if (ms) try { ms.playbackState = s; } catch { } };

  handler("play", onPlay); handler("pause", onPause); handler("stop", onPause);
  handler("previoustrack", onPrev); handler("nexttrack", onNext);

  const nativeMedia = (() => { try { return shell.present && shell.has("media.show"); } catch { return false; } })();
  const plainHold = (() => { try { return !nativeMedia && shell.present && shell.has("bg.start"); } catch { return false; } })();
  let shown = false, isPlaying = false, unsub = null;
  const COMMANDS = { play: () => onPlay, pause: () => onPause, stop: () => onPause, next: () => onNext, prev: () => onPrev };
  const show = (playingNow) => {
    isPlaying = !!playingNow;
    if (nativeMedia) {
      shown = true;
      shell.call("media.show", { title: curTitle || "microspec", artist, album: "microspec", playing: !!playingNow, prev: !!onPrev, next: !!onNext })
        .catch(() => { });
      if (!unsub) {
        unsub = shell.subscribe("media.command", {}, (v) => {
          const fn = v && COMMANDS[v.command]?.();
          if (fn) try { fn(); } catch { }
        }, () => { });
      }
      return;
    }
    if (!plainHold) return;
    if (!playingNow) { if (shown) { shown = false; shell.call("bg.stop", {}).catch(() => {}); } return; }
    shown = true;
    shell.call("bg.start", { title: curTitle || "microspec", body: artist }).catch(() => { shown = false; });
  };
  const hide = () => {
    if (unsub) { try { unsub(); } catch { } unsub = null; }
    if (!shown) return;
    shown = false;
    if (nativeMedia) shell.call("media.hide", {}).catch(() => {});
    else if (plainHold) shell.call("bg.stop", {}).catch(() => {});
  };

  const onVis = () => { if (live && document.visibilityState === "visible") { try { resumeCtx && resumeCtx(); } catch { } play(); } };
  document.addEventListener("visibilitychange", onVis);

  return {
    supported: !!ms || nativeMedia,
    setPlaying(t) { play(); setMeta(t); setState("playing"); show(true); },
    setPaused() { setState("paused"); show(false); },
    meta(t) { setMeta(t); if (shown) show(isPlaying); },
    position(durationMs, positionMs, rate = 1) {
      if (!ms || typeof ms.setPositionState !== "function") return;
      const duration = Math.max(0, (durationMs || 0) / 1000);
      const position = Math.min(Math.max(0, (positionMs || 0) / 1000), duration);
      try { ms.setPositionState(duration > 0 ? { duration, position, playbackRate: rate } : {}); } catch { }
    },
    release() {
      live = false;
      hide();
      document.removeEventListener("visibilitychange", onVis);
      pause();
      for (const n of ["play", "pause", "stop", "previoustrack", "nexttrack"]) handler(n, null);
      setState("none");
      try { if (el) { el.removeAttribute("src"); el.load && el.load(); } } catch { }
      el = null;
    },
  };
}
