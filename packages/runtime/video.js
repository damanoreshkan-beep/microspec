/* @ts-self-types="./video.d.ts" */
/**
 * # runtime/video.js — the app supplies a url and a title; the runtime owns the rest
 *
 * The video playback primitive, reusable by ANY video app (IPTV, trailers, live cams, lectures, a swipe
 * feed). `createPlayer` attaches a stream to a `<video>` element and owns the hard part — HLS vs
 * progressive, hls.js vs the native element, lazy loading of hls.js, fatal-error recovery and a teardown
 * that never leaks a buffer or a background fetch. `Player` is the full-screen overlay built on it: the
 * connecting skeleton, the unavailable state with an open-externally escape hatch, the built-in chrome
 * strings, the wake lock, picture-in-picture, fullscreen and resume-where-you-left. What it buys the farm is
 * that no video app re-remembers any of this, and that the two failures that once made both video sites
 * report "unavailable" — a proxied url with no extension, and Android Chrome answering "maybe" to native
 * HLS — are fixed in one place.
 *
 * ![The playback primitive: url and type into createPlayer, hls.js first then the native element then progressive, Player's states around it](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-video.svg)
 *
 * ## Import
 * ```js
 * import { createPlayer, Player } from "/_rt/video.js";                    // an app's page: the import map resolves /_rt/
 * import { createPlayer, Player } from "@microspec/core/runtime/video.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link createPlayer} — `createPlayer(video, url, { onReady, onError, type })` → a promise of `{ destroy() }`.
 *   `type` is "hls" | "progressive" | null (sniff the extension). Never throws: every failure routes through `onError`.
 * - {@link Player} — `<Player url title locale onClose poster startAt onTime type />`, the full-screen overlay
 *   component: loading (Pixels skeleton) → playing (its own transport and gestures, PiP, wake lock) or
 *   error (unavailable + try again + open externally).
 * - {@link resumeAt} — `resumeAt(saved, duration)` → where to actually start, re-exported from playback.js.
 * - {@link recoverPlan} — what a FATAL error deserves (reload / recover / fail), re-exported from playback.js.
 * - {@link RESUME_MIN} — 30 s; below it a saved position counts as not started (re-exported from playback.js).
 * - {@link RESUME_TAIL} — 0.98; past that fraction the film counts as finished (re-exported from playback.js).
 *
 * ## In practice
 * ```js
 * import { Player } from "/_rt/video.js";                                    // apps/iptv/view.js
 *
 * // routed by the app: open via S.screen, close history-backed so the system Back closes it
 * ${screen === "play" && sel
 *   ? html`<${Player} url=${sel.url} title=${sel.name} locale=${loc} onClose=${() => S.screen.set(null)} />`
 *   : null}
 * ```
 * ```js
 * import { createPlayer } from "/_rt/video.js";                              // apps/reel/view.js — the headless half
 *
 * let handle, dead = false;
 * createPlayer(v, src, {
 *   type: /\.m3u8(\?|#|$)/i.test(item.video) ? "hls" : "progressive",       // the ORIGINAL url still has its extension; src is proxied
 *   onReady: () => { if (!dead) setReady(true); },
 *   // a direct failure is a question, not a verdict: swap to the proxied url once, then it is the end
 *   onError: () => { if (dead) return; if (viaProxy) setErrored(true); else setViaProxy(true); },
 * }).then((h) => { if (dead) h?.destroy?.(); else handle = h; });
 * return () => { dead = true; handle?.destroy?.(); };                        // the effect's cleanup
 * ```
 *
 * ## How it fits
 * It imports `html` from htm/preact and the hooks from preact/hooks, `media` from i18n.js (the chrome
 * strings), `Pixels` from skeleton.js, `wakeLock` from sensors.js and `resumeAt` from playback.js; hls.js
 * itself is a dynamic `import()` from esm.sh, fetched only when an HLS url arrives. No runtime module imports
 * it statically: render.js lazy-imports it for the detail `play` action, when the spec declares one (cinema),
 * and mounts `Player` with `startAt` from the app's own store. Two farm apps import it by name — iptv
 * (`Player`) and reel (`createPlayer` for the swipe window, `Player` for the full clip) — and every app's
 * generated sw.js precaches `/_rt/video.js`. playback.js exists because this file drags Preact behind it:
 * the resume rule lives where the unit gate can hold it.
 *
 * ## Invariants and pitfalls
 * - `type` beats sniffing, and sniffing alone failed twice: a url through the reverse proxy has NO extension,
 *   so every proxied MP4 sniffed as "not progressive" and went to an HLS parser; and `canPlayType` for HLS
 *   answers "maybe" on Android Chrome — truthy — so the old native-first branch handed a manifest to the bare
 *   element on the one platform the farm targets. Pass `type` when you know it.
 * - hls.js is asked FIRST wherever it is supported; the native element is the fallback for Safari/iOS, where
 *   hls.js is unsupported and the element genuinely plays HLS. This is hls.js's own guidance, and the reverse
 *   of what the file used to do.
 * - An unknown kind (no extension, no `type`) goes to the element first — it sniffs the content-type itself —
 *   and on failure is retried as HLS rather than written off.
 * - `backBufferLength` is capped at 30 s (hls.js's default is Infinity): reel holds a window of three players,
 *   and three unbounded back buffers on a long stream is a memory leak with a polite name. Forward buffer is
 *   12 s, and hls.js treats `maxBufferLength` as a target it reaches regardless of `maxBufferSize`.
 * - The element carries NO `controls`, and that is load-bearing rather than cosmetic: Android's native
 *   media controls bring a rotate-to-fullscreen delegate, so turning the phone promoted the ELEMENT to
 *   fullscreen — outside this dialog, without its chrome or an app's filters, interrupting playback. The
 *   delegate lives on those controls; `Player` draws its own transport instead (play/pause, position,
 *   length, sound) and rotating now only rotates the video. `controlsList="nofullscreen"` and
 *   `disableRemotePlayback` are the belt and braces for a shell that shows controls anyway.
 * - There is no fullscreen button either: the overlay already covers the screen, so it only ever handed
 *   OUR surface to the browser's.
 * - The picture is a transport: a horizontal drag scrubs (axis locked at 8px, so a vertical thumb-slide
 *   does nothing), a double tap on a side jumps ±10s, a single tap plays/pauses, and arrows/space do the
 *   same from a keyboard. Where a gesture LANDS is playback.js (`scrubTo`/`skipTo`/`scrubSpan`), under the
 *   unit gate; video.js only holds the finger. The click that ends a drag is swallowed — without that,
 *   every scrub also paused the clip.
 * - `destroy()` fully tears down (hls instance, `src`, `load()`, a pending retry timer), so switching
 *   channels or closing never leaks. Keep a `dead` flag: the promise may resolve after unmount, and the
 *   handle must be destroyed then.
 * - "Fatal" is hls.js saying its OWN retries are spent, not that the stream is gone. A fatal network error
 *   is reloaded (twice, backing off) and a fatal media error recovers the decoder once — `recoverPlan` owns
 *   the rule, this file only counts. `onError` fires when that budget is spent, and `Player` then offers
 *   the viewer the same thing by hand: a retry that rebuilds the instance. Reading "fatal" as final is what
 *   made one expired segment or one late manifest end a clip that played on the next attempt.
 * - `Player` seeks before the first frame is shown, not after — seeking a visible video makes the resume look
 *   like a glitch. The wake lock is held only while the overlay is open; a lock left behind is a battery bug
 *   nobody connects to the video app they closed an hour ago.
 * - Persistence is NOT here: the app owns its storage, passes `startAt` and gets `onTime(t, duration)` on a
 *   5 s tick plus one last write on close — never on `timeupdate`. video.js never imports a database.
 * - `onClose` must history-back: the app routes the overlay, so the system Back closes it.
 * @module
 */
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { media } from "./i18n.js";
import { Pixels } from "./skeleton.js";
import { wakeLock } from "./sensors.js";
import { resumeAt, recoverPlan, fmtClock, scrubTo, skipTo, fmtDelta } from "./playback.js";
export { resumeAt, RESUME_MIN, RESUME_TAIL, recoverPlan, fmtClock, scrubSpan, scrubTo, skipTo, fmtDelta } from "./playback.js";

const HLS = "https://esm.sh/hls.js@1.5.17";
const clearSrc = (v) => { try { v.removeAttribute("src"); v.load(); } catch { } };

/**
 * Attach a stream url to a `<video>` element, choosing hls.js, the native element or progressive playback; never throws.
 * @param video the `<video>` element
 * @param url the stream url (HLS manifest or progressive file)
 * @param opts `onReady` (first frame / manifest), `onError` (fatal failure), `type` ("hls" | "progressive" | null to sniff)
 * @returns a handle whose `destroy()` fully tears playback down
 */
export async function createPlayer(video, url, { onReady = () => {}, onError = () => {}, type = null, buffer = 12 } = {}) {
  const kind = type
    || (/\.m3u8(\?|#|$)/i.test(url) ? "hls" : /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(url) ? "progressive" : null);
  const attach = (fallback) => {
    video.src = url;
    video.addEventListener("loadeddata", onReady, { once: true });
    video.addEventListener("error", () => (fallback ? fallback() : onError()), { once: true });
    return { destroy() { clearSrc(video); } };
  };
  if (kind !== "hls") {
    let handle = attach(kind === "progressive" ? null : () => {
      createPlayer(video, url, { onReady, onError, type: "hls" }).then((h) => { handle = h; });
    });
    return { destroy() { handle?.destroy?.(); } };
  }
  try {
    const mod = await import(HLS);
    const Hls = mod.default || mod;
    if (!Hls?.isSupported?.()) return attach(null);
    const hls = new Hls({ maxBufferLength: buffer, backBufferLength: 30, manifestLoadingTimeOut: 12000, manifestLoadingMaxRetry: 3 });
    hls.on(Hls.Events.MANIFEST_PARSED, () => onReady());
    const tried = { net: 0, media: 0 };
    let timer = 0;
    hls.on(Hls.Events.ERROR, (_e, d) => {
      if (!d?.fatal) return;
      const kind = d.type === Hls.ErrorTypes.NETWORK_ERROR ? "network" : d.type === Hls.ErrorTypes.MEDIA_ERROR ? "media" : "";
      const { act, delay } = recoverPlan(kind, tried);
      if (act === "fail") return onError(d);
      if (act === "reload") {
        tried.net++;
        clearTimeout(timer);
        timer = setTimeout(() => { try { hls.startLoad(); } catch { onError(d); } }, delay);
        return;
      }
      tried.media++;
      try { hls.recoverMediaError(); } catch { onError(d); }
    });
    hls.loadSource(url); hls.attachMedia(video);
    return { destroy() { clearTimeout(timer); try { hls.destroy(); } catch { } clearSrc(video); } };
  } catch (e) { onError(e); return { destroy() { clearSrc(video); } }; }
}

/**
 * Full-screen video overlay component: connecting skeleton → playing (PiP, fullscreen, wake lock) or unavailable.
 * @param props `url`, `title`, `locale`, `onClose` (history-backed), `poster`, `startAt` (seconds), `onTime(t, duration)` progress callback, `type` (see createPlayer)
 * @returns the rendered overlay
 */
export function Player({ url, title, locale = "en", onClose, poster, startAt = 0, onTime, type = null }) {
  const ref = useRef(), boxRef = useRef();
  const [state, setState] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  const canPip = typeof document !== "undefined" && document.pictureInPictureEnabled;

  useEffect(() => {
    const v = ref.current; if (!v) return;
    let handle, dead = false;
    setState("loading");
    const ready = () => {
      if (dead) return;
      const at = resumeAt(startAt, v.duration);
      if (at > 0) { try { v.currentTime = at; } catch { } }
      setState("playing");
    };
    createPlayer(v, url, { type, buffer: 30, onReady: ready, onError: () => { if (!dead) setState("error"); } })
      .then((h) => { handle = h; if (dead) h.destroy(); });
    return () => { dead = true; handle?.destroy(); };
  }, [url, type, attempt]);

  useEffect(() => {
    const lock = wakeLock.acquire();
    return () => lock.release();
  }, []);

  useEffect(() => {
    if (!onTime) return;
    const id = setInterval(() => {
      const v = ref.current;
      if (v && !v.paused && isFinite(v.currentTime)) onTime(v.currentTime, isFinite(v.duration) ? v.duration : 0);
    }, 5000);
    return () => {
      clearInterval(id);
      const v = ref.current;
      if (v && isFinite(v.currentTime)) onTime(v.currentTime, isFinite(v.duration) ? v.duration : 0);
    };
  }, [onTime]);

  const [playing, setPlaying] = useState(true);
  const [at, setAt] = useState(0);
  const [len, setLen] = useState(0);
  const [muted, setMuted] = useState(false);
  const seeking = useRef(false);
  useEffect(() => {
    const v = ref.current; if (!v) return;
    const sync = () => { setPlaying(!v.paused); setMuted(v.muted); };
    const time = () => { if (!seeking.current) setAt(v.currentTime || 0); };
    const dur = () => setLen(isFinite(v.duration) ? v.duration : 0);
    v.addEventListener("play", sync); v.addEventListener("pause", sync); v.addEventListener("volumechange", sync);
    v.addEventListener("timeupdate", time); v.addEventListener("durationchange", dur); v.addEventListener("loadedmetadata", dur);
    sync(); dur();
    return () => {
      v.removeEventListener("play", sync); v.removeEventListener("pause", sync); v.removeEventListener("volumechange", sync);
      v.removeEventListener("timeupdate", time); v.removeEventListener("durationchange", dur); v.removeEventListener("loadedmetadata", dur);
    };
  }, [url, attempt]);
  const toggle = () => { const v = ref.current; if (!v) return; if (v.paused) v.play().catch(() => {}); else v.pause(); };

  const drag = useRef({ on: false, x0: 0, y0: 0, axis: 0, from: 0, moved: 0, at: 0 });
  const [scrub, setScrub] = useState(null);
  const lastTap = useRef({ t: 0, x: 0 });
  const surfaceRef = useRef();
  const widthOf = () => surfaceRef.current?.getBoundingClientRect?.().width || 0;
  const seekTo = (to) => {
    const v = ref.current; if (!v || !isFinite(to)) return;
    try { v.currentTime = to; } catch { }
    setAt(to);
  };
  const down = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const v = ref.current;
    drag.current = { on: true, x0: e.clientX, y0: e.clientY, axis: 0, from: v?.currentTime || 0, moved: 0, at: 0 };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { }
  };
  const move = (e) => {
    const d = drag.current; if (!d.on) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      d.axis = Math.abs(dx) > Math.abs(dy) ? 1 : -1;
    }
    if (d.axis !== 1 || !len) return;
    d.moved = dx;
    seeking.current = true;
    const to = scrubTo(d.from, dx, widthOf(), len);
    setScrub({ to, delta: to - d.from });
  };
  const up = () => {
    const d = drag.current; if (!d.on) return;
    d.on = false;
    if (d.axis === 1 && Math.abs(d.moved) > 8) {
      seekTo(scrubTo(d.from, d.moved, widthOf(), len));
      d.at = Date.now();
    }
    seeking.current = false;
    setScrub(null);
  };
  const tapTimer = useRef(0);
  const [jump, setJump] = useState(null);
  const surfaceTap = (e) => {
    if (Date.now() - drag.current.at < 400) return;
    const now = Date.now(), prev = lastTap.current;
    lastTap.current = { t: now, x: e.clientX };
    if (now - prev.t < 280 && Math.abs(e.clientX - prev.x) < 60) {
      clearTimeout(tapTimer.current);
      lastTap.current = { t: 0, x: 0 };
      if (!len) return;
      const box = surfaceRef.current?.getBoundingClientRect?.();
      const dir = box && e.clientX - box.left < box.width / 2 ? -1 : 1;
      seekTo(skipTo(ref.current?.currentTime || 0, dir * 10, len));
      setJump({ dir, key: now });
      setTimeout(() => setJump((j) => (j && j.key === now ? null : j)), 600);
      return;
    }
    clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => toggle(), 280);
  };
  useEffect(() => () => clearTimeout(tapTimer.current), []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || /^(?:INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "")) return;
      if (e.key === " " || e.key === "Spacebar") { e.preventDefault(); toggle(); return; }
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      seekTo(skipTo(ref.current?.currentTime || 0, e.key === "ArrowRight" ? 5 : -5, len));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [len]);
  const seek = (e) => { const v = ref.current, to = Number(e.target.value); setAt(to); if (v && isFinite(to)) { try { v.currentTime = to; } catch { } } };
  const sound = () => { const v = ref.current; if (v) v.muted = !v.muted; };

  const pip = async () => { try { const v = ref.current; document.pictureInPictureElement ? await document.exitPictureInPicture() : await v?.requestPictureInPicture(); } catch { } };
  const openBtn = html`<a href=${url} target="_blank" rel="noopener" class="btn btn-sm btn-outline text-white border-white/30 gap-2"><iconify-icon icon="lucide:external-link"></iconify-icon>${media("openExternal", locale)}</a>`;
  const retryBtn = html`<button id="player-retry" class="btn btn-sm btn-primary gap-2" onClick=${() => { setState("loading"); setAttempt((n) => n + 1); }}><iconify-icon icon="lucide:rotate-cw"></iconify-icon>${media("retry", locale)}</button>`;
  return html`<div ref=${boxRef} role="dialog" aria-modal="true" aria-label=${title || media("player", locale)} class="fixed inset-0 z-40 bg-black flex flex-col" style="padding-top:var(--ms-safe-top)">
    <header class="flex items-center gap-1 px-2 py-1.5 text-white bg-black/70">
      <button id="player-back" class="btn btn-ghost btn-sm btn-circle text-white" aria-label=${media("back", locale)} onClick=${onClose}><iconify-icon icon="lucide:arrow-left" class="text-xl"></iconify-icon></button>
      <span class="flex-1 min-w-0 truncate font-medium">${title || ""}</span>
      ${state === "playing" && canPip ? html`<button id="player-pip" class="btn btn-ghost btn-sm btn-circle text-white" aria-label=${media("pip", locale)} onClick=${pip}><iconify-icon icon="lucide:picture-in-picture-2" class="text-lg"></iconify-icon></button>` : null}
      ${state !== "error" ? html`<a href=${url} target="_blank" rel="noopener" class="btn btn-ghost btn-sm btn-circle text-white" aria-label=${media("openExternal", locale)}><iconify-icon icon="lucide:external-link" class="text-lg"></iconify-icon></a>` : null}
    </header>
    <div ref=${surfaceRef} class="flex-1 relative flex items-center justify-center overflow-hidden touch-pan-y select-none"
      onPointerDown=${state === "playing" ? down : null} onPointerMove=${state === "playing" ? move : null}
      onPointerUp=${state === "playing" ? up : null} onPointerCancel=${state === "playing" ? up : null}
      onClick=${state === "playing" ? surfaceTap : null}>
      ${""}
      <video ref=${ref} autoplay playsinline disableremoteplayback controlslist="nodownload nofullscreen noremoteplayback"
        poster=${poster || ""}
        class=${`w-full max-h-full bg-black pointer-events-none ${state === "playing" ? "" : "opacity-0"}`}></video>
      ${scrub ? html`<div id="player-scrub" class="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center pointer-events-none">
        <div class="px-4 py-2 rounded-2xl bg-black/70 text-white text-center">
          <div class="text-xl font-semibold tabular-nums">${fmtClock(scrub.to)}</div>
          <div class="text-xs tabular-nums opacity-70">${fmtDelta(scrub.delta)}</div>
        </div></div>` : null}
      ${jump ? html`<div class=${`absolute inset-y-0 ${jump.dir < 0 ? "left-0" : "right-0"} w-1/3 flex items-center justify-center pointer-events-none`}>
        <div class="flex items-center gap-1 px-3 py-2 rounded-2xl bg-black/60 text-white text-sm font-semibold">
          <iconify-icon icon=${jump.dir < 0 ? "lucide:rewind" : "lucide:fast-forward"}></iconify-icon>10</div>
      </div>` : null}
      ${state === "loading" ? html`<div class="absolute inset-0"><${Pixels} cls="w-full h-full" /><div class="absolute inset-0 flex items-center justify-center text-white/70 text-sm">${media("loading", locale)}</div></div>` : null}
      ${state === "error" ? html`<div class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70 p-6 text-center">
        <iconify-icon icon="lucide:tv-minimal-play" class="text-5xl opacity-40"></iconify-icon>
        <div>${media("unavailable", locale)}</div>
        <div class="flex items-center gap-2 flex-wrap justify-center">${retryBtn}${openBtn}</div></div>` : null}
    </div>
    ${""}
    ${state === "playing" ? html`<div id="player-bar" class="flex items-center gap-3 px-3 py-2 text-white bg-black/70" style="padding-bottom:calc(env(safe-area-inset-bottom) + 0.5rem)">
      <button id="player-play" class="btn btn-ghost btn-sm btn-circle text-white" aria-label=${media(playing ? "pause" : "play", locale)} onClick=${toggle}>
        <iconify-icon icon=${playing ? "lucide:pause" : "lucide:play"} class="text-lg"></iconify-icon></button>
      ${len > 0
        ? html`<${Fragment}>
            <span class="text-xs tabular-nums opacity-80 w-11 text-right">${fmtClock(at)}</span>
            <input id="player-seek" type="range" class="range range-xs flex-1 min-w-0" aria-label=${media("seek", locale)}
              min="0" max=${len} step="0.1" value=${Math.min(at, len)}
              onPointerDown=${() => { seeking.current = true; }} onPointerUp=${() => { seeking.current = false; }}
              onInput=${seek} onChange=${seek} />
            <span class="text-xs tabular-nums opacity-60 w-11">${fmtClock(len)}</span>
          </${Fragment}>`
        : html`<span class="flex-1 text-xs font-semibold tracking-wide opacity-80">${media("live", locale)}</span>`}
      <button id="player-mute" class="btn btn-ghost btn-sm btn-circle text-white" aria-label=${media(muted ? "unmute" : "mute", locale)} onClick=${sound}>
        <iconify-icon icon=${muted ? "lucide:volume-x" : "lucide:volume-2"} class="text-lg"></iconify-icon></button>
    </div>` : null}
  </div>`;
}
