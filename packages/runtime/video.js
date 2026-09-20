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
// microspec runtime — video playback primitive. Reusable by ANY video app (IPTV, trailers, live cams,
// lectures): the app supplies a title + a stream URL, the runtime owns the hard part — HLS vs progressive,
// native vs hls.js, lazy loading, fatal-error recovery, cleanup, and the a11y/skeleton/error chrome.
//
//   createPlayer(videoEl, url, { onReady, onError })  → { destroy() }   // headless logic
//   <${Player} url=… title=… locale=… onClose=… startAt=… onTime=… />  // full-screen overlay component
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { media } from "./i18n.js";
import { Pixels } from "./skeleton.js";
import { wakeLock } from "./sensors.js";
import { resumeAt, recoverPlan, fmtClock, scrubTo, skipTo, fmtDelta } from "./playback.js";
export { resumeAt, RESUME_MIN, RESUME_TAIL, recoverPlan, fmtClock, scrubSpan, scrubTo, skipTo, fmtDelta } from "./playback.js";

const HLS = "https://esm.sh/hls.js@1.5.17";
const clearSrc = (v) => { try { v.removeAttribute("src"); v.load(); } catch { /* torn down */ } };

// createPlayer — attach `url` to `video`. Returns a handle whose destroy() fully tears down (so switching
// channels or closing the player never leaks a buffer or a background fetch). onReady fires on first frame /
// manifest; onError on a FATAL failure (dead stream, CORS-blocked segments, unsupported) → the caller shows
// its fallback. Never throws — every failure routes through onError.
/* `type` ("hls" | "progressive") beats sniffing, and sniffing used to be all there was. Two ways that failed:
   · a URL through the reverse proxy has NO file extension — the real target sits inside an opaque envelope —
     so every proxied MP4 sniffed as "not progressive" and got handed to an HLS parser;
   · `canPlayType("application/vnd.apple.mpegurl")` answers "maybe" on Android Chrome, which is truthy, so the
     old `progressive || nativeHls` branch gave a manifest to the bare element on the one platform this farm
     targets — and Android does not play HLS natively. Both sites reported "unavailable" for exactly this.
   Hence the order below: hls.js is asked FIRST whenever it is supported, and the native element is the
   fallback for Safari/iOS, where hls.js is unsupported and the element genuinely does play HLS. That is the
   order hls.js's own guidance gives, and the reverse of what this used to do. */
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
    /* Unknown means "no extension and nobody said" — a proxied URL. The element sniffs the content-type
       itself and is right most of the time, so it goes first; if it fails, the stream is retried as HLS
       rather than written off, which is the case an extension would have told us about for free. */
    let handle = attach(kind === "progressive" ? null : () => {
      createPlayer(video, url, { onReady, onError, type: "hls" }).then((h) => { handle = h; });
    });
    return { destroy() { handle?.destroy?.(); } };
  }
  try {
    const mod = await import(HLS);
    const Hls = mod.default || mod;
    // No hls.js (Safari/iOS) → the element itself is the HLS player there, and a good one.
    if (!Hls?.isSupported?.()) return attach(null);
    /* `backBufferLength` is hls.js's own default of Infinity — every second already played is KEPT, for the
       life of the instance. That was survivable while a video app meant one player at a time; it stopped
       being survivable when reel began holding a window of three so the next clip is ready before you swipe
       to it. Three unbounded back buffers on a long stream is a memory leak with a polite name. 30s is
       enough to scrub back into and is a number rather than a promise.
       The forward side is already capped at 12s — and note hls.js treats `maxBufferLength` as a minimum
       TARGET it will reach regardless of `maxBufferSize`, so the duration cap is the one that binds. */
    /* manifestLoadingMaxRetry was 1, and one retry is not a mobile link's worth. The manifest is the whole
       stream's front door: miss it and there is nothing to recover from later, so this is the one budget
       worth spending before the first frame. 3 at hls.js's own backoff still gives up well inside a wait
       anyone would sit through. */
    /* `buffer` is the caller's, because the two callers are not alike: a reel holds a WINDOW of three
       players and must stay small (12s, its own note below), while this overlay is one clip on the screen
       and wants a cushion — after a seek, a bigger forward target is the difference between playing on and
       stalling at the next segment boundary. Measured: one segment of this stream is 10.7s, so 12s of
       forward buffer is barely one fragment ahead. */
    const hls = new Hls({ maxBufferLength: buffer, backBufferLength: 30, manifestLoadingTimeOut: 12000, manifestLoadingMaxRetry: 3 });
    hls.on(Hls.Events.MANIFEST_PARSED, () => onReady());
    /* A FATAL error is not a verdict on the stream — see recoverPlan (playback.js) for what each kind
       deserves and why. This is the bookkeeping only: count what has been tried, do what the plan says,
       and report only when the plan gives up. The timer is held so destroy() can cancel it — a retry that
       fires into a torn-down instance is an exception nobody sees and a fetch nobody wants. */
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
    return { destroy() { clearTimeout(timer); try { hls.destroy(); } catch { /* */ } clearSrc(video); } };
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
/**
 * Full-screen video overlay component: connecting skeleton → playing (PiP, fullscreen, wake lock) or unavailable.
 * @param props `url`, `title`, `locale`, `onClose` (history-backed), `poster`, `startAt` (seconds), `onTime(t, duration)` progress callback, `type` (see createPlayer)
 * @returns the rendered overlay
 */
export function Player({ url, title, locale = "en", onClose, poster, startAt = 0, onTime, type = null }) {
  const ref = useRef(), boxRef = useRef();
  const [state, setState] = useState("loading");   // loading | playing | error
  /* The attempt counter, and the only reason it exists: a stream that failed is worth ASKING for again.
     createPlayer already recovers what is recoverable on its own (recoverPlan), so by the time this screen
     is up the automatic budget is spent — but the thing that spent it is often gone a few seconds later (a
     signed segment that expired, a tunnel that hiccuped, a dead CDN edge). Before this, the only way to ask
     again was to close the clip and open it from the feed, which people were doing and calling the app
     broken. It rides the effect's deps, so pressing it tears the old instance down and builds a new one. */
  const [attempt, setAttempt] = useState(0);
  const canPip = typeof document !== "undefined" && document.pictureInPictureEnabled;

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
    createPlayer(v, url, { type, buffer: 30, onReady: ready, onError: () => { if (!dead) setState("error"); } })
      .then((h) => { handle = h; if (dead) h.destroy(); });
    return () => { dead = true; handle?.destroy(); };
  }, [url, type, attempt]);

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

  /* OUR OWN TRANSPORT, AND WHY THE ELEMENT NO LONGER CARRIES `controls`.
     Android's native media controls bring a delegate nobody asked for: turn the phone while a video plays
     and Chromium promotes THAT ELEMENT to fullscreen by itself. The promoted element is painted by the
     browser, outside this dialog — our chrome gone, the noir filter gone with it, playback interrupted at
     the moment the owner was only trying to look at the picture sideways. Undoing it afterwards (which this
     tried first) trades one jump for two. The delegate lives on the native controls, so the fix is to not
     have them: rotating now only rotates the video, because there is nothing left to fire.
     What the native bar did, this does — play/pause, position, length, sound — and nothing else it did not
     do. The fullscreen button went with it, on purpose: this overlay already covers the screen, so the
     control only ever left OUR surface for the browser's. */
  const [playing, setPlaying] = useState(true);
  const [at, setAt] = useState(0);
  const [len, setLen] = useState(0);
  const [muted, setMuted] = useState(false);
  // While a finger is on the slider the element's own timeupdate must not fight it back.
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

  /* ── THE PICTURE IS THE TRANSPORT ────────────────────────────────────────────────────────────────────
     A drag across the video scrubs, a double tap on a side jumps ten seconds, a single tap is play/pause.
     The rules of WHERE it lands live in playback.js (scrubTo/skipTo) where the unit gate holds them; this
     is only the finger.
     Three things separate a scrub that feels right from one that fights you:
       · the AXIS is locked once, at 8px of travel — a vertical drag then does nothing at all, instead of
         nudging the position every time somebody moves their thumb while watching;
       · the element is seeked WHILE dragging (this is a preview, not a commit at the end), but through
         `fastSeek` where it exists — that is the browser's own "get near here cheaply" and it is what
         keeps a long stream from re-buffering on every pixel;
       · the tap that ends a drag is SWALLOWED. Without that, every scrub also paused the clip, which is
         the bug that makes hand-written players feel broken. */
  const drag = useRef({ on: false, x0: 0, y0: 0, axis: 0, from: 0, moved: 0, at: 0 });
  const [scrub, setScrub] = useState(null);                 // null | { to, delta } while a finger is down
  const lastTap = useRef({ t: 0, x: 0 });
  const surfaceRef = useRef();
  const widthOf = () => surfaceRef.current?.getBoundingClientRect?.().width || 0;
  const seekTo = (to) => {
    const v = ref.current; if (!v || !isFinite(to)) return;
    try { v.currentTime = to; } catch { /* not seekable */ }
    setAt(to);
  };
  const down = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const v = ref.current;
    drag.current = { on: true, x0: e.clientX, y0: e.clientY, axis: 0, from: v?.currentTime || 0, moved: 0, at: 0 };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no capture, still works */ }
  };
  const move = (e) => {
    const d = drag.current; if (!d.on) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      d.axis = Math.abs(dx) > Math.abs(dy) ? 1 : -1;
    }
    if (d.axis !== 1 || !len) return;                       // vertical, or a live stream: not ours
    d.moved = dx;
    seeking.current = true;
    const to = scrubTo(d.from, dx, widthOf(), len);
    setScrub({ to, delta: to - d.from });
    /* The element is NOT seeked while the finger moves, and that is the whole difference between a scrub
       that answers and one you wait out. Measured through our own proxy on a real clip: one 10.7s segment
       is 3.98MB at 1080p. Every `currentTime` write makes hls.js drop its buffer and fetch the segment at
       the new position, so a drag across the screen queued dozens of multi-megabyte loads — each one
       cancelling the last, the last one landing after everything before it had already cost bandwidth. The
       time readout follows the finger (it is the feedback that matters); the media moves once, on release. */
  };
  const up = () => {
    const d = drag.current; if (!d.on) return;
    d.on = false;
    if (d.axis === 1 && Math.abs(d.moved) > 8) {
      seekTo(scrubTo(d.from, d.moved, widthOf(), len));      // the one seek this gesture is worth
      d.at = Date.now();                                     // …and the click this drag ends with is not a tap
    }
    seeking.current = false;
    setScrub(null);
  };
  /* Single tap plays/pauses, double tap jumps — so the single one WAITS to find out which it is. 280ms is
     the gap people actually produce (the runtime's own useTap uses the same), and a jump cancels the
     pending toggle rather than doing both. */
  const tapTimer = useRef(0);
  const [jump, setJump] = useState(null);                    // null | { dir, key } — the ±10s flash
  const surfaceTap = (e) => {
    if (Date.now() - drag.current.at < 400) return;          // this click is the end of a scrub
    const now = Date.now(), prev = lastTap.current;
    lastTap.current = { t: now, x: e.clientX };
    if (now - prev.t < 280 && Math.abs(e.clientX - prev.x) < 60) {
      clearTimeout(tapTimer.current);
      lastTap.current = { t: 0, x: 0 };
      if (!len) return;                                      // live: nothing to jump through
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
  /* The same three moves from a keyboard, because a surface whose controls are GESTURES is unreachable
     otherwise — and this overlay is often the whole screen. Arrows step 5s (a keyboard can repeat; a thumb
     cannot), space plays and pauses. The bar's own slider keeps its arrows: it is an input, and stealing
     them there would break the one control that is already accessible. */
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
  const seek = (e) => { const v = ref.current, to = Number(e.target.value); setAt(to); if (v && isFinite(to)) { try { v.currentTime = to; } catch { /* not seekable */ } } };
  const sound = () => { const v = ref.current; if (v) v.muted = !v.muted; };

  const pip = async () => { try { const v = ref.current; document.pictureInPictureElement ? await document.exitPictureInPicture() : await v?.requestPictureInPicture(); } catch { /* denied / not ready */ } };
  const openBtn = html`<a href=${url} target="_blank" rel="noopener" class="btn btn-sm btn-outline text-white border-white/30 gap-2"><iconify-icon icon="lucide:external-link"></iconify-icon>${media("openExternal", locale)}</a>`;
  // The first thing to reach for on this screen, so it is the filled one and it comes first; leaving for an
  // external player is the fallback it always was.
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
      ${/* `controlsList` and `disableRemotePlayback` are belt and braces for a shell that shows controls
            anyway (a WebView with its own policy): there is then still no fullscreen button on them. The
            gestures live on the SURFACE, not the element, so a drag that starts on the letterbox beside a
            portrait clip scrubs exactly like one that starts on the picture. */""}
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
    ${/* The transport. Always there, like the header above it: a bar that hides itself on a timer is a bar
          you hunt for, and this surface is already one tap deep. A live stream has no position to show, so
          it says so instead of drawing a slider that means nothing. */""}
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
