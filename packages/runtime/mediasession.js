import { shell } from "./shell.js";

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

export function holdAudio({ title = "microspec", artist = "microspec", artwork = null,
  onPlay = null, onPause = null, onPrev = null, onNext = null, resumeCtx = null } = {}) {
  const noop = { supported: false, setPlaying() {}, setPaused() {}, meta() {}, release() {} };
  if (typeof document === "undefined" || typeof Audio === "undefined") return noop;

  let el = null, live = true, curTitle = title;
  const ensureEl = () => { if (!el) { el = new Audio(silentWav()); el.loop = true; el.preload = "auto"; el.volume = 1; } return el; };
  const play = () => { try { const p = ensureEl().play(); if (p && p.catch) p.catch(() => {}); } catch {  } };
  const pause = () => { try { el && el.pause(); } catch {  } };

  const ms = typeof navigator !== "undefined" && "mediaSession" in navigator ? navigator.mediaSession : null;
  const setMeta = (t) => {
    curTitle = t != null ? t : curTitle;
    if (!ms || typeof MediaMetadata === "undefined") return;
    try { ms.metadata = new MediaMetadata({ title: curTitle, artist, album: "microspec", artwork: artwork ? [{ src: artwork, sizes: "512x512", type: "image/png" }] : [] }); } catch {  }
  };
  const handler = (name, fn) => { if (!ms) return; try { ms.setActionHandler(name, fn ? () => { try { fn(); } catch {  } } : null); } catch {  } };
  const setState = (s) => { if (ms) try { ms.playbackState = s; } catch {  } };

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
        .catch(() => {  });
      if (!unsub) {
        unsub = shell.subscribe("media.command", {}, (v) => {
          const fn = v && COMMANDS[v.command]?.();
          if (fn) try { fn(); } catch {  }
        }, () => {  });
      }
      return;
    }
    if (!plainHold) return;
    if (!playingNow) { if (shown) { shown = false; shell.call("bg.stop", {}).catch(() => {}); } return; }
    shown = true;
    shell.call("bg.start", { title: curTitle || "microspec", body: artist }).catch(() => { shown = false; });
  };
  const hide = () => {
    if (unsub) { try { unsub(); } catch {  } unsub = null; }
    if (!shown) return;
    shown = false;
    if (nativeMedia) shell.call("media.hide", {}).catch(() => {});
    else if (plainHold) shell.call("bg.stop", {}).catch(() => {});
  };

  const onVis = () => { if (live && document.visibilityState === "visible") { try { resumeCtx && resumeCtx(); } catch {  } play(); } };
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
      try { ms.setPositionState(duration > 0 ? { duration, position, playbackRate: rate } : {}); } catch {  }
    },
    release() {
      live = false;
      hide();
      document.removeEventListener("visibilitychange", onVis);
      pause();
      for (const n of ["play", "pause", "stop", "previoustrack", "nexttrack"]) handler(n, null);
      setState("none");
      try { if (el) { el.removeAttribute("src"); el.load && el.load(); } } catch {  }
      el = null;
    },
  };
}
