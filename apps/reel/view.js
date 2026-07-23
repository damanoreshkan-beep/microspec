// reel — paste any page URL and every video on it becomes a full-screen, vertically-swiped feed (tiktok-style),
// with the next pages loading themselves as you approach the end. Two views:
//   • reel    — the full-bleed media surface (autoplay-the-visible-slide, poster, mute, tap-to-pause, error state)
//   • sources — your subscribed URLs + ready-made channels (with logos); tap to play, subscribe/unsubscribe
// Heavy lifting is systemic: /_rt/video.js createPlayer() owns mp4-vs-HLS attach+teardown+errors; the VPS
// /feed/videos endpoint owns extraction (per-item title+poster via JSON-LD / <video> attrs / DOM proximity).
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { T } from "/_rt/i18n.js";
import { createPlayer } from "/_rt/video.js";
import { VPS_PROXY, pool } from "/_rt/feed.js";
import { gate } from "/_rt/gate.js";
import { dedupeVideos, isBlackSample, isFlatSample, hasPoster } from "/_rt/vfilter.js";
import { uniqBy, reject } from "lodash-es";
import { collection, idbSupported } from "/_rt/db.js";
import { Pixels } from "/_rt/skeleton.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
// Route playback through the reverse proxy: a signed/expiring URL was signed for the VPS IP (that fetched the
// page), so re-fetching it from the VPS (within its window) keeps the token valid — where a direct hit fails.
const framed = (u) => `${VPS_PROXY}/frame?url=${encodeURIComponent(u)}`;

// Ready-made channels — ONLY sources verified to extract THROUGH THE PROXY (the VPS datacenter IP matters:
// Cloudflare-guarded sites like Pexels return nothing from it, exactly like the AliExpress lesson). Each shows
// the site's real favicon as its logo, falling back to an iconify vector (never emoji).
const PRESETS = [
  { name: "Mixkit", url: "https://mixkit.co/free-stock-video/", icon: "lucide:clapperboard", color: "#F03D4E" },
  { name: "Space", url: "https://mixkit.co/free-stock-video/space/", icon: "lucide:rocket", color: "#A78BFA" },
  { name: "Nature", url: "https://mixkit.co/free-stock-video/nature/", icon: "lucide:leaf", color: "#34D399" },
  { name: "Aerial", url: "https://mixkit.co/free-stock-video/aerial/", icon: "lucide:mountain", color: "#38BDF8" },
  { name: "Abstract", url: "https://mixkit.co/free-stock-video/abstract/", icon: "lucide:shapes", color: "#F472B6" },
  { name: "Dareful 4K", url: "https://dareful.com/", icon: "lucide:aperture", color: "#F59E0B" },
  { name: "Coverr", url: "https://coverr.co/", icon: "lucide:film", color: "#5B6CFF" },
  { name: "Wikimedia Commons", url: "https://commons.wikimedia.org/wiki/Category:Animations", icon: "simple-icons:wikimediacommons", color: "#3366CC" },
  { name: "Underwater", url: "https://commons.wikimedia.org/wiki/Category:Underwater_videos", icon: "lucide:waves", color: "#22D3EE" },
  { name: "Time-lapse", url: "https://commons.wikimedia.org/wiki/Category:Time-lapse_videos", icon: "lucide:timer", color: "#FB923C" },
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
// gate. After filtering, three good clips remain.
const MOCK = [
  { video: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4", title: "Big Buck Bunny", poster: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg" },
  { video: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4", title: "Elephants Dream", poster: null },
  { video: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4", title: "Sintel", poster: null },
  { video: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4", title: "Big Buck Bunny dup", poster: null },
  { video: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4", title: "Broken clip", poster: BLACK_PX },
  { video: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4", title: "Flat placeholder", poster: GREY_PX },
];

const $src = persistentAtom("reel:src", DEFAULT_SRC);
// Subscriptions live in IndexedDB (the runtime's collection() store) — a real DB, not localStorage. $subs is a
// reactive mirror the views read; writes go to both (optimistic atom + async idb). Headless/no-idb: atom only.
const subsDB = collection("reelSubs");
const $subs = atom([]);
if (idbSupported && !gate) subsDB.all().then((rows) => $subs.set(rows)).catch(() => {});
async function subscribe(s) {
  if ($subs.get().some((x) => x.url === s.url)) return;
  const rec = { name: s.name, url: s.url, icon: s.icon || "lucide:link", color: s.color || "#8b5cf6" };
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

const $items = atom(gate ? dedupeVideos(MOCK) : []);
const $next = atom(null);
const $loading = atom(!gate);
const $err = atom(false);
const $active = atom(0);
const $frameUrl = atom("");
const $ephemeral = atom(false);   // source hands out signed/expiring URLs → show poster + "watch" link, don't play

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

let loadingMore = false;
async function loadSource(url, append = false) {
  if (gate) return;                                                                      // gate uses the seeded mock
  if (append) { if (loadingMore || !url) return; loadingMore = true; }
  else { $loading.set(true); $err.set(false); $items.set([]); $next.set(null); $active.set(0); }
  try {
    const r = await fetch(`${VPS_PROXY}/videos?url=${encodeURIComponent(url)}`);
    const d = await r.json();
    // ephemeral (signed, poster-only) is known BEFORE cleaning → require a poster so no-poster clips (dead
    // blank watch-link slides) are dropped. On append the source doesn't change, so reuse the current flag.
    const eph = append ? $ephemeral.get() : !!d.ephemeral;
    const got = clean(Array.isArray(d.items) ? d.items : [], { requirePoster: eph });
    $items.set(append ? dedupeVideos([...$items.get(), ...got]) : got);                   // re-dedupe across the page boundary too
    $next.set(d.next || null);
    if (!append) $ephemeral.set(eph);                  // signed/expiring source → show poster + "watch" link, don't try to play
  } catch { if (!append) $err.set(true); }
  finally { $loading.set(false); loadingMore = false; }
}

// Blanking fill: a poster shown full-frame (object-contain) over a blurred scaled copy of itself — no black bars,
// nothing cropped. Reused by the preview/inactive slides and the video-error fallback.
const PosterFill = ({ poster }) => poster ? html`<${Fragment}>
  <img src=${poster} alt="" aria-hidden="true" class="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-55" onError=${(e) => e.currentTarget.remove()} />
  <img src=${poster} alt="" loading="lazy" class="absolute inset-0 w-full h-full object-contain" onError=${(e) => e.currentTarget.remove()} />
</${Fragment}>` : null;
// The "watch on the site" link — opens the video's real page (falls back to the clip URL). For signed sources
// whose clips won't play here, this is the whole point: browse the previews, tap through to watch.
// The whole slide is the tap target (browse previews → tap to watch), but the visible pill sits at the very
// bottom (above the dock + title) so it never covers the poster preview.
const WatchLink = ({ item, t }) => html`<a data-watch href=${item.page || item.orig || item.video} target="_blank" rel="noopener" class="absolute inset-0 z-[3] flex items-end justify-center" style="padding-bottom:calc(var(--dock-h) + env(safe-area-inset-bottom) + 4.5rem)" aria-label=${T(t, "watch")}>
  <span class="btn btn-primary rounded-full gap-2 shadow-lg pointer-events-none">${Icon("lucide:external-link", "text-lg")} ${T(t, "watch")}</span>
</a>`;

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
  const toggle = () => { const v = ref.current; if (v && !errored) (v.paused ? v.play?.().catch(() => {}) : v.pause?.()); };
  return html`<${Fragment}>
    ${errored
      ? html`<${PosterFill} poster=${item.poster} />`
      : item.poster
        ? html`<img src=${item.poster} alt="" aria-hidden="true" class="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-60" onError=${(e) => e.currentTarget.remove()} />`
        : html`<video ref=${bgRef} aria-hidden="true" muted loop playsinline class="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50"></video>`}
    <div class="absolute inset-0 bg-black/25" aria-hidden="true"></div>
    <video ref=${ref} onClick=${toggle} playsinline loop muted poster=${item.poster || ""} class=${`absolute inset-0 w-full h-full object-contain ${errored ? "opacity-0" : ""}`}></video>
    ${errored ? html`<${WatchLink} item=${item} t=${t} />` : null}
  </${Fragment}>`;
}

function Slide({ item, idx, active, ephemeral, t }) {
  return html`<section data-reel data-idx=${idx} class="snap-start snap-always relative h-[100dvh] w-full flex items-center justify-center bg-black overflow-hidden">
    ${ephemeral
      ? html`<${Fragment}><${PosterFill} poster=${item.poster} /><${WatchLink} item=${item} t=${t} /></${Fragment}>`
      : active
        ? html`<${VideoLayer} item=${item} t=${t} />`
        : item.poster
          ? html`<${Fragment}><${PosterFill} poster=${item.poster} /><div class="absolute inset-0 flex items-center justify-center">${Icon("lucide:play", "text-white/85 text-5xl drop-shadow-lg")}</div></${Fragment}>`
          : html`<div class="absolute inset-0 flex items-center justify-center">${Icon("lucide:play", "text-white/10 text-7xl")}</div>`}
    <div class="absolute inset-x-0 bottom-0 z-[2] pointer-events-none p-4 pt-16 bg-gradient-to-t from-black/75 via-black/25 to-transparent" style="padding-bottom:calc(var(--dock-h) + 1rem)">
      <div class="flex items-end gap-2">
        <div class="min-w-0 flex-1 text-white font-semibold text-sm leading-snug line-clamp-2" style="text-shadow:0 1px 6px rgba(0,0,0,.6)">${/[a-zа-яїієґ]/i.test(item.title || "") ? item.title : ""}</div>
        <a href=${item.page || item.orig || item.video} target="_blank" rel="noopener" class="pointer-events-auto shrink-0 text-white/70 active:text-white p-1" aria-label=${T(t, "openOrig")}>${Icon("lucide:external-link", "text-lg")}</a>
      </div>
    </div>
  </section>`;
}

function SourceSheet({ S, t }) {
  const [val, setVal] = useState("");
  const norm = () => { const u = val.trim(); return u ? (/^https?:\/\//i.test(u) ? u : "https://" + u) : ""; };
  const load = (e) => { e?.preventDefault?.(); const url = norm(); if (!url) return S.screen.set(null); subscribe({ name: hostOf(url), url, icon: "lucide:link" }); $src.set(url); S.tab.set("reel"); S.screen.set(null); };
  const browse = () => { const url = norm(); if (url) { $frameUrl.set(url); S.screen.set("frame"); } };            // interactive reverse-proxy view
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
      <div class="flex gap-2">
        <button id="src-load" type="submit" class="btn btn-primary rounded-2xl flex-1 gap-1">${Icon("lucide:play")} ${T(t, "load")}</button>
        <button id="src-browse" type="button" class="btn btn-outline rounded-2xl flex-1 gap-1" onClick=${browse}>${Icon("lucide:compass")} ${T(t, "browse")}</button>
      </div>
    </form>
  </div>`;
}

// Interactive reverse-proxy source view: the site rendered same-origin via /feed/frame (so its consent/age
// modals can be clicked; cookies jar server-side). The injected shim harvests <video> URLs and postMessages
// them here; "use" loads them into the reel. Heavy sites with datacenter-IP anti-bot may just show a challenge.
function FrameView({ S, t }) {
  const url = useStore($frameUrl);
  const [harvested, setHarvested] = useState([]);
  useEffect(() => {
    setHarvested([]);
    const onMsg = (e) => {
      if (!e.data || e.data.__reel !== "videos" || !Array.isArray(e.data.videos)) return;
      setHarvested((prev) => { const merged = uniqBy([...prev, ...e.data.videos.filter((v) => typeof v === "string").map((v) => ({ video: v, title: hostOf(url), poster: null }))], "video"); return merged.length > prev.length ? merged : prev; });
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [url]);
  // harvested URLs came from the proxied (VPS-IP) session → play them through the proxy so their tokens stay valid.
  const use = () => { const got = clean(harvested.map((h) => ({ ...h, orig: h.video, video: framed(h.video) }))); if (got.length) { $items.set(got); $next.set(null); $active.set(0); $ephemeral.set(true); subscribe({ name: hostOf(url), url, icon: "lucide:link" }); } S.screen.set(null); S.tab.set("reel"); };
  const iframeSrc = gate || !url ? "about:blank" : `${VPS_PROXY}/frame?url=${encodeURIComponent(url)}`;
  return html`<div class="fixed inset-0 z-40 bg-base-300 flex flex-col" role="dialog" aria-modal="true" aria-label=${hostOf(url)}>
    <div class="flex items-center gap-2 px-2 py-2 bg-base-100/90 backdrop-blur-md border-b border-base-300" style="padding-top:calc(env(safe-area-inset-top) + 0.5rem)">
      <button class="btn btn-ghost btn-sm btn-circle shrink-0" aria-label=${T(t, "close")} onClick=${() => S.screen.set(null)}>${Icon("lucide:x", "text-xl")}</button>
      <div class="flex-1 min-w-0 text-sm truncate text-base-content/70 font-mono">${hostOf(url)}</div>
      <button id="use-harvest" class=${`btn btn-sm rounded-2xl gap-1 shrink-0 ${harvested.length ? "btn-primary" : "btn-disabled opacity-50"}`} aria-label=${T(t, "openOrig")} onClick=${use}>${Icon("lucide:play")} ${harvested.length}</button>
    </div>
    <iframe data-frame src=${iframeSrc} sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation allow-modals" class="flex-1 w-full bg-white" title=${hostOf(url)}></iframe>
  </div>`;
}

// ---- reel (the feed) --------------------------------------------------------
export function reel({ S }) {
  const t = useStore(S.t), screen = useStore(S.screen);
  const items = useStore($items), loading = useStore($loading), err = useStore($err);
  const active = useStore($active), next = useStore($next), ephemeral = useStore($ephemeral);
  const src = useStore($src);
  const scroller = useRef();

  useEffect(() => { if (!gate) loadSource(src); }, [src]);
  useEffect(() => { void checkBlankPosters(); }, [items]);                                 // sample new posters → drop black/flat/broken slides (gate: inline data: posters too)
  useEffect(() => { if (next && active >= items.length - 3) loadSource(next, true); }, [active, items.length, next]);
  useEffect(() => { const it = items[active]; if (!it || gate) return; const id = setTimeout(() => markWatched(it.orig || it.video), 2500); return () => clearTimeout(id); }, [active, items]);   // dwell → watched
  useEffect(() => {
    const root = scroller.current; if (!root || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting && e.intersectionRatio >= 0.6) { const i = Number(e.target.dataset.idx); if (!Number.isNaN(i)) $active.set(i); } }, { root, threshold: [0.6] });
    root.querySelectorAll("[data-idx]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items.length]);

  const rail = html`<div class="fixed right-3 z-20 flex flex-col gap-2.5" style="bottom:calc(var(--dock-h) + 1.5rem)">
    <button id="source" class="btn btn-circle bg-black/40 border-white/15 text-white backdrop-blur-md active:scale-95" aria-label=${T(t, "changeSrc")} onClick=${() => S.tab.set("sources")}>${Icon("lucide:layout-grid", "text-xl")}</button>
  </div>`;

  const body = loading
    ? html`<section class="h-[100dvh] w-full"><${Pixels} cls="w-full h-full" /></section>`
    : err
      ? html`<section class="h-[100dvh] w-full flex flex-col items-center justify-center gap-3 text-white/70 px-8 text-center">${Icon("lucide:cloud-off", "text-5xl")}<div>${T(t, "loadErr")}</div><button class="btn btn-sm btn-outline text-white border-white/25 rounded-2xl" onClick=${() => loadSource(src)}>${T(t, "retry")}</button></section>`
      : !items.length
        ? html`<section class="h-[100dvh] w-full flex flex-col items-center justify-center gap-3 text-white/60 px-8 text-center">${Icon("lucide:film", "text-5xl")}<div>${T(t, "empty")}</div><button class="btn btn-sm btn-outline text-white border-white/25 rounded-2xl" onClick=${() => S.tab.set("sources")}>${T(t, "changeSrc")}</button></section>`
        : items.map((it, i) => html`<${Slide} item=${it} idx=${i} active=${i === active} ephemeral=${ephemeral} t=${t} key=${(it.orig || it.video) + i} />`);

  return html`<${Fragment}>
    <div ref=${scroller} class="fixed inset-0 z-0 bg-black overflow-y-auto snap-y snap-mandatory overscroll-y-contain" style="scrollbar-width:none">${body}</div>
    ${rail}
    ${screen === "source" ? html`<${SourceSheet} S=${S} t=${t} />` : screen === "frame" ? html`<${FrameView} S=${S} t=${t} />` : null}
  </${Fragment}>`;
}

// ---- sources (subscriptions + ready channels) -------------------------------
// The site's real favicon as the logo, with an iconify vector fallback if it fails to load (offline / no icon).
function Logo({ s }) {
  const [failed, setFailed] = useState(false);
  return html`<div class="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 overflow-hidden" style=${`background:${s.color || "#3a3a44"}1f;color:${s.color || "currentColor"}`}>
    ${!failed ? html`<img src=${`https://${hostOf(s.url)}/favicon.ico`} alt="" class="w-6 h-6 object-contain" onError=${() => setFailed(true)} />` : Icon(s.icon || "lucide:link", "text-2xl")}
  </div>`;
}
const SourceRow = ({ s, active, subbed, onPlay, onToggle, t }) => html`<div class=${`flex items-center gap-3 p-2 pr-2.5 rounded-2xl border ${active ? "border-primary bg-primary/5" : "border-base-300 bg-base-100"}`}>
  <button data-src-row class="flex items-center gap-3 flex-1 min-w-0 text-left active:scale-[.99] transition" onClick=${() => onPlay(s)}>
    <${Logo} s=${s} />
    <div class="min-w-0"><div class="font-medium truncate">${s.name}</div><div class="text-xs text-base-content/70 truncate">${hostOf(s.url)}</div></div>
  </button>
  <button class=${`btn btn-ghost btn-sm btn-circle shrink-0 ${subbed ? "text-primary" : "opacity-60"}`} aria-label=${T(t, subbed ? "unsub" : "sub")} data-haptic=${subbed ? "bump" : "off"} onClick=${onToggle}>${Icon(subbed ? "lucide:check" : "lucide:plus", "text-lg")}</button>
</div>`;

export function sources({ S }) {
  const t = useStore(S.t), screen = useStore(S.screen);
  const subs = useStore($subs), curSrc = useStore($src), watchedN = useStore($watched).size;
  const play = (s) => { $src.set(s.url); S.tab.set("reel"); };
  const subbedUrls = new Set(subs.map((x) => x.url));
  const discover = PRESETS.filter((p) => !subbedUrls.has(p.url));

  return html`<${Fragment}>
    <div class="flex flex-col gap-4">
      <button id="add-url" class="btn btn-primary rounded-2xl gap-2" onClick=${() => S.screen.set("source")}>${Icon("lucide:plus")} ${T(t, "addUrl")}</button>

      <div class="flex flex-col gap-2">
        <div class="text-sm font-semibold px-1 flex items-center gap-1.5">${Icon("lucide:bookmark", "text-primary")} ${T(t, "subs")}</div>
        ${subs.length
          ? subs.map((s) => html`<${SourceRow} s=${s} active=${s.url === curSrc} subbed=${true} onPlay=${play} onToggle=${() => unsubscribe(s.url)} t=${t} key=${s.url} />`)
          : html`<div class="text-sm text-base-content/70 px-1 py-3">${T(t, "noSubs")}</div>`}
      </div>

      ${discover.length ? html`<div class="flex flex-col gap-2">
        <div class="text-sm font-semibold px-1 flex items-center gap-1.5">${Icon("lucide:compass")} ${T(t, "discover")}</div>
        ${discover.map((s) => html`<${SourceRow} s=${s} active=${s.url === curSrc} subbed=${false} onPlay=${play} onToggle=${() => subscribe(s)} t=${t} key=${s.url} />`)}
      </div>` : null}

      ${watchedN > 0 ? html`<button id="clear-watched" class="btn btn-ghost btn-sm rounded-2xl gap-2 text-base-content/70 self-center mt-2" onClick=${clearWatched} data-haptic="bump">${Icon("lucide:rotate-ccw")} ${T(t, "clearWatched", { n: watchedN })}</button>` : null}
    </div>
    ${screen === "source" ? html`<${SourceSheet} S=${S} t=${t} />` : screen === "frame" ? html`<${FrameView} S=${S} t=${t} />` : null}
  </${Fragment}>`;
}
