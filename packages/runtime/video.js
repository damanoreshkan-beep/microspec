// microspec runtime — video playback primitive. Reusable by ANY video app (IPTV, trailers, live cams,
// lectures): the app supplies a title + a stream URL, the runtime owns the hard part — HLS vs progressive,
// native vs hls.js, lazy loading, fatal-error recovery, cleanup, and the a11y/skeleton/error chrome.
//
//   createPlayer(videoEl, url, { onReady, onError })  → { destroy() }   // headless logic
//   <${Player} url=… title=… locale=… onClose=… />                     // full-screen overlay component
import { html } from "htm/preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { media } from "/_rt/i18n.js";
import { Pixels } from "/_rt/skeleton.js";

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
export function Player({ url, title, locale = "en", onClose, poster }) {
  const ref = useRef();
  const [state, setState] = useState("loading");   // loading | playing | error
  useEffect(() => {
    const v = ref.current; if (!v) return;
    let handle, dead = false;
    setState("loading");
    createPlayer(v, url, { onReady: () => { if (!dead) setState("playing"); }, onError: () => { if (!dead) setState("error"); } })
      .then((h) => { handle = h; if (dead) h.destroy(); });
    return () => { dead = true; handle?.destroy(); };
  }, [url]);
  const openBtn = html`<a href=${url} target="_blank" rel="noopener" class="btn btn-sm btn-outline text-white border-white/30 gap-2"><iconify-icon icon="lucide:external-link"></iconify-icon>${media("openExternal", locale)}</a>`;
  return html`<div role="dialog" aria-modal="true" aria-label=${title || media("player", locale)} class="fixed inset-0 z-40 bg-black flex flex-col" style="padding-top:env(safe-area-inset-top)">
    <header class="flex items-center gap-1 px-2 py-1.5 text-white bg-black/70">
      <button id="player-back" class="btn btn-ghost btn-sm btn-circle text-white" aria-label=${media("back", locale)} onClick=${onClose}><iconify-icon icon="lucide:arrow-left" class="text-xl"></iconify-icon></button>
      <span class="flex-1 min-w-0 truncate font-medium">${title || ""}</span>
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
