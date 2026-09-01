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
 *   component: loading (Pixels skeleton) → playing (PiP, fullscreen, wake lock) or error (unavailable + open externally).
 * - {@link resumeAt} — `resumeAt(saved, duration)` → where to actually start, re-exported from playback.js.
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
 * - `destroy()` fully tears down (hls instance, `src`, `load()`), so switching channels or closing never
 *   leaks. Keep a `dead` flag: the promise may resolve after unmount, and the handle must be destroyed then.
 * - `Player` seeks before the first frame is shown, not after — seeking a visible video makes the resume look
 *   like a glitch. The wake lock is held only while the overlay is open; a lock left behind is a battery bug
 *   nobody connects to the video app they closed an hour ago.
 * - Persistence is NOT here: the app owns its storage, passes `startAt` and gets `onTime(t, duration)` on a
 *   5 s tick plus one last write on close — never on `timeupdate`. video.js never imports a database.
 * - `onClose` must history-back: the app routes the overlay, so the system Back closes it.
 * @module
 */
// GENERATED by tools/dts.mjs from packages/runtime/video.js — edit the JSDoc there, never this file.
/**
 * Attach a stream url to a `<video>` element, choosing hls.js, the native element or progressive playback; never throws.
 * @param video the `<video>` element
 * @param url the stream url (HLS manifest or progressive file)
 * @param opts `onReady` (first frame / manifest), `onError` (fatal failure), `type` ("hls" | "progressive" | null to sniff)
 * @returns a handle whose `destroy()` fully tears playback down
 */
export function createPlayer(video: any, url: any, { onReady, onError, type }?: {
    onReady?: () => void;
    onError?: () => void;
    type?: any;
}): Promise<{
    destroy(): void;
}>;
/**
 * Full-screen video overlay component: connecting skeleton → playing (PiP, fullscreen, wake lock) or unavailable.
 * @param props `url`, `title`, `locale`, `onClose` (history-backed), `poster`, `startAt` (seconds), `onTime(t, duration)` progress callback, `type` (see createPlayer)
 * @returns the rendered overlay
 */
export function Player({ url, title, locale, onClose, poster, startAt, onTime, type }: {
    url: any;
    title: any;
    locale?: string;
    onClose: any;
    poster: any;
    startAt?: number;
    onTime: any;
    type?: any;
}): any;
