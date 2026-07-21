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

  // Back to the tab: the OS may have suspended the context regardless. Re-resume + re-arm the keep-alive.
  const onVis = () => { if (live && document.visibilityState === "visible") { try { resumeCtx && resumeCtx(); } catch { /* */ } play(); } };
  document.addEventListener("visibilitychange", onVis);

  return {
    supported: !!ms,
    setPlaying(t) { play(); setMeta(t); setState("playing"); },
    setPaused() { setState("paused"); },              // keep el playing → session (and lock-screen ▶) survive
    meta(t) { setMeta(t); },
    release() {
      live = false;
      document.removeEventListener("visibilitychange", onVis);
      pause();
      for (const n of ["play", "pause", "stop", "previoustrack", "nexttrack"]) handler(n, null);
      setState("none");
      try { if (el) { el.removeAttribute("src"); el.load && el.load(); } } catch { /* */ }
      el = null;
    },
  };
}
