// microspec runtime — background audio + OS media session for SYNTHESISED players (rave, kalimba, ambient…).
//
// The bug this fixes: a pure Web Audio page has no <audio>/<video> element, so the OS does not consider it a
// media player. Leave the browser (switch apps, lock the phone) and Chrome drops the page's audio focus —
// it suspends the AudioContext and intensively throttles the main-thread setInterval scheduler. The beat
// dies a few hundred ms in, and only resumes when you return to the tab. Exactly "it stops in the
// background; I have to re-open it."
//
// The fix a real music app gets for free: hold audio focus. A playing HTMLMediaElement grants the page a
// media session, which (1) keeps the context running + the scheduler un-throttled while hidden and (2) puts
// real transport controls on the lock screen / headset. So `holdAudio` plays a tiny SILENT looping element
// (no sample file — the WAV is synthesised below) purely to own that session, wires MediaSession metadata +
// play/pause/skip handlers, and re-resumes the AudioContext on the way back in as a belt-and-suspenders for
// the OS that suspended it anyway. Fully lazy + guarded: a no-op stub where audio/mediaSession is absent
// (the headless gate, linkedom preflight), so callers never branch. Refs: MDN MediaSession · Chrome
// "Intensive throttling of chained timers" (pages playing audio are exempt).
//
// AND THE APK, which is the half that was missing. browser-compat-data records `api.MediaSession` as
// `webview_android: false` for EVERY member (crbug 40611412), so inside our shell the whole block below is
// a no-op: no metadata, no playbackState, no action handlers, no notification, no lock screen. That is not
// cosmetic — a WebView player with no session is a process Android is free to treat as cached, and a frozen
// process runs no reconnect timer, which is exactly "the stream died while I was on another app and never
// came back". So where a shell is present the session is POLYFILLED over it: `media.show` owns a framework
// MediaSession + a MediaStyle notification carried by a foreground service, `media.command` is the return
// leg of setActionHandler, and an older shell (bridge 3..27, no media capability) still gets the generic
// ongoing notification through bg.start. Callers do not branch — they call holdAudio exactly as before.
import { shell } from "./shell.js";

// A minimal valid silent WAV as a data URI — 16-bit mono PCM, all-zero samples. Kept pure + exported so the
// unit gate can assert the header (RIFF/WAVE/fmt/data, sizes) without a browser. `ms` of true silence loops
// seamlessly; short is fine — it exists only to keep an audio track alive, never to be heard.
export function silentWav(ms = 250, rate = 8000) {
  const frames = Math.max(1, Math.round(rate * ms / 1000)), bps = 2, ch = 1;   // bytes-per-sample, channels
  const dataLen = frames * bps * ch, buf = new ArrayBuffer(44 + dataLen), v = new DataView(buf);
  const str = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + dataLen, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);        // PCM
  v.setUint16(22, ch, true); v.setUint32(24, rate, true); v.setUint32(28, rate * ch * bps, true);
  v.setUint16(32, ch * bps, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, dataLen, true);                             // samples already zero = silence
  const bytes = new Uint8Array(buf); let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = typeof btoa === "function" ? btoa(bin) : "";
  return "data:audio/wav;base64," + b64;
}

// holdAudio({ title, artist, artwork, onPlay, onPause, onPrev, onNext, resumeCtx }) → a handle:
//   .setPlaying(title?)  — own the session, mark it playing (call inside a user gesture, like start())
//   .setPaused()         — mark paused but keep the session so the lock-screen ▶ can resume
//   .meta(title)         — update the now-playing text (e.g. on track change)
//   .release()           — full teardown; a session left behind is a phantom notification nobody connects back
export function holdAudio({ title = "microspec", artist = "microspec", artwork = null,
  onPlay = null, onPause = null, onPrev = null, onNext = null, resumeCtx = null } = {}) {
  const noop = { supported: false, setPlaying() {}, setPaused() {}, meta() {}, release() {} };
  if (typeof document === "undefined" || typeof Audio === "undefined") return noop;

  let el = null, live = true, curTitle = title;
  const ensureEl = () => { if (!el) { el = new Audio(silentWav()); el.loop = true; el.preload = "auto"; el.volume = 1; } return el; };
  const play = () => { try { const p = ensureEl().play(); if (p && p.catch) p.catch(() => {}); } catch { /* autoplay-blocked / unsupported — the app still plays */ } };
  const pause = () => { try { el && el.pause(); } catch { /* */ } };

  const ms = typeof navigator !== "undefined" && "mediaSession" in navigator ? navigator.mediaSession : null;
  const setMeta = (t) => {
    curTitle = t != null ? t : curTitle;
    if (!ms || typeof MediaMetadata === "undefined") return;
    try { ms.metadata = new MediaMetadata({ title: curTitle, artist, album: "microspec", artwork: artwork ? [{ src: artwork, sizes: "512x512", type: "image/png" }] : [] }); } catch { /* */ }
  };
  const handler = (name, fn) => { if (!ms) return; try { ms.setActionHandler(name, fn ? () => { try { fn(); } catch { /* */ } } : null); } catch { /* action unsupported on this browser */ } };
  const setState = (s) => { if (ms) try { ms.playbackState = s; } catch { /* */ } };

  handler("play", onPlay); handler("pause", onPause); handler("stop", onPause);
  handler("previoustrack", onPrev); handler("nexttrack", onNext);

  // ---- the APK arm: the same session, built out of shell actions because the web API is absent there ----
  // `native` = the real thing (framework MediaSession + MediaStyle notification, transport that works).
  // `plain` = every shell older than the media capability: an ongoing notification with no buttons, which
  // still buys the foreground service, which is what stops the process being frozen mid-stream.
  const nativeMedia = (() => { try { return shell.present && shell.has("media.show"); } catch { return false; } })();
  const plainHold = (() => { try { return !nativeMedia && shell.present && shell.has("bg.start"); } catch { return false; } })();
  let shown = false, isPlaying = false, unsub = null;
  const COMMANDS = { play: () => onPlay, pause: () => onPause, stop: () => onPause, next: () => onNext, prev: () => onPrev };
  const show = (playingNow) => {
    isPlaying = !!playingNow;
    if (nativeMedia) {
      // Re-calling REPLACES the same notification, so this is both "post" and "update" — the title tracks
      // the track and the button follows playbackState without a second action.
      // `shown` flips on the ASK, not on the reply: release() can land before a real bridge answers, and a
      // hide that was skipped leaves a notification whose buttons reach a page that is no longer playing.
      shown = true;
      shell.call("media.show", { title: curTitle || "microspec", artist, album: "microspec", playing: !!playingNow, prev: !!onPrev, next: !!onNext })
        .catch(() => { /* denied/failed: the page plays on, exactly as in a browser */ });
      if (!unsub) {
        unsub = shell.subscribe("media.command", {}, (v) => {
          const fn = v && COMMANDS[v.command]?.();
          if (fn) try { fn(); } catch { /* the app's problem, not ours */ }
        }, () => { /* a stream that cannot start leaves the notification's buttons inert; nothing to undo */ });
      }
      return;
    }
    if (!plainHold) return;
    // The generic service: while it is up the process stays warm. Paused is not a reason to hold one.
    if (!playingNow) { if (shown) { shown = false; shell.call("bg.stop", {}).catch(() => {}); } return; }
    shown = true;
    shell.call("bg.start", { title: curTitle || "microspec", body: artist }).catch(() => { shown = false; });
  };
  const hide = () => {
    if (unsub) { try { unsub(); } catch { /* */ } unsub = null; }
    if (!shown) return;
    shown = false;
    if (nativeMedia) shell.call("media.hide", {}).catch(() => {});
    else if (plainHold) shell.call("bg.stop", {}).catch(() => {});
  };

  // Back to the tab: the OS may have suspended the context regardless. Re-resume + re-arm the keep-alive.
  const onVis = () => { if (live && document.visibilityState === "visible") { try { resumeCtx && resumeCtx(); } catch { /* */ } play(); } };
  document.addEventListener("visibilitychange", onVis);

  return {
    supported: !!ms || nativeMedia,
    setPlaying(t) { play(); setMeta(t); setState("playing"); show(true); },
    setPaused() { setState("paused"); show(false); },  // keep el playing → session (and lock-screen ▶) survive
    meta(t) { setMeta(t); if (shown) show(isPlaying); },
    // Feed the OS the real timeline so the lock screen shows a progress bar and a scrubber instead of a
    // dead 0:00 — and so pressing skip there lands on a session that knows where it is. Silently ignored
    // where unsupported; a bad duration/position throws in some browsers, hence the guard.
    position(durationMs, positionMs, rate = 1) {
      if (!ms || typeof ms.setPositionState !== "function") return;
      const duration = Math.max(0, (durationMs || 0) / 1000);
      const position = Math.min(Math.max(0, (positionMs || 0) / 1000), duration);
      try { ms.setPositionState(duration > 0 ? { duration, position, playbackRate: rate } : {}); } catch { /* */ }
    },
    release() {
      live = false;
      hide();
      document.removeEventListener("visibilitychange", onVis);
      pause();
      for (const n of ["play", "pause", "stop", "previoustrack", "nexttrack"]) handler(n, null);
      setState("none");
      try { if (el) { el.removeAttribute("src"); el.load && el.load(); } } catch { /* */ }
      el = null;
    },
  };
}
