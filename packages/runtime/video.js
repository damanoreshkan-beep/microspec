// microspec runtime — video playback primitive. Reusable by ANY video app (IPTV, trailers, live cams,
// lectures): the app supplies a title + a stream URL, the runtime owns the hard part — HLS vs progressive,
// native vs hls.js, lazy loading, fatal-error recovery, cleanup, and the a11y/skeleton/error chrome.
//
//   createPlayer(videoEl, url, { onReady, onError })  → { destroy() }   // headless logic
//   <${Player} url=… title=… locale=… onClose=… startAt=… onTime=… />  // full-screen overlay component
import { html } from "htm/preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { media } from "./i18n.js";
import { Pixels } from "./skeleton.js";
import { wakeLock } from "./sensors.js";
import { resumeAt } from "./playback.js";
export { resumeAt, RESUME_MIN, RESUME_TAIL } from "./playback.js";

const HLS = "https://esm.sh/hls.js@1.5.17";
const clearSrc = (v) => { try { v.removeAttribute("src"); v.load(); } catch { /* torn down */ } };

// createPlayer — attach `url` to `video`. Returns a handle whose destroy() fully tears down (so switching
// channels or closing the player never leaks a buffer or a background fetch). onReady fires on first frame /
// manifest; onError on a FATAL failure (dead stream, CORS-blocked segments, unsupported) → the caller shows
// its fallback. Never throws — every failure routes through onError.
export async function createPlayer(video, url, { onReady = () => {}, onError = () => {} } = {}) {
  const progressive = /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(url);
  const nativeHls = video.canPlayType?.("application/vnd.apple.mpegurl");
  if (progressive || nativeHls) {
    video.src = url;
    video.addEventListener("loadeddata", onReady, { once: true });
    video.addEventListener("error", () => onError(), { once: true });
    return { destroy() { clearSrc(video); } };
  }
  try {
    const mod = await import(HLS);
    const Hls = mod.default || mod;
    if (!Hls?.isSupported?.()) { video.src = url; video.addEventListener("error", () => onError(), { once: true }); return { destroy() { clearSrc(video); } }; }
    const hls = new Hls({ maxBufferLength: 12, manifestLoadingTimeOut: 12000, manifestLoadingMaxRetry: 1 });
    hls.on(Hls.Events.MANIFEST_PARSED, () => onReady());
    hls.on(Hls.Events.ERROR, (_e, d) => { if (d?.fatal) onError(d); });
    hls.loadSource(url); hls.attachMedia(video);
    return { destroy() { try { hls.destroy(); } catch { /* */ } clearSrc(video); } };
  } catch (e) { onError(e); return { destroy() { clearSrc(video); } }; }
}

// <Player> — a full-screen video overlay. The app routes it (open via S.screen, pass an onClose that
// history-backs so the system Back closes it). Chrome strings are built-in (media()), so no video app
// duplicates them. States: connecting (Pixels skeleton) → playing, or → unavailable (with an open-externally
// escape hatch for a stream the browser can't decode).
//
// The runtime owns everything a player must do and no app should re-remember: the screen stays awake while
// it plays (the OS blanks on "no touches", and watching IS no touches), picture-in-picture, fullscreen, and
// seeking to where you left. Persistence is NOT here — the app owns its storage, so it passes `startAt` and
// gets `onTime(t, duration)`; video.js never imports a database.
export function Player({ url, title, locale = "en", onClose, poster, startAt = 0, onTime }) {
  const ref = useRef(), boxRef = useRef();
  const [state, setState] = useState("loading");   // loading | playing | error
  const [fs, setFs] = useState(false);
  const canPip = typeof document !== "undefined" && document.pictureInPictureEnabled;
  const canFs = typeof document !== "undefined" && !!(document.fullscreenEnabled || document.documentElement?.requestFullscreen);

  useEffect(() => {
    const v = ref.current; if (!v) return;
    let handle, dead = false;
    setState("loading");
    const ready = () => {
      if (dead) return;
      // Seek before the first frame is shown, not after: seeking a visible <video> makes the resume look
      // like a glitch — you watch the opening for a beat, then get yanked.
      const at = resumeAt(startAt, v.duration);
      if (at > 0) { try { v.currentTime = at; } catch { /* not seekable */ } }
      setState("playing");
    };
    createPlayer(v, url, { onReady: ready, onError: () => { if (!dead) setState("error"); } })
      .then((h) => { handle = h; if (dead) h.destroy(); });
    return () => { dead = true; handle?.destroy(); };
  }, [url]);

  // The screen must not die mid-film. Held only while the overlay is open, released on close — a lock left
  // behind is a battery bug nobody connects back to the video app they closed an hour ago.
  useEffect(() => {
    const lock = wakeLock.acquire();
    return () => lock.release();
  }, []);

  // Report progress on a slow tick, not on timeupdate (which fires ~4×/s and would hammer the app's
  // storage for a number that changes by a quarter second).
  useEffect(() => {
    if (!onTime) return;
    const id = setInterval(() => {
      const v = ref.current;
      if (v && !v.paused && isFinite(v.currentTime)) onTime(v.currentTime, isFinite(v.duration) ? v.duration : 0);
    }, 5000);
    return () => {
      clearInterval(id);
      const v = ref.current;                            // one last write on close — the most valuable one
      if (v && isFinite(v.currentTime)) onTime(v.currentTime, isFinite(v.duration) ? v.duration : 0);
    };
  }, [onTime]);

  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  const pip = async () => { try { const v = ref.current; document.pictureInPictureElement ? await document.exitPictureInPicture() : await v?.requestPictureInPicture(); } catch { /* denied / not ready */ } };
  const full = async () => { try { document.fullscreenElement ? await document.exitFullscreen() : await boxRef.current?.requestFullscreen(); } catch { /* denied */ } };
  const openBtn = html`<a href=${url} target="_blank" rel="noopener" class="btn btn-sm btn-outline text-white border-white/30 gap-2"><iconify-icon icon="lucide:external-link"></iconify-icon>${media("openExternal", locale)}</a>`;
  return html`<div ref=${boxRef} role="dialog" aria-modal="true" aria-label=${title || media("player", locale)} class="fixed inset-0 z-40 bg-black flex flex-col" style="padding-top:env(safe-area-inset-top)">
    <header class="flex items-center gap-1 px-2 py-1.5 text-white bg-black/70">
      <button id="player-back" class="btn btn-ghost btn-sm btn-circle text-white" aria-label=${media("back", locale)} onClick=${onClose}><iconify-icon icon="lucide:arrow-left" class="text-xl"></iconify-icon></button>
      <span class="flex-1 min-w-0 truncate font-medium">${title || ""}</span>
      ${state === "playing" && canPip ? html`<button id="player-pip" class="btn btn-ghost btn-sm btn-circle text-white" aria-label=${media("pip", locale)} onClick=${pip}><iconify-icon icon="lucide:picture-in-picture-2" class="text-lg"></iconify-icon></button>` : null}
      ${state === "playing" && canFs ? html`<button id="player-fs" class="btn btn-ghost btn-sm btn-circle text-white" aria-label=${media(fs ? "exitFullscreen" : "fullscreen", locale)} onClick=${full}><iconify-icon icon=${fs ? "lucide:minimize" : "lucide:maximize"} class="text-lg"></iconify-icon></button>` : null}
      ${state !== "error" ? html`<a href=${url} target="_blank" rel="noopener" class="btn btn-ghost btn-sm btn-circle text-white" aria-label=${media("openExternal", locale)}><iconify-icon icon="lucide:external-link" class="text-lg"></iconify-icon></a>` : null}
    </header>
    <div class="flex-1 relative flex items-center justify-center overflow-hidden">
      <video ref=${ref} controls autoplay playsinline poster=${poster || ""} class=${`w-full max-h-full bg-black ${state === "playing" ? "" : "opacity-0 pointer-events-none"}`}></video>
      ${state === "loading" ? html`<div class="absolute inset-0"><${Pixels} cls="w-full h-full" /><div class="absolute inset-0 flex items-center justify-center text-white/70 text-sm">${media("loading", locale)}</div></div>` : null}
      ${state === "error" ? html`<div class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70 p-6 text-center">
        <iconify-icon icon="lucide:tv-minimal-play" class="text-5xl opacity-40"></iconify-icon>
        <div>${media("unavailable", locale)}</div>${openBtn}</div>` : null}
    </div>
  </div>`;
}
