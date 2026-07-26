// reel — paste any page URL and every video on it becomes a full-screen, vertically-swiped feed (tiktok-style),
// with the next pages loading themselves as you approach the end. Three views:
//   • reel    — the full-bleed media surface (autoplay-the-visible-slide, poster, tap-to-pause, error state)
//   • liked   — the poster grid of what you double-tapped; a tile opens the feed RIGHT HERE, in this tab
//   • sources — your subscribed pages, grouped by site, + ready-made channels; tap to play, subscribe
// Heavy lifting is systemic: /_rt/video.js createPlayer() owns mp4-vs-HLS attach+teardown+errors; the VPS
// /feed/videos endpoint owns extraction (per-item title+poster+page via JSON-LD / <video> attrs / proximity);
// /_rt/sitelabel.js owns "what is this page called"; /_rt/gesture.js owns the drag.
//
// THE DIVE (see RESEARCH.md): every extracted clip carries the page it was found on. Drag a slide sideways
// and that page becomes the next source — the site's own "related videos", as deep as you care to go. Each
// dive pushes a FRAME (the whole feed state: items, cursor, slide, source), so coming back is a restore, not
// a refetch: you land on the exact clip you left, mid-list, and keep going. The stack is history-backed via
// the runtime's S.stack, so the system Back button walks it back one level at a time and never exits the app.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { T } from "/_rt/i18n.js";
import { Island } from "/_rt/ui.js";
import { createPlayer } from "/_rt/video.js";
import { VPS_PROXY, pool } from "/_rt/feed.js";
import { gate } from "/_rt/gate.js";
import { dedupeVideos, isBlackSample, isFlatSample, hasPoster } from "/_rt/vfilter.js";
import { resolveSearch, buildSearchUrl } from "/_rt/urlquery.js";
import { hostOf, pageLabel, siteName, groupByDomain } from "/_rt/sitelabel.js";
import { useTap, usePanX } from "/_rt/gesture.js";
import { letterTile } from "/_rt/tile.js";
import { reject } from "lodash-es";
import { collection, idbSupported } from "/_rt/db.js";
import { Pixels } from "/_rt/skeleton.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
// Route playback through the reverse proxy: a signed/expiring URL was signed for the VPS IP (that fetched the
// page), so re-fetching it from the VPS (within its window) keeps the token valid — where a direct hit fails.
const framed = (u) => `${VPS_PROXY}/frame?url=${encodeURIComponent(u)}`;

// Ready-made channels — ONLY sources verified to extract THROUGH THE PROXY (the VPS datacenter IP matters:
// Cloudflare-guarded sites like Pexels return nothing from it, exactly like the AliExpress lesson). They are
// grouped by site in the Sources tab, so several pages of one site read as one channel with its own pages.
const PRESETS = [
  { name: "Mixkit", url: "https://mixkit.co/free-stock-video/" },
  { name: "Space", url: "https://mixkit.co/free-stock-video/space/" },
  { name: "Nature", url: "https://mixkit.co/free-stock-video/nature/" },
  { name: "Aerial", url: "https://mixkit.co/free-stock-video/aerial/" },
  { name: "Abstract", url: "https://mixkit.co/free-stock-video/abstract/" },
  { name: "Dareful 4K", url: "https://dareful.com/" },
  { name: "Coverr", url: "https://coverr.co/" },
  { name: "Wikimedia Commons", url: "https://commons.wikimedia.org/wiki/Category:Animations" },
  { name: "Underwater", url: "https://commons.wikimedia.org/wiki/Category:Underwater_videos" },
  { name: "Time-lapse", url: "https://commons.wikimedia.org/wiki/Category:Time-lapse_videos" },
];
const DEFAULT_SRC = PRESETS[0].url;
// Solid 8×8 PNGs (raster → never taint a canvas) that seed the poster filter end-to-end: data: posters are
// analysed even under the gate (no network), remote ones are not. BLACK_PX → a broken/black poster;
// GREY_PX → a flat single-colour placeholder a CDN serves when it has no real thumbnail (isFlatSample).
const BLACK_PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAAAAADhZOFXAAAAEklEQVR4nGJgoA4AAAAA//8DAABIAAFYHHymAAAAAElFTkSuQmCC";
const GREY_PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFUlEQVR4nGJowAEYhpYEAAAA//8DAILzYAFRMt2JAAAAAElFTkSuQmCC";
// Headless gate / ?mock: seed a populated reel from public-domain clips (a poster on one so the poster path is
// exercised) — the live layout, never the empty state, is what the gate measures. The last three entries are
// deliberately BAD: a duplicate of Big Buck Bunny (dedupe drops it), a black/broken poster (black filter drops
// it) and a flat-grey placeholder poster (flat filter drops it) — so all three cleanups are provable in the
// gate. After filtering, three good clips remain. Every clip carries a `page`, because the page IS the dive.
const GV = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/";
const MOCK = [
  { video: GV + "BigBuckBunny.mp4", title: "Big Buck Bunny", poster: GV + "images/BigBuckBunny.jpg", page: "https://mixkit.co/free-stock-video/space/" },
  { video: GV + "ElephantsDream.mp4", title: "Elephants Dream", poster: null, page: "https://mixkit.co/free-stock-video/nature/" },
  { video: GV + "Sintel.mp4", title: "Sintel", poster: null, page: "https://mixkit.co/free-stock-video/aerial/" },
  { video: GV + "BigBuckBunny.mp4", title: "Big Buck Bunny dup", poster: null, page: "https://mixkit.co/free-stock-video/space/" },
  { video: GV + "ForBiggerBlazes.mp4", title: "Broken clip", poster: BLACK_PX, page: "https://mixkit.co/free-stock-video/space/" },
  { video: GV + "ForBiggerEscapes.mp4", title: "Flat placeholder", poster: GREY_PX, page: "https://mixkit.co/free-stock-video/space/" },
];
// What a DIVE lands on under the gate: a different, recognisable batch, so "the feed actually changed" and
// "back restored the old one" are both assertable without a network. Its clips dive one level deeper again.
const MOCK_DEEP = [
  { video: GV + "ForBiggerFun.mp4", title: "Deeper one", poster: null, page: "https://mixkit.co/free-stock-video/abstract/" },
  { video: GV + "ForBiggerJoyrides.mp4", title: "Deeper two", poster: null, page: "https://mixkit.co/free-stock-video/abstract/" },
];

const $src = persistentAtom("reel:src", DEFAULT_SRC);
// "Open site" opens the source's real website in the external browser. (The in-app reverse-proxy iframe was
// removed — heavy/anti-bot sites never rendered reliably through the datacenter-IP proxy.) The reel is the tap.
function openSite(s) { if (typeof window !== "undefined") window.open(s.url, "_blank", "noopener"); }
// Subscriptions live in IndexedDB (the runtime's collection() store) — a real DB, not localStorage. $subs is a
// reactive mirror the views read; writes go to both (optimistic atom + async idb). Headless/no-idb: atom only.
const subsDB = collection("reelSubs");
const $subs = atom([]);
if (idbSupported && !gate) subsDB.all().then((rows) => $subs.set(rows)).catch(() => {});
async function subscribe(s) {
  if (!s?.url || $subs.get().some((x) => x.url === s.url)) return;
  const rec = { name: s.name || pageLabel(s.url), url: s.url };
  $subs.set([{ id: s.url, ...rec }, ...$subs.get()]);
  try { await subsDB.put(s.url, rec); } catch { /* no idb (headless) — the atom still holds it this session */ }
}
async function unsubscribe(url) {
  $subs.set($subs.get().filter((x) => x.url !== url));
  try { await subsDB.remove(url); } catch { /* */ }
}

// Watch history (IndexedDB) — a video counts as watched after it dwells as the active slide (not a fly-by), and
// is then filtered out of future loads. $watched mirrors the store as a Set for O(1) lookups during filtering.
const watchedDB = collection("reelWatched");
const $watched = atom(new Set());
if (idbSupported && !gate) watchedDB.all().then((rows) => $watched.set(new Set(rows.map((r) => r.id)))).catch(() => {});
function markWatched(url) {
  if (!url || $watched.get().has(url)) return;
  const s = new Set($watched.get()); s.add(url); $watched.set(s);
  watchedDB.put(url, {}).catch(() => {});
}
function clearWatched() { $watched.set(new Set()); watchedDB.clear().catch(() => {}); }
const unseen = (arr) => arr.filter((i) => !$watched.get().has(i.orig || i.video));         // key on the stable original URL

// Liked reels (IndexedDB) — a double-tap on a slide saves it; the Liked tab lists them and is the ONLY place
// to remove one. Keyed by the STABLE original URL (orig || video), which is globally unique across sources, so
// likes from different sources (xvideos, pornhub, mixkit…) coexist and never duplicate. Each record carries its
// host + the per-item `eph` flag so the Liked feed replays a mix of ephemeral and inline clips correctly.
// Under the gate it is SEEDED: the grid is measured populated, and the in-tab feed is testable without a
// double-tap (the e2e surface can't dispatch two taps inside useTap's 260 ms window).
const likesDB = collection("reelLikes");
const likeId = (i) => i.orig || i.video;
const GATE_LIKES = MOCK.slice(0, 3).map((i, n) => ({ id: likeId(i), video: i.video, orig: null, poster: null, page: i.page, title: i.title, host: hostOf(i.page), eph: false, ts: 1000 - n }));
const $likes = atom(gate ? GATE_LIKES : []);
if (idbSupported && !gate) likesDB.all().then((rows) => $likes.set(rows)).catch(() => {});
function addLike(i) {                                                                       // double-tap → save; dedupe (never store twice)
  const id = likeId(i); if (!id || $likes.get().some((l) => l.id === id)) return;
  const rec = { id, video: i.video, orig: i.orig || null, poster: i.poster || null, page: i.page || null, title: i.title || null, host: hostOf(i.page || i.orig || i.video), eph: i.eph != null ? i.eph : $ephemeral.get(), ts: Date.now() };
  $likes.set([rec, ...$likes.get()]);
  likesDB.put(id, rec).catch(() => { /* headless / no idb — atom still holds it this session */ });
}
function unlike(id) {                                                                       // remove — only from the Liked tab
  $likes.set($likes.get().filter((l) => l.id !== id));
  likesDB.remove(id).catch(() => {});
}

const $items = atom(gate ? dedupeVideos(MOCK) : []);
const $next = atom(null);
const $loading = atom(!gate);
const $err = atom(false);
const $active = atom(0);
const $ephemeral = atom(false);   // source hands out signed/expiring URLs → show poster + "watch" link, don't play
let booted = false;               // the very first feed load happens once, on the first mount — never on a re-mount

// ── navigation: the dive stack ──────────────────────────────────────────────────────────────────────────
// $frames holds the feed states you can go BACK to, deepest last. Its length is mirrored into the runtime's
// S.stack, which is what turns each level into one history entry — so the system Back button, the island's
// back chevron and a rightward drag are three doors into the same single path (S.stack → listener → restore).
const $frames = atom([]);
const $restoreTo = atom(null);    // the slide the scroller must land on after a restore (null = nothing pending)
const $owner = atom("reel");      // which TAB owns the full-screen feed: "reel" | "liked" (a liked tile plays HERE)

const snapshot = (label) => ({ label, src: $src.get(), items: $items.get(), next: $next.get(), active: $active.get(), eph: $ephemeral.get(), owner: $owner.get(), err: $err.get() });
function restoreTop() {
  const fs = $frames.get(); if (!fs.length) return;
  const f = fs[fs.length - 1];
  $frames.set(fs.slice(0, -1));
  gen++;                                                    // anything still in flight for the abandoned source is stale
  loadingMore = false;
  $src.set(f.src); $items.set(f.items); $next.set(f.next); $ephemeral.set(f.eph);
  $owner.set(f.owner); $loading.set(false); $err.set(f.err);
  $active.set(f.active); $restoreTo.set(f.active);          // …and land on the exact slide you left
  // Never restore INTO a phantom skeleton: if you left that level before it ever filled, fetch it now.
  if (!f.items.length && !f.err && !gate) loadSource(f.src);
}
let bound = false;
function bindNav(S) {
  if (bound) return; bound = true;
  // ONE reaction for every way back: the runtime pops S.stack on system Back, and our own back button/drag
  // pop it too — either way the stack got shorter than the frames, so restore until they match.
  S.stack.listen((v) => { while ($frames.get().length > (v?.length || 0)) restoreTop(); });
}
function pushFrame(S, label) { $frames.set([...$frames.get(), snapshot(label)]); S.stack.set([...S.stack.get(), label]); }
function popFrame(S) { const st = S.stack.get(); if (st.length) S.stack.set(st.slice(0, -1)); }
function resetNav(S) { $frames.set([]); if (S.stack.get().length) S.stack.set([]); }        // frames first — the listener must find nothing to restore

// Where a slide dives to: the page the clip was extracted FROM. Never the media URL — a bare .mp4 is not an
// html page and extracting it returns nothing — and never the page we're already on.
function diveTarget(item, src) {
  const u = item?.page;
  if (!u || !/^https?:\/\//i.test(u)) return null;
  return u.replace(/#.*$/, "") === String(src).replace(/#.*$/, "") ? null : u;
}
function openSource(url) { $src.set(url); loadSource(url); }
function diveTo(S, url, label) {
  if (!url) return;
  pushFrame(S, label);
  navigator.vibrate?.(10);                                   // a gesture commit isn't a tap → the delegated haptic doesn't cover it
  openSource(url);
}

// ── blank-poster filter (black + flat placeholders) ─────────────────────────────────────────────────────
// A broken/placeholder poster renders as a dead slide: a solid black frame OR a single flat-colour fill a CDN
// serves when it has no real thumbnail. Both are dead weight (they don't play, and for CORS-locked/ephemeral
// sources the poster IS the whole slide). We sample each poster into a small canvas and drop the ones a real
// frame never produces — near-black (vfilter.isBlackSample) or uniform flat-fill (vfilter.isFlatSample). Remote
// posters are read through the /feed/frame CORS proxy so the canvas isn't tainted; data: posters load directly.
// Fail-open: anything we can't prove blank is kept. Applies to EVERY item — inline-playable and ephemeral alike.
const blankPosters = new Set();     // posters classified black/flat/broken → filtered out (+ dropped from future loads)
const checkedPosters = new Set();   // posters already analysed (don't re-fetch)
function posterIsBlank(poster) {
  const isData = poster.startsWith("data:");
  if (gate && !isData) return Promise.resolve(false);                                    // gate: no network — only inline posters
  if (typeof document === "undefined" || typeof Image === "undefined") return Promise.resolve(false);  // no DOM (preflight) → keep
  return new Promise((resolve) => {
    const img = new Image(); if (!isData) img.crossOrigin = "anonymous";
    let done = false; const finish = (v) => { if (!done) { done = true; clearTimeout(to); resolve(v); } };
    const to = setTimeout(() => finish(false), 6000);                                     // slow poster → keep (fail-open)
    img.onload = () => { try {
      const c = document.createElement("canvas"); c.width = 24; c.height = 24;
      const cx = c.getContext("2d", { willReadFrequently: true }); cx.drawImage(img, 0, 0, 24, 24);
      const px = cx.getImageData(0, 0, 24, 24).data;
      finish(isBlackSample(px) || isFlatSample(px));                                       // black OR uniform flat-fill → blank
    } catch { finish(false); } };                                                          // tainted / decode error → keep
    img.onerror = () => finish(false);
    img.src = isData ? poster : framed(poster);
  });
}
async function checkBlankPosters() {
  const todo = [];
  for (const it of $items.get()) { const p = it.poster; if (p && !checkedPosters.has(p)) { checkedPosters.add(p); todo.push(p); } }
  if (!todo.length) return;
  const hits = new Set();
  await pool(todo, 4, async (p) => { if (await posterIsBlank(p)) hits.add(p); });          // small concurrency — don't hammer the proxy
  if (hits.size) { hits.forEach((p) => blankPosters.add(p)); $items.set(reject($items.get(), (i) => i.poster && hits.has(i.poster))); }
}
// One pipeline for every incoming batch: unseen (watched) → drop already-known-blank posters → optionally drop
// posterless clips → dedupe. requirePoster is set ONLY for ephemeral sources, where a clip with no poster is a
// guaranteed-blank watch-link slide (nothing to show, won't play inline); inline sources keep posterless clips
// (they still play, with a video backdrop). Blanks are rejected BEFORE dedupe so a blank never wins a dup's slot.
function clean(arr, { requirePoster = false } = {}) {
  let out = reject(unseen(arr), (i) => i.poster && blankPosters.has(i.poster));
  if (requirePoster) out = out.filter(hasPoster);
  return dedupeVideos(out);
}

let loadingMore = false, gen = 0;
async function loadSource(url, append = false) {
  if (append) { if (loadingMore || !url) return; loadingMore = true; }
  else { $loading.set(true); $err.set(false); $items.set([]); $next.set(null); $active.set(0); $restoreTo.set(0); }   // a new source starts at its top, wherever you dived from
  const g = append ? gen : ++gen;                            // a dive/back mid-flight makes this response stale
  if (gate) {                                                // the gate never fetches: a deterministic batch per source
    if (!append) { $items.set(clean(url === DEFAULT_SRC ? MOCK : MOCK_DEEP)); $ephemeral.set(false); $loading.set(false); }
    loadingMore = false; return;
  }
  try {
    const r = await fetch(`${VPS_PROXY}/videos?url=${encodeURIComponent(url)}`);
    const d = await r.json();
    if (g !== gen) return;                                   // you already moved on — never inject into the new feed
    // ephemeral (signed, poster-only) is known BEFORE cleaning → require a poster so no-poster clips (dead
    // blank watch-link slides) are dropped. On append the source doesn't change, so reuse the current flag.
    const eph = append ? $ephemeral.get() : !!d.ephemeral;
    const got = clean(Array.isArray(d.items) ? d.items : [], { requirePoster: eph });
    $items.set(append ? dedupeVideos([...$items.get(), ...got]) : got);                   // re-dedupe across the page boundary too
    $next.set(d.next || null);
    if (!append) $ephemeral.set(eph);                  // signed/expiring source → show poster + "watch" link, don't try to play
  } catch { if (g === gen && !append) $err.set(true); }
  finally { if (g === gen) $loading.set(false); if (append) loadingMore = false; }
}

// The site's real favicon, falling back to a deterministic letter tile (a data-URI SVG — no fetch, so it is
// identical offline and in the gate). Never an emoji, never a coloured blob per source.
function Favicon({ url, size = "w-6 h-6" }) {
  const [failed, setFailed] = useState(false);
  const cls = `${size} rounded-lg object-contain shrink-0`;
  return failed
    ? html`<img src=${letterTile(siteName(url), { w: 64, h: 64, light: 30 })} alt="" class=${`${cls} object-cover`} />`
    : html`<img src=${`https://${hostOf(url)}/favicon.ico`} alt="" loading="lazy" class=${`${cls} bg-base-content/10`} onError=${() => setFailed(true)} />`;
}

// Blanking fill: a poster shown full-frame (object-contain) over a blurred scaled copy of itself — no black bars,
// nothing cropped. Reused by the preview/inactive slides and the video-error fallback.
const PosterFill = ({ poster }) => poster ? html`<${Fragment}>
  <img src=${poster} alt="" aria-hidden="true" class="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-55" onError=${(e) => e.currentTarget.remove()} />
  <img src=${poster} alt="" loading="lazy" class="absolute inset-0 w-full h-full object-contain" onError=${(e) => e.currentTarget.remove()} />
</${Fragment}>` : null;
// Informational "watch on the site" pill for clips that can't play inline (ephemeral / errored). It's NOT the
// tap target — the slide's tap handler owns single-tap → open, double-tap → like (so a like never navigates).
// The keyboard-accessible way to open the page stays the bottom-right open-original link on the slide.
const WatchLink = ({ t }) => html`<div data-watch aria-hidden="true" class="absolute inset-0 z-[3] flex items-end justify-center pointer-events-none" style="padding-bottom:calc(var(--dock-h) + env(safe-area-inset-bottom) + 4.5rem)">
  <span class="btn btn-primary rounded-full gap-2 shadow-lg pointer-events-none">${Icon("lucide:external-link", "text-lg")} ${T(t, "watch")}</span>
</div>`;

// The single live <video>, mounted only in the ACTIVE slide (so exactly one plays). createPlayer handles mp4 vs
// HLS and tears down on unmount. On failure it falls back to the poster + a "watch" link (not a dead black slide).
function VideoLayer({ item, t }) {
  const ref = useRef(), bgRef = useRef();
  const [errored, setErrored] = useState(false);
  useEffect(() => {
    setErrored(false);
    const v = ref.current; if (!v) return;
    v.muted = true; v.loop = true;                                                        // muted → browsers allow autoplay
    let handle, bgHandle, dead = false;
    createPlayer(v, item.video, { onReady: () => v.play?.().catch(() => {}), onError: () => setErrored(true) }).then((h) => { if (dead) h?.destroy?.(); else handle = h; });
    // ambient backdrop: when there's no poster to blur, a muted copy of the video fills the letterbox area.
    if (!item.poster && bgRef.current) { const bg = bgRef.current; bg.muted = true; bg.loop = true; createPlayer(bg, item.video, { onReady: () => bg.play?.().catch(() => {}) }).then((h) => { if (dead) h?.destroy?.(); else bgHandle = h; }); }
    return () => { dead = true; handle?.destroy?.(); bgHandle?.destroy?.(); };
  }, [item.video]);
  return html`<${Fragment}>
    ${errored
      ? html`<${PosterFill} poster=${item.poster} />`
      : item.poster
        ? html`<img src=${item.poster} alt="" aria-hidden="true" class="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-60" onError=${(e) => e.currentTarget.remove()} />`
        : html`<video ref=${bgRef} aria-hidden="true" muted loop playsinline class="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50"></video>`}
    <div class="absolute inset-0 bg-black/25" aria-hidden="true"></div>
    <video ref=${ref} data-main playsinline loop muted class=${`absolute inset-0 w-full h-full object-contain ${errored ? "opacity-0" : ""}`}></video>
    ${errored ? html`<${WatchLink} t=${t} />` : null}
  </${Fragment}>`;
}

// Heart burst — the like animation that blooms under the finger on a double-tap. There is deliberately NO
// persistent like-state UI on slides (that would subscribe every slide to the likes store — wasteful); the
// heart just plays once and fades, and the save is silent + deduped. Removal happens only in the Liked tab.
function HeartBurst({ x, y, onDone }) {
  const ref = useRef();
  useEffect(() => {
    const anim = ref.current?.animate?.([
      { transform: "translate(-50%,-50%) scale(.3) rotate(-12deg)", opacity: 0 },
      { transform: "translate(-50%,-50%) scale(1.15) rotate(-4deg)", opacity: 1, offset: .28 },
      { transform: "translate(-50%,-50%) scale(1) rotate(0deg)", opacity: 1, offset: .62 },
      { transform: "translate(-50%,-50%) scale(1.5) rotate(4deg)", opacity: 0 },
    ], { duration: 720, easing: "cubic-bezier(.22,1,.36,1)" });
    if (anim) anim.onfinish = () => onDone?.(); else onDone?.();
    return () => { if (anim) anim.onfinish = null; };
  }, []);
  return html`<div ref=${ref} aria-hidden="true" class="absolute z-[5] pointer-events-none" style=${`left:${x}px;top:${y}px`}>${Icon("lucide:heart", "text-7xl text-rose-500 fill-rose-500 drop-shadow-[0_2px_16px_rgba(0,0,0,.45)]")}</div>`;
}

function Slide({ item, idx, active, ephemeral, dive, t }) {
  const secRef = useRef();
  const [burst, setBurst] = useState(null);
  // Systemic tap dispatch (runtime useTap): SINGLE tap toggles pause on a clip that plays inline, else opens the
  // source page; DOUBLE tap likes + blooms a heart — and never fires the single (so a like never pauses/navigates).
  const onTap = useTap({
    onSingle: () => {
      const v = secRef.current?.querySelector("video[data-main]");
      if (v && !v.error) { try { v.paused ? v.play?.().catch(() => {}) : v.pause?.(); } catch { /* */ } return; }
      const href = item.page || item.orig || item.video;                                   // ephemeral / errored → open the source page
      if (href && typeof window !== "undefined") window.open(href, "_blank", "noopener");
    },
    onDouble: (p) => { setBurst({ x: p.x, y: p.y, k: Date.now() }); addLike(item); navigator.vibrate?.(12); },
  });
  return html`<section ref=${secRef} data-reel data-idx=${idx} onClick=${onTap} class="snap-start snap-always relative h-[100dvh] w-full flex items-center justify-center bg-black overflow-hidden">
    ${ephemeral
      ? html`<${Fragment}><${PosterFill} poster=${item.poster} /><${WatchLink} t=${t} /></${Fragment}>`
      : active
        ? html`<${VideoLayer} item=${item} t=${t} />`
        : item.poster
          ? html`<${PosterFill} poster=${item.poster} />`
          : null}
    ${burst ? html`<${HeartBurst} x=${burst.x} y=${burst.y} key=${burst.k} onDone=${() => setBurst(null)} />` : null}
    <div class="absolute inset-x-0 bottom-0 z-[2] pointer-events-none p-4 flex items-end justify-between gap-2" style="padding-bottom:calc(var(--dock-h) + 1rem)">
      ${dive ? html`<button data-dive class="pointer-events-auto flex items-center gap-1.5 min-w-0 max-w-[70%] rounded-full bg-black/45 backdrop-blur-md border border-white/10 pl-2.5 pr-2 py-1 text-white/90 active:bg-black/65" aria-label=${T(t, "dive")} onClick=${(e) => { e.stopPropagation(); dive.go(); }}>
        <span class="text-xs truncate">${pageLabel(dive.to)}</span>${Icon("lucide:chevron-right", "text-base opacity-70 shrink-0")}
      </button>` : html`<span></span>`}
      <a href=${item.page || item.orig || item.video} target="_blank" rel="noopener" onClick=${(e) => e.stopPropagation()} class="pointer-events-auto shrink-0 text-white/70 active:text-white p-1" aria-label=${T(t, "openOrig")}>${Icon("lucide:external-link", "text-lg")}</a>
    </div>
  </section>`;
}

function SourceSheet({ S, t }) {
  const [val, setVal] = useState("");
  const [q, setQ] = useState("");
  const norm = () => { const u = val.trim(); return u ? (/^https?:\/\//i.test(u) ? u : "https://" + u) : ""; };
  const goto = (url) => { subscribe({ name: pageLabel(url), url }); resetNav(S); $owner.set("reel"); openSource(url); S.tab.set("reel"); S.screen.set(null); };
  const load = (e) => { e?.preventDefault?.(); const url = norm(); if (!url) return S.screen.set(null); goto(url); };
  // A pasted results URL (`…/search?q=…`) is searchable → offer to swap the term and play those results.
  const sr = resolveSearch(norm());
  const search = (e) => { e?.preventDefault?.(); const url = norm(), term = q.trim(); if (url && term) goto(buildSearchUrl(url, term)); };
  return html`<div class="fixed inset-0 z-40 flex items-end" role="dialog" aria-modal="true" aria-label=${T(t, "srcTitle")}>
    <button class="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-label=${T(t, "close")} onClick=${() => S.screen.set(null)}></button>
    <form onSubmit=${load} class="relative w-full max-w-xl mx-auto bg-base-100 rounded-t-3xl p-5 flex flex-col gap-3" style="padding-bottom:calc(env(safe-area-inset-bottom) + 1.5rem)">
      <div class="flex items-center justify-between">
        <h2 class="font-bold text-lg flex items-center gap-2">${Icon("lucide:link", "text-primary")} ${T(t, "srcTitle")}</h2>
        <button type="button" class="btn btn-ghost btn-sm btn-circle" aria-label=${T(t, "close")} onClick=${() => S.screen.set(null)}>${Icon("lucide:x", "text-xl")}</button>
      </div>
      <label class="input input-bordered flex items-center gap-2 rounded-2xl">
        ${Icon("lucide:globe", "opacity-50 shrink-0")}
        <input id="src-input" type="url" inputmode="url" autocomplete="off" class="grow min-w-0" placeholder=${T(t, "srcPlaceholder")} aria-label=${T(t, "srcTitle")} value=${val} onInput=${(e) => setVal(e.target.value)} />
      </label>
      ${sr.searchable ? html`<div class="flex gap-2">
        <label class="input input-bordered flex items-center gap-2 rounded-2xl flex-1">
          ${Icon("lucide:search", "opacity-50 shrink-0")}
          <input id="sheet-search" type="search" inputmode="search" autocomplete="off" class="grow min-w-0" placeholder=${T(t, "searchPh")} aria-label=${T(t, "search")} value=${q} onInput=${(e) => setQ(e.target.value)} />
        </label>
        <button type="button" class="btn btn-primary rounded-2xl gap-1 shrink-0" onClick=${search}>${Icon("lucide:search")} ${T(t, "search")}</button>
      </div>` : null}
      <button id="src-load" type="submit" class="btn btn-primary rounded-2xl gap-1">${Icon("lucide:play")} ${T(t, "load")}</button>
    </form>
  </div>`;
}

// ---- the feed surface (shared by the Reel tab and the in-place Liked feed) ---------------------------
// The source island: who am I watching, one level back, and — when you've dived somewhere you don't follow —
// the one-tap subscribe. It only exists when it has something to say (you're deep, or this source is new),
// so an ordinary subscribed feed stays a clean full-bleed surface. It sits UNDER the app bar, not over it.
function SourceIsland({ S, t, src, subbed, depth }) {
  if (!depth && subbed) return null;
  return html`<${Island} pinned at="top" tone="dark" className="flex items-center gap-1.5 min-w-0 max-w-full rounded-full">
      ${depth ? html`<button data-feed-back class="btn btn-ghost btn-sm btn-circle text-white shrink-0" aria-label=${T(t, "back")} onClick=${() => popFrame(S)}>${Icon("lucide:chevron-left", "text-xl")}</button>` : null}
      <${Favicon} url=${src} size="w-6 h-6" />
      <span class="min-w-0 flex items-baseline gap-1.5 pl-0.5 pr-1">
        <span data-island-label class="text-sm text-white truncate min-w-0">${pageLabel(src)}</span>
        <span class="text-[0.7rem] font-mono text-white/70 truncate min-w-0 hidden min-[380px]:inline">${hostOf(src)}</span>
      </span>
      ${/* a hairline glass circle, not a filled ink pill: on a media surface the island is a quiet identity
            chip, and a solid white button made "subscribe" the brightest thing on a full-screen video */""}
      ${!subbed ? html`<button data-subscribe class="btn btn-sm btn-circle bg-white/10 border border-white/20 text-white shrink-0" aria-label=${T(t, "sub")} onClick=${() => subscribe({ name: pageLabel(src), url: src })}>${Icon("lucide:plus", "text-lg")}</button>` : null}
    <//>
  `;
}

// What the drag reveals underneath the feed: the destination, on the side the finger is uncovering. Painted
// by ref (opacity written straight to the nodes from usePanX's onDrag) — a re-render per pointermove would
// stutter the very gesture it is drawing.
function DragReveal({ underRef, diveRef, backRef, target, prev }) {
  return html`<div ref=${underRef} aria-hidden="true" class="fixed inset-0 z-0 bg-base-200 opacity-0">
    ${prev ? html`<div ref=${backRef} class="absolute inset-y-0 left-0 w-40 flex flex-col items-center justify-center gap-2 px-3 text-center opacity-0">
      ${Icon("lucide:corner-up-left", "text-2xl text-primary")}
      <span class="text-sm font-medium text-base-content truncate max-w-full">${prev.label}</span>
    </div>` : null}
    ${target ? html`<div ref=${diveRef} class="absolute inset-y-0 right-0 w-40 flex flex-col items-center justify-center gap-2 px-3 text-center opacity-0">
      <${Favicon} url=${target} size="w-10 h-10" />
      <span class="text-sm font-medium text-base-content truncate max-w-full">${pageLabel(target)}</span>
      ${Icon("lucide:chevrons-right", "text-2xl text-primary")}
    </div>` : null}
  </div>`;
}

function FeedSurface({ S, t }) {
  const items = useStore($items), loading = useStore($loading), err = useStore($err);
  const active = useStore($active), next = useStore($next), ephemeral = useStore($ephemeral);
  const src = useStore($src), frames = useStore($frames), subs = useStore($subs), restoreTo = useStore($restoreTo);
  const underRef = useRef(), diveRef = useRef(), backRef = useRef();
  const target = diveTarget(items[active], src);
  const prev = frames.length ? frames[frames.length - 1] : null;

  // The drag IS the navigation: pull the reel left to fall into the page this clip came from, right to come
  // back. The pane follows the finger 1:1 (usePanX), so it reads as moving the reel itself, not pressing a
  // button; `touch-pan-y` keeps the vertical scroll native, and a real drag swallows the tap it would fire.
  const { paneRef, pan } = usePanX({
    threshold: 64,                                                   // a full-screen move deserves a firmer commit than a card flick
    canNext: !!target, canPrev: frames.length > 0,
    onNext: () => diveTo(S, target, pageLabel(src)),
    onPrev: () => popFrame(S),
    onDrag: (dx) => {
      const u = underRef.current; if (!u) return;
      u.style.opacity = String(Math.min(1, Math.abs(dx) / 110));
      if (diveRef.current) diveRef.current.style.opacity = dx < 0 ? "1" : "0";
      if (backRef.current) backRef.current.style.opacity = dx > 0 ? "1" : "0";
    },
  });

  useEffect(() => {
    bindNav(S);
    if (!booted) { booted = true; if (!gate) loadSource($src.get()); }
    else if ($active.get() > 0) $restoreTo.set($active.get());        // re-mounted (tab switch) → keep your place
    // Tell the document a black media surface is up: index.html restyles the app bar light for as long as
    // it is (in signal-light the bar's own background never lands under a fixed full-bleed surface, and its
    // near-black title sat on black at ~1.2:1 — invisible, and axe can't see a stacking-context problem).
    const root = document.documentElement;
    root.setAttribute("data-feed", "");
    return () => root.removeAttribute("data-feed");
  }, [S]);
  useEffect(() => { void checkBlankPosters(); }, [items]);            // sample new posters → drop black/flat/broken slides (gate: inline data: posters too)
  useEffect(() => { if (next && active >= items.length - 3) loadSource(next, true); }, [active, items.length, next]);
  useEffect(() => { const it = items[active]; if (!it || gate) return; const id = setTimeout(() => markWatched(it.orig || it.video), 2500); return () => clearTimeout(id); }, [active, items]);   // dwell → watched
  useEffect(() => {
    const root = paneRef.current; if (!root || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting && e.intersectionRatio >= 0.6) { const i = Number(e.target.dataset.idx); if (!Number.isNaN(i)) $active.set(i); } }, { root, threshold: [0.6] });
    root.querySelectorAll("[data-idx]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items]);                                                        // identity, not length: a restored list of the same size is still new DOM
  // Landing after a restore. Every slide is exactly one viewport tall under snap-mandatory, so the offset is
  // arithmetic — no measuring, no scrollIntoView race with the observer. Layout effect: before paint.
  useLayoutEffect(() => {
    if (restoreTo == null) return;
    const el = paneRef.current;
    if (el) el.scrollTop = restoreTo * (el.clientHeight || 0);
    $restoreTo.set(null);
  }, [restoreTo, items]);

  const body = loading
    ? html`<section class="h-[100dvh] w-full"><${Pixels} cls="w-full h-full" /></section>`
    : err
      ? html`<section class="h-[100dvh] w-full flex flex-col items-center justify-center gap-3 text-white/70 px-8 text-center">${Icon("lucide:cloud-off", "text-5xl")}<div>${T(t, "loadErr")}</div><button class="btn btn-sm btn-outline text-white border-white/25 rounded-2xl" onClick=${() => loadSource(src)}>${T(t, "retry")}</button></section>`
      : !items.length
        ? html`<section class="h-[100dvh] w-full flex flex-col items-center justify-center gap-3 text-white/60 px-8 text-center">${Icon("lucide:film", "text-5xl")}<div>${T(t, "empty")}</div><button class="btn btn-sm btn-outline text-white border-white/25 rounded-2xl" onClick=${() => S.tab.set("sources")}>${T(t, "changeSrc")}</button></section>`
        : items.map((it, i) => {
            const to = diveTarget(it, src);                                     // the page this clip lives on → the next feed
            const dive = to ? { to, go: () => diveTo(S, to, pageLabel(src)) } : null;
            return html`<${Slide} item=${it} idx=${i} active=${i === active} ephemeral=${it.eph != null ? it.eph : ephemeral} dive=${dive} t=${t} key=${(it.orig || it.video) + i} />`;
          });

  return html`<${Fragment}>
    <${DragReveal} underRef=${underRef} diveRef=${diveRef} backRef=${backRef} target=${target} prev=${prev} />
    <div ref=${paneRef} ...${pan} data-scroller class="fixed inset-0 z-[1] bg-black overflow-y-auto snap-y snap-mandatory overscroll-y-contain touch-pan-y will-change-transform">${body}</div>
    <${SourceIsland} S=${S} t=${t} src=${src} subbed=${subs.some((s) => s.url === src)} depth=${frames.length} />
  </${Fragment}>`;
}

// ---- reel (the feed) --------------------------------------------------------
export function reel({ S }) {
  const t = useStore(S.t), screen = useStore(S.screen);
  return html`<${Fragment}>
    <${FeedSurface} S=${S} t=${t} />
    ${screen === "source" ? html`<${SourceSheet} S=${S} t=${t} />` : null}
  </${Fragment}>`;
}

// ---- sources (subscriptions + ready channels, grouped by site) ---------------
// A site is the unit, not a URL: dive into a video's page, subscribe, and that page joins its site's card as
// another channel. Rows carry the page's TITLE (sitelabel.pageLabel, derived from the URL — no round-trip),
// because a truncated raw URL told you nothing and cost a whole line doing it.
function PageRow({ s, active, subbed, onPlay, onToggle, onOpen, lead, sub, t }) {
  const sr = resolveSearch(s.url);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState(sr.term || "");
  const submit = (e) => { e?.preventDefault?.(); const term = q.trim(); if (term) onPlay({ ...s, url: buildSearchUrl(s.url, term) }); };
  // The playing row is marked by a SHAPE, never by a luminance step: this theme's primary and base-content
  // are the same ink, so "active = text-primary" would be 100% vs 100% — the exact trap that hid the dock's
  // active tab for the life of the project. A filled tint + a rail you can see from across the room instead.
  return html`<li class=${`flex flex-col ${active ? "bg-base-content/[.07]" : ""}`}>
    <div class="flex items-center gap-0.5 pr-1">
      <button data-src-row class="flex items-center gap-2.5 flex-1 min-w-0 text-left px-2.5 py-2.5 rounded-xl active:bg-base-content/5" onClick=${() => onPlay(s)}>
        ${lead}
        <span class="min-w-0">
          <span class=${`block truncate ${active ? "font-semibold" : ""}`}>${pageLabel(s.url)}</span>
          ${sub ? html`<span class="block text-[0.7rem] font-mono text-base-content/70 truncate">${sub}</span>` : null}
        </span>
      </button>
      ${sr.searchable ? html`<button data-search-toggle class=${`btn btn-ghost btn-sm btn-circle shrink-0 ${searching ? "text-primary" : "opacity-70"}`} aria-label=${T(t, "search")} aria-pressed=${searching} onClick=${() => setSearching((v) => !v)}>${Icon("lucide:search", "text-lg")}</button>` : null}
      ${onOpen ? html`<button data-open-site class="btn btn-ghost btn-sm btn-circle shrink-0 opacity-70" aria-label=${T(t, "openSite")} onClick=${() => onOpen(s)}>${Icon("lucide:external-link", "text-lg")}</button>` : null}
      <button class=${`btn btn-ghost btn-sm btn-circle shrink-0 ${subbed ? "text-primary" : "opacity-50"}`} aria-label=${T(t, subbed ? "unsub" : "sub")} data-haptic=${subbed ? "bump" : "off"} onClick=${onToggle}>${Icon(subbed ? "lucide:check" : "lucide:plus", "text-lg")}</button>
    </div>
    ${searching ? html`<form onSubmit=${submit} class="flex items-center gap-2 px-2.5 pb-2.5">
      <label class="input input-sm input-bordered flex items-center gap-2 rounded-xl flex-1">
        ${Icon("lucide:search", "opacity-50 shrink-0 text-sm")}
        <input data-search-input type="search" inputmode="search" autocomplete="off" class="grow min-w-0" placeholder=${T(t, "searchPh")} aria-label=${T(t, "search")} value=${q} onInput=${(e) => setQ(e.target.value)} />
      </label>
      <button type="submit" class="btn btn-primary btn-sm btn-circle" aria-label=${T(t, "search")}>${Icon("lucide:play")}</button>
    </form>` : null}
  </li>`;
}

// One site. A single page renders as one self-contained row (a header above its only child would be the same
// line twice); two or more get a site header with the page count over hairline-separated page rows.
function DomainCard({ g, curSrc, subbedUrls, onPlay, onOpen, onToggle, t }) {
  const hot = g.items.some((s) => s.url === curSrc);
  const shell = `rounded-2xl border ${hot ? "border-primary/50 bg-primary/5" : "border-base-300 bg-base-100"}`;
  if (g.items.length === 1) {
    const s = g.items[0];
    return html`<ul class=${shell}><${PageRow} s=${s} active=${s.url === curSrc} subbed=${subbedUrls.has(s.url)} onPlay=${onPlay} onOpen=${onOpen} onToggle=${() => onToggle(s)} lead=${html`<${Favicon} url=${s.url} size="w-10 h-10" />`} sub=${g.domain} t=${t} /></ul>`;
  }
  return html`<section class=${`${shell} overflow-hidden`}>
    <header class="flex items-center gap-2.5 px-2.5 py-2.5 border-b border-base-300">
      <${Favicon} url=${g.items[0].url} size="w-10 h-10" />
      <div class="min-w-0 flex-1">
        <div class="font-semibold truncate leading-tight">${g.name}</div>
        <div class="text-[0.7rem] font-mono text-base-content/70 truncate">${g.domain}</div>
      </div>
      <span class="text-xs font-mono text-base-content/70 tabular-nums px-1">${g.items.length}</span>
      <button data-open-site class="btn btn-ghost btn-sm btn-circle shrink-0 opacity-70" aria-label=${T(t, "openSite")} onClick=${() => onOpen(g.items[0])}>${Icon("lucide:external-link", "text-lg")}</button>
    </header>
    <ul class="divide-y divide-base-300/60">
      ${g.items.map((s) => html`<${PageRow} s=${s} active=${s.url === curSrc} subbed=${subbedUrls.has(s.url)} onPlay=${onPlay} onToggle=${() => onToggle(s)} lead=${html`<span class=${`shrink-0 rounded-full ${s.url === curSrc ? "w-1.5 h-5 bg-primary" : "w-1.5 h-1.5 bg-base-content/30"}`}></span>`} t=${t} key=${s.url} />`)}
    </ul>
  </section>`;
}

export function sources({ S }) {
  const t = useStore(S.t), screen = useStore(S.screen);
  const subs = useStore($subs), curSrc = useStore($src), watchedN = useStore($watched).size;
  const play = (s) => { resetNav(S); $owner.set("reel"); openSource(s.url); S.tab.set("reel"); };
  const subbedUrls = new Set(subs.map((x) => x.url));
  const mine = groupByDomain(subs);
  const discover = groupByDomain(PRESETS.filter((p) => !subbedUrls.has(p.url)));

  return html`<${Fragment}>
    <div class="flex flex-col gap-4 @container">
      <button id="add-url" class="btn btn-primary rounded-2xl gap-2" onClick=${() => S.screen.set("source")}>${Icon("lucide:plus")} ${T(t, "addUrl")}</button>

      <div class="flex flex-col gap-2.5">
        <div class="text-sm font-semibold px-1 flex items-center gap-1.5">${Icon("lucide:bookmark", "text-primary")} ${T(t, "subs")}</div>
        ${mine.length
          ? mine.map((g) => html`<${DomainCard} g=${g} curSrc=${curSrc} subbedUrls=${subbedUrls} onPlay=${play} onOpen=${openSite} onToggle=${(s) => unsubscribe(s.url)} t=${t} key=${g.domain} />`)
          : html`<div class="text-sm text-base-content/70 px-1 py-3">${T(t, "noSubs")}</div>`}
      </div>

      ${discover.length ? html`<div class="flex flex-col gap-2.5">
        <div class="text-sm font-semibold px-1 flex items-center gap-1.5">${Icon("lucide:compass")} ${T(t, "discover")}</div>
        ${discover.map((g) => html`<${DomainCard} g=${g} curSrc=${curSrc} subbedUrls=${subbedUrls} onPlay=${play} onOpen=${openSite} onToggle=${(s) => subscribe(s)} t=${t} key=${g.domain} />`)}
      </div>` : null}

      ${watchedN > 0 ? html`<button id="clear-watched" class="btn btn-ghost btn-sm rounded-2xl gap-2 text-base-content/70 self-center mt-2" onClick=${clearWatched} data-haptic="bump">${Icon("lucide:rotate-ccw")} ${T(t, "clearWatched", { n: watchedN })}</button>` : null}
    </div>
    ${screen === "source" ? html`<${SourceSheet} S=${S} t=${t} />` : null}
  </${Fragment}>`;
}

// ---- liked (saved reels) ----------------------------------------------------
// A poster grid of the reels you double-tapped, newest first. Tapping a tile plays the liked collection AS A
// FEED RIGHT HERE — the Liked tab becomes the reel, no tab switch, and Back (system or the island chevron)
// brings the grid straight back with the source feed underneath untouched. Removal lives ONLY here.
export function liked({ S }) {
  const t = useStore(S.t), likes = useStore($likes), owner = useStore($owner);
  const sorted = [...likes].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  if (owner === "liked") return html`<${FeedSurface} S=${S} t=${t} />`;
  const playAt = (i) => {
    pushFrame(S, T(t, "tabLiked"));                       // …so Back returns to THIS grid, one step
    $owner.set("liked"); $ephemeral.set(false); $next.set(null); $err.set(false); $loading.set(false);
    $items.set([...sorted.slice(i), ...sorted.slice(0, i)]);
    $active.set(0); $restoreTo.set(0);
  };
  if (!sorted.length) return html`<div class="flex flex-col items-center justify-center gap-3 text-base-content/60 text-center" style="min-height:60vh">${Icon("lucide:heart", "text-6xl opacity-30")}<div class="text-sm max-w-[16rem]">${T(t, "likedEmpty")}</div></div>`;
  return html`<div data-liked class="grid grid-cols-3 gap-1.5">
    ${sorted.map((l, i) => html`<div class="relative aspect-[9/16] rounded-xl overflow-hidden bg-base-300" key=${l.id}>
      <button data-liked-tile class="absolute inset-0 w-full h-full active:scale-[.98] transition" aria-label=${l.title || l.host} onClick=${() => playAt(i)}>
        ${l.poster
          ? html`<img src=${l.poster} alt="" loading="lazy" class="absolute inset-0 w-full h-full object-cover" onError=${(e) => e.currentTarget.remove()} />`
          : html`<div class="absolute inset-0 flex items-center justify-center">${Icon("lucide:play", "text-2xl opacity-40")}</div>`}
        <div class="absolute inset-x-0 bottom-0 p-1.5 pt-6 bg-gradient-to-t from-black/75 to-transparent"><div class="text-[10px] text-white/90 truncate text-left">${l.title || l.host}</div></div>
      </button>
      <button class="absolute top-1 right-1 btn btn-xs btn-circle bg-black/45 border-0 text-rose-400 hover:bg-black/70" aria-label=${T(t, "unlike")} data-haptic="bump" onClick=${() => unlike(l.id)}>${Icon("lucide:heart", "text-sm fill-current")}</button>
    </div>`)}
  </div>`;
}
