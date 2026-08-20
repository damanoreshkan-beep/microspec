// reel — paste any page URL and every video on it becomes a full-screen, vertically-swiped feed (tiktok-style),
// with the next pages loading themselves as you approach the end. Three views:
//   • reel    — the full-bleed media surface (autoplay-the-visible-slide, poster, tap-to-pause, error state);
//               the slide itself carries NO chrome — every control is one bottom island (see SourceIsland)
//   • liked   — the poster grid of what you double-tapped; a tile opens the feed RIGHT HERE, in this tab
//   • sources — your subscribed pages, grouped by site, + ready-made channels; tap to play, subscribe
// Heavy lifting is systemic: /_rt/video.js createPlayer() owns mp4-vs-HLS attach+teardown+errors; the VPS
// /feed/videos endpoint owns extraction (per-item title+poster+page via JSON-LD / <video> attrs / proximity,
// plus the PAGE's own title); /_rt/sitelabel.js owns "what is this page called"; /_rt/gesture.js owns the drag.
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
import { T, sys } from "/_rt/i18n.js";
import { Island, Sheet } from "/_rt/ui.js";
import { createPlayer, Player } from "/_rt/video.js";
import { VPS_PROXY, pool } from "/_rt/feed.js";
import { sealedFrameUrl, sealedClipUrl } from "/_rt/sealedfetch.js";
import { shareFile, downloadBlob } from "/_rt/apk.js";
import { gate } from "/_rt/gate.js";
import { dedupeVideos, isBlackSample, isFlatSample, hasPoster } from "/_rt/vfilter.js";
import { resolveSearch, buildSearchUrl } from "/_rt/urlquery.js";
import { hostOf, siteName, sourceTitle, groupByDomain, humanText, registrableDomain } from "/_rt/sitelabel.js";
import { useTap, usePanX } from "/_rt/gesture.js";
import { letterTile } from "/_rt/tile.js";
import { reject } from "lodash-es";
import { collection, idbSupported } from "/_rt/db.js";
import { Pixels } from "/_rt/skeleton.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
/* Route an asset through the reverse proxy. `ref` is the PAGE the asset was found on, and it is the whole
   reason this works: what blocks a guarded clip is hotlink protection, not CORS. Measured against a live
   signed clip with the browser UA held constant — no referer 404, the CDN's own origin 404, the page's origin
   206 — and the CDN grants CORS freely either way (206 with our github.io Origin present). A browser cannot
   send that header itself: `Referer` is a forbidden header name for fetch, and a <video> element sends its own
   document's URL, which Referrer-Policy can only shorten, never move to another origin. So the proxy is not a
   CORS workaround; it is the only party that can state the referer the source asks for.
   The earlier note here claimed the token was bound to the VPS's IP. It is not: the same token served a
   different address fine. It was the referer all along, and the proxy was sending the asset's own origin.
   SEALED, and async because of it. Both the clip URL and the page it came from now travel inside the envelope
   (`sealedFrameUrl`), not in the query string — for this app the destination is the part worth hiding, and it
   was the one thing the tunnel still left in the clear. The cost is that a proxied src can no longer be
   computed while rendering; it is resolved in an effect and the slide waits a beat for it. */
const framed = (u, ref) => sealedFrameUrl(u, ref);

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
// Every clip's `page` is a VIDEO page, and a video page's URL names nothing (`/watch/<id>/`) — which is the
// whole reason a dive needs a title from somewhere else. The mock reproduces that shape deliberately: derive
// a label from these URLs and you get "Mixkit", which is what the island used to show.
const GV = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/";
const MOCK = [
  { video: GV + "BigBuckBunny.mp4", title: "Big Buck Bunny", poster: GV + "images/BigBuckBunny.jpg", page: "https://mixkit.co/watch/10241/" },
  { video: GV + "ElephantsDream.mp4", title: "Elephants Dream", poster: null, page: "https://mixkit.co/watch/10242/" },
  { video: GV + "Sintel.mp4", title: "Sintel", poster: null, page: "https://mixkit.co/watch/10243/" },
  { video: GV + "BigBuckBunny.mp4", title: "Big Buck Bunny dup", poster: null, page: "https://mixkit.co/watch/10241/" },
  { video: GV + "ForBiggerBlazes.mp4", title: "Broken clip", poster: BLACK_PX, page: "https://mixkit.co/watch/10244/" },
  { video: GV + "ForBiggerEscapes.mp4", title: "Flat placeholder", poster: GREY_PX, page: "https://mixkit.co/watch/10245/" },
];
// What a DIVE lands on under the gate: a different, recognisable batch, so "the feed actually changed" and
// "back restored the old one" are both assertable without a network. Its clips dive one level deeper again.
const MOCK_DEEP = [
  { video: GV + "ForBiggerFun.mp4", title: "Deeper one", poster: null, page: "https://mixkit.co/watch/55012/" },
  { video: GV + "ForBiggerJoyrides.mp4", title: "Deeper two", poster: null, page: "https://mixkit.co/watch/55013/" },
];
// …and what each of those pages calls ITSELF — the `title` the /videos endpoint now returns. Wrapped in site
// chrome on purpose, so the gate proves cleanPageTitle strips it in a real browser, not only in the unit suite.
const GATE_TITLES = {
  // Deliberately MACHINE TEXT, not a clean string: a percent-escape and an HTML entity, which is how a real
  // page title arrives (a filename-derived title is encoded, a scraped <title> still carries its entities).
  // The gate therefore proves the decode in a real browser, on the path a page title actually travels —
  // island, sources row and all — and not only in the unit suite.
  "https://mixkit.co/watch/10241/": "Big%20Buck%20Bunny in 4K &amp; Friends — Mixkit",
  "https://mixkit.co/watch/55013/": "Deeper two · Mixkit",
};                                    // …it must reach the screen as: Big Buck Bunny in 4K & Friends

/* Where a slide STARTS, once. Sources put a branded card on the front of the preview they hand out, so frame 0
   is a watermark rather than the clip. A fixed offset was the first attempt and it is the wrong shape: these
   previews run anywhere from a few seconds to half a minute, so any constant is too deep into a short one and
   not past the card on a long one. A FRACTION scales with whatever arrives, and needs no number per source.
   Applied on the first play only — `loop` then wraps to 0 like any video. That is deliberate: catching the
   wrap to re-skip means fighting the element every pass, and on a repeat you have already chosen to keep
   watching, the opening is no longer the thing standing between you and the clip. */
const START_FRACTION = 1 / 8;
const seekStart = (v) => {
  // Unknown duration (a manifest that has not said yet) → leave it at 0 rather than guess a second into it.
  try { if (isFinite(v.duration) && v.duration > 0) v.currentTime = v.duration * START_FRACTION; } catch { /* not seekable yet */ }
};

/* How many slides EITHER SIDE of the active one keep a live <video>. 1, so three exist at once, and the
   number is small on purpose: there is no documented cap on concurrent media elements. Android's own
   `getMaxSupportedInstances()` is described by Android as a HINT for an upper bound that real resources may
   undercut, Chrome documents nothing at the web layer, and — the part that decides it — nothing specifies
   what HAPPENS at the limit: not a dropped `src`, not a rejected `play()`, not a `MediaError`. A budget whose
   failure mode is undefined is a budget you stay well inside.
   One ahead is also all a feed needs: you swipe forward, and one behind makes going back free too. */
const PRELOAD = 1;

const $src = persistentAtom("reel:src", DEFAULT_SRC);
// "Open site" opens the source's real website in the external browser. (The in-app reverse-proxy iframe was
// removed — heavy/anti-bot sites never rendered reliably through the datacenter-IP proxy.) The reel is the tap.
function openExternal(url) { if (url && typeof window !== "undefined") window.open(url, "_blank", "noopener"); }
const openSite = (s) => openExternal(s.url);
// Subscriptions live in IndexedDB (the runtime's collection() store) — a real DB, not localStorage. $subs is a
// reactive mirror the views read; writes go to both (optimistic atom + async idb). Headless/no-idb: atom only.
const subsDB = collection("reelSubs");
// SEEDED under the gate, like the likes grid. Everything above the "Discover" heading was otherwise only ever
// measured — and only ever photographed — as its empty state, so the one row shape that carries a real page's
// name (a `/watch/<id>/` URL names nothing, so the saved title IS the row) had no populated screen at all.
// These two are what a subscription actually looks like: a long one, because that is the case the row has to
// survive, and a short one beside it. Their pages are never opened by the mock feed, so nothing renames them.
const GATE_SUBS = [
  { id: "https://mixkit.co/watch/70001/", url: "https://mixkit.co/watch/70001/", name: "Fog over the Carpathians at first light, in one long slow take" },
  { id: "https://mixkit.co/watch/70002/", url: "https://mixkit.co/watch/70002/", name: "Night city" },
];
const $subs = atom(gate ? GATE_SUBS : []);
if (idbSupported && !gate) subsDB.all().then((rows) => $subs.set(rows)).catch(() => {});
async function subscribe(s) {
  if (!s?.url || $subs.get().some((x) => x.url === s.url)) return;
  // The name is FROZEN here — a subscription keeps the title the page had when you saved it, which is the
  // only thing a list of N pages can show without N round-trips (see sitelabel's own note on deriving).
  const rec = { name: s.name || sourceTitle(s.url), url: s.url };
  $subs.set([{ id: s.url, ...rec }, ...$subs.get()]);
  try { await subsDB.put(s.url, rec); } catch { /* no idb (headless) — the atom still holds it this session */ }
}
async function unsubscribe(url) {
  $subs.set($subs.get().filter((x) => x.url !== url));
  try { await subsDB.remove(url); } catch { /* */ }
}
// …and the frozen name is CORRECTED the moment the page itself answers. That freeze is what made the sources
// tab a second, worse answer to "what is this page called": you can subscribe from the add-URL sheet, where
// nothing but the URL is known yet, and the row then kept that guess forever while the island — which had
// since been handed the page's own <title> — showed the real name. A source resolves its title on every load
// anyway, so the row costs one write and no round-trip. Same input, same function, one string.
function renameSub(url, title) {
  const cur = $subs.get().find((x) => x.url === url);
  if (!cur || !title || cur.name === title) return;
  $subs.set($subs.get().map((x) => (x.url === url ? { ...x, name: title } : x)));
  subsDB.put(url, { name: title, url }).catch(() => { /* no idb (headless) — the atom still holds it */ });
}

// ── a site's SESSION: your own cookies, per site ─────────────────────────────────────────────────────────
// A front page is PERSONAL — its "recommended" is the visitor's account and history — and the VPS is one
// anonymous visitor for everyone (a datacenter IP, one shared cookie jar per host), so the root of a site you
// are signed in to came back as somebody else's front page. A site can therefore carry YOUR Cookie header,
// pasted once from the browser you are signed in with. Every fetch of that site's pages then goes to
// /feed/videos as POST {url, cookie} — inside the sealed envelope, never in a query string — and the server
// uses it for that one request and never writes it into its jar. Keyed by the registrable domain, so the
// root, a dive page and a www./m. host all share one session. IndexedDB, mirrored into an atom for the views.
const sessDB = collection("reelSessions");
const $sessions = atom({});                                 // domain → Cookie header value
// The boot fetch fires from the first mount, before IndexedDB has answered — so the very first page of a
// site with a saved session went out ANONYMOUS every cold start, and the owner met the server's front page
// again. loadSource awaits this before it reads the cookie; it is a settled promise from then on.
const sessionsReady = idbSupported && !gate
  ? sessDB.all().then((rows) => $sessions.set(Object.fromEntries(rows.map((r) => [r.id, r.cookie])))).catch(() => {})
  : Promise.resolve();
const sessionKey = (url) => registrableDomain(hostOf(url));
const sessionFor = (url) => $sessions.get()[sessionKey(url)] || "";
async function setSession(url, cookie) {
  const k = sessionKey(url), c = String(cookie || "").trim();
  const next = { ...$sessions.get() };
  if (c) next[k] = c; else delete next[k];
  $sessions.set(next);
  try { if (c) await sessDB.put(k, { cookie: c }); else await sessDB.remove(k); } catch { /* no idb (headless) — the atom holds it */ }
}
const $sessSite = atom("");                                 // the site the session sheet is editing (a url of it)

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
// likes from different sources (any tube site, mixkit, commons…) coexist and never duplicate. Each record carries its
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
// What the current source is CALLED, and the name we had for it before the page could answer. A video page's
// URL is a shape (`/watch/10241/`), so `pageLabel` alone put "Mixkit"/"View video" in the island; the title
// is resolved by sitelabel.sourceTitle from three producers, best first: the URL when it names the page, the
// page's own <title> (the /videos `title` field), and the title of the clip you dived from ($srcHint) — which
// is the one that exists INSTANTLY, so the island never shows a placeholder while the new feed loads.
const $srcTitle = atom(sourceTitle(DEFAULT_SRC));
const $srcHint = atom("");
// The ONE place a source's name is decided, so the island and the sources list can't drift apart: whatever
// this writes is what the row for that URL shows (see renameSub).
function setSrcTitle(url, opts) {
  const title = sourceTitle(url, opts);
  $srcTitle.set(title);
  renameSub(url, title);
  return title;
}
let booted = false;               // the very first feed load happens once, on the first mount — never on a re-mount

// ── navigation: the dive stack ──────────────────────────────────────────────────────────────────────────
// $frames holds the feed states you can go BACK to, deepest last. Its length is mirrored into the runtime's
// S.stack, which is what turns each level into one history entry — so the system Back button, the island's
// back chevron and a rightward drag are three doors into the same single path (S.stack → listener → restore).
const $frames = atom([]);
const $restoreTo = atom(null);    // the slide the scroller must land on after a restore (null = nothing pending)
const $owner = atom("reel");      // which TAB owns the full-screen feed: "reel" | "liked" (a liked tile plays HERE)

const snapshot = (label) => ({ label, src: $src.get(), title: $srcTitle.get(), hint: $srcHint.get(), items: $items.get(), next: $next.get(), active: $active.get(), eph: $ephemeral.get(), owner: $owner.get(), err: $err.get() });
function restoreTop() {
  const fs = $frames.get(); if (!fs.length) return;
  const f = fs[fs.length - 1];
  $frames.set(fs.slice(0, -1));
  gen++;                                                    // anything still in flight for the abandoned source is stale
  loadingMore = false;
  $src.set(f.src); $srcTitle.set(f.title); $srcHint.set(f.hint); $items.set(f.items); $next.set(f.next); $ephemeral.set(f.eph);
  $owner.set(f.owner); $loading.set(false); $err.set(f.err);
  $active.set(f.active); $restoreTo.set(f.active);          // …and land on the exact slide you left
  // Never restore INTO a phantom skeleton: if you left that level before it ever filled, fetch it now.
  if (!f.items.length && !f.err && !gate) loadSource(f.src, false, f.hint);
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
function openSource(url, hint) { $src.set(url); loadSource(url, false, hint); }
// `hint` is the title of the clip you dived FROM — i.e. the name of the page you are diving INTO, known
// before a single byte of it is fetched.
function diveTo(S, url, hint) {
  if (!url) return;
  pushFrame(S, $srcTitle.get());                             // the level you are leaving, by its real name
  navigator.vibrate?.(10);                                   // a gesture commit isn't a tap → the delegated haptic doesn't cover it
  openSource(url, hint);
}

// ── blank-poster filter (black + flat placeholders) ─────────────────────────────────────────────────────
// A broken/placeholder poster renders as a dead slide: a solid black frame OR a single flat-colour fill a CDN
// serves when it has no real thumbnail. Both are dead weight (they don't play, and for CORS-locked/ephemeral
// sources the poster IS the whole slide). We sample each poster into a small canvas and drop the ones a real
// frame never produces — near-black (vfilter.isBlackSample) or uniform flat-fill (vfilter.isFlatSample).
// Fail-open: anything we can't prove blank is kept. Applies to EVERY item — inline-playable and ephemeral alike.
//
// These used to go through /feed/frame unconditionally, to keep the canvas untainted. Measured across three
// source CDNs: every poster answers 200 with `access-control-allow-origin: *`, and none of them hotlink-checks
// images the way the video hosts do. So the proxy was buying nothing and costing our bandwidth plus a URL in
// our logs on every thumbnail. Direct with crossOrigin="anonymous" is the path now; the sealed proxy stays as
// the fallback for a host that does lock its images, and it is sealed like everything else.
const blankPosters = new Set();     // posters classified black/flat/broken → filtered out (+ dropped from future loads)
const checkedPosters = new Set();   // posters already analysed (don't re-fetch)
function posterIsBlank(poster, page) {
  const isData = poster.startsWith("data:");
  if (gate && !isData) return Promise.resolve(false);                                    // gate: no network — only inline posters
  if (typeof document === "undefined" || typeof Image === "undefined") return Promise.resolve(false);  // no DOM (preflight) → keep
  return new Promise((resolve) => {
    let done = false; const finish = (v) => { if (!done) { done = true; clearTimeout(to); resolve(v); } };
    const to = setTimeout(() => finish(false), 6000);                                     // slow poster → keep (fail-open)
    const sample = (src) => {
      const img = new Image(); if (!isData) img.crossOrigin = "anonymous";
      img.onload = () => { try {
        const c = document.createElement("canvas"); c.width = 24; c.height = 24;
        const cx = c.getContext("2d", { willReadFrequently: true }); cx.drawImage(img, 0, 0, 24, 24);
        const px = cx.getImageData(0, 0, 24, 24).data;
        finish(isBlackSample(px) || isFlatSample(px));                                     // black OR uniform flat-fill → blank
      } catch { finish(false); } };                                                        // tainted / decode error → keep
      img.onerror = () => {
        // Direct refused (locked host, or no ACAO so the load itself failed) → one retry through the sealed
        // proxy, which can state a referer and always answers with CORS. A second failure is fail-open.
        if (isData || src !== poster) return finish(false);
        framed(poster, page).then(sample).catch(() => finish(false));
      };
      img.src = src;
    };
    sample(poster);
  });
}
async function checkBlankPosters() {
  const todo = [];
  // The page travels with the poster now: it is what the sealed-proxy retry needs for a referer, on the hosts
  // that lock their images. Keyed on the poster still — the page is only carried alongside.
  for (const it of $items.get()) { const p = it.poster; if (p && !checkedPosters.has(p)) { checkedPosters.add(p); todo.push([p, it.page || null]); } }
  if (!todo.length) return;
  const hits = new Set();
  await pool(todo, 4, async ([p, pg]) => { if (await posterIsBlank(p, pg)) hits.add(p); }); // small concurrency — don't hammer the proxy
  if (hits.size) { hits.forEach((p) => blankPosters.add(p)); $items.set(reject($items.get(), (i) => i.poster && hits.has(i.poster))); }
}
// One pipeline for every incoming batch: unseen (watched) → drop already-known-blank posters → optionally drop
// posterless clips → dedupe. requirePoster is set ONLY for ephemeral sources, where a clip with no poster is a
// guaranteed-blank watch-link slide (nothing to show, won't play inline); inline sources keep posterless clips
// (they still play, with a video backdrop). Blanks are rejected BEFORE dedupe so a blank never wins a dup's slot.
function clean(arr, { requirePoster = false } = {}) {
  // A clip's title is decoded ONCE, here, on the way in — not at each place that draws it. It arrives as
  // machine text (a percent-encoded filename, a scraped title still carrying `&amp;`/`&#8217;`), and it then
  // travels: it names the island after a dive, it is the hint the next page is titled by, it is saved with a
  // like, it captions the full clip. Decoding at render would leave each of those free to disagree.
  let out = reject(unseen(arr), (i) => i.poster && blankPosters.has(i.poster));
  out = out.map((i) => (i.title ? { ...i, title: humanText(i.title) } : i));
  if (requirePoster) out = out.filter(hasPoster);
  return dedupeVideos(out);
}

let loadingMore = false, gen = 0;
async function loadSource(url, append = false, hint = "") {
  if (append) { if (loadingMore || !url) return; loadingMore = true; }
  else {
    $loading.set(true); $err.set(false); $items.set([]); $next.set(null); $active.set(0); $restoreTo.set(0);   // a new source starts at its top, wherever you dived from
    $srcHint.set(hint || ""); setSrcTitle(url, { hint });                                                      // named from the first frame, upgraded when the page answers
  }
  const g = append ? gen : ++gen;                            // a dive/back mid-flight makes this response stale
  if (gate) {                                                // the gate never fetches: a deterministic batch per source
    if (!append) {
      $items.set(clean(url === DEFAULT_SRC ? MOCK : MOCK_DEEP)); $ephemeral.set(false); $loading.set(false);
      setSrcTitle(url, { pageTitle: GATE_TITLES[url] || "", hint });
    }
    loadingMore = false; return;
  }
  try {
    await sessionsReady;                                   // the saved sessions, before the first fetch decides anonymous or not
    const cookie = sessionFor(url);                        // your session for this site → the page is yours, not the server's
    const r = await (cookie
      ? fetch(`${VPS_PROXY}/videos`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, cookie }) })
      : fetch(`${VPS_PROXY}/videos?url=${encodeURIComponent(url)}`));
    const d = await r.json();
    if (g !== gen) return;                                   // you already moved on — never inject into the new feed
    // ephemeral (signed, poster-only) is known BEFORE cleaning → require a poster so no-poster clips (dead
    // blank watch-link slides) are dropped. On append the source doesn't change, so reuse the current flag.
    const eph = append ? $ephemeral.get() : !!d.ephemeral;
    const got = clean(Array.isArray(d.items) ? d.items : [], { requirePoster: eph });
    $items.set(append ? dedupeVideos([...$items.get(), ...got]) : got);                   // re-dedupe across the page boundary too
    $next.set(d.next || null);
    if (!append) setSrcTitle(url, { pageTitle: d.title || "", hint });                     // the page has now told us its own name
    if (!append) $ephemeral.set(eph);                  // signed/expiring source → show poster + "watch" link, don't try to play
  } catch { if (g === gen && !append) $err.set(true); }
  finally { if (g === gen) $loading.set(false); if (append) loadingMore = false; }
}

/* ── the FULL clip, over the reel ──────────────────────────────────────────────────────────────────────────
   A slide plays the site's PREVIEW: short, small, often 240p. The clip's own page carries the real thing, and
   `/feed/stream` takes the quality ladder out of that page on the server — which is the only place it can be
   taken. Two measurements decided the whole shape of this:
     · a segment fetched straight from the browser is 412; the same segment through our proxy is 206. The
       token answers to whoever was handed the page, and that is the VPS.
     · rendering the page instead would be 988 KB of HTML and 462 subresources per open, every one of them a
       request through our box, to reach a handful of URLs already sitting in the markup.
   So: parse on the server, play here, and the page stops being somewhere you GO. It is where the clip comes
   from. The button that used to leave the app for a browser tab is now this, and so is a tap on the reel. */
const $full = atom(null);                                  // null | {page, title, url, err}

async function openFull(S, item) {
  const page = item?.page || item?.orig || item?.video;
  if (!page) return;
  const title = item.title || "";
  $full.set({ page, title, url: null, err: false });
  S.screen.set("full");                                    // history-backed: the system Back closes it
  // Only ever write back onto the clip we were opening — a fast second tap must not be overwritten by the
  // first one's late answer.
  const settle = (patch) => { const cur = $full.get(); if (cur && cur.page === page) $full.set({ ...cur, ...patch }); };
  if (gate) return settle({ url: item.video });             // the gate never fetches; the preview stands in
  try {
    const d = await (await fetch(`${VPS_PROXY}/stream?url=${encodeURIComponent(page)}`)).json();
    const list = (Array.isArray(d.sources) ? d.sources : []).filter((s) => !s.remote);
    // HLS first, and not because it is taller: ONE master carries every rendition, so the player adapts to the
    // link instead of us committing to a height on the viewer's behalf. A progressive file is the fallback.
    const pick = list.find((s) => s.format === "hls") || list[0];
    if (!pick) return settle({ err: true });
    // The format is KNOWN here, and the proxied URL it is about to become carries no extension to recover it
    // from — so it travels with the url rather than being guessed at the player.
    // /stream answers with the page's own title — scraped HTML, so it carries entities like every other
    // title in this app. It goes through the same decode as the feed's, and for the same reason: it is a
    // caption AND the dialog's accessible name.
    settle({ url: await sealedFrameUrl(pick.url, page), type: pick.format === "hls" ? "hls" : "progressive", title: humanText(d.title) || title });
  } catch { settle({ err: true }); }
}

// The overlay itself. While the ladder is being fetched there is a real wait (a page fetch on the server, then
// one more hop), so this is a skeleton and never a spinner — and it carries the way out from the first frame,
// because a screen you cannot leave while it loads is the worst version of this.
function FullClip({ S, t }) {
  const full = useStore($full), locale = useStore(S.locale);
  if (!full) return null;
  const close = () => { S.screen.set(null); $full.set(null); };
  if (full.url) return html`<${Player} url=${full.url} type=${full.type} title=${full.title} locale=${locale} onClose=${close} />`;
  return html`<div data-full role="dialog" aria-modal="true" aria-label=${full.title || T(t, "watch")}
      class="fixed inset-0 z-40 bg-black flex flex-col" style="padding-top:env(safe-area-inset-top)">
    <header class="flex items-center gap-1 px-2 py-1.5 text-white bg-black/70">
      <button data-full-back class="btn btn-ghost btn-sm btn-circle text-white" aria-label=${T(t, "back")} onClick=${close}>${Icon("lucide:arrow-left", "text-xl")}</button>
      <span class="flex-1 min-w-0 truncate font-medium">${full.title || ""}</span>
    </header>
    <div class="flex-1 relative">
      ${full.err
        ? html`<div class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70 p-6 text-center">
            ${Icon("lucide:tv-minimal-play", "text-5xl opacity-40")}<div>${T(t, "videoErr")}</div>
            <a href=${full.page} target="_blank" rel="noopener" class="btn btn-sm btn-outline text-white border-white/30 gap-2">${Icon("lucide:external-link")}${T(t, "openSite")}</a>
          </div>`
        : html`<${Pixels} cls="w-full h-full" />`}
    </div>
  </div>`;
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
// A live <video>, mounted for the active slide AND its neighbours (see PRELOAD). Exactly one PLAYS; the rest
// are attached and buffering, paused. createPlayer handles mp4 vs HLS and tears down on unmount. On failure it
// falls back to the poster — the island's way out is already there either way, so no failure flag has to
// travel upwards for it.
//
// THE BLINK. This used to mount only in the ACTIVE slide, and that is what the owner was seeing: every swipe
// destroyed one element and built another, so the new clip started from nothing — a fresh element, a fresh
// connection, a wait for `loadeddata`, and only then a frame. The gap between the old video going away and the
// new one having a pixel to show IS the flash, and no amount of styling closes it, because there is genuinely
// nothing to display in the middle. So the element for the next clip now exists BEFORE you swipe to it and has
// been buffering while you watched the current one; becoming active is a play() on data that is already here.
//
// Three things make that safe rather than just eager:
//   · attach and PLAY are separate effects. The element is built once per clip URL and never rebuilt for a
//     change of active — which is the whole point, since rebuilding it is the bug.
//   · the ambient backdrop copy waits for the main video to have data. It is a SECOND fetch of the same URL,
//     and starting it in parallel (as it used to) makes the thing you are actually watching arrive later.
//     It is also the active slide's alone: at three slides it would otherwise be six decoders.
//   · `poster` on the element itself, so a cold slide shows the still instead of black while it loads. The
//     blurred fill behind it is a different job (filling the letterbox) and stays a separate node.
//   · a clip the CDN refuses to hand this origin is RETRIED through the proxy rather than written off. Direct
//     first, because most sources need no help and every proxied byte crosses our own box; the proxy only on
//     failure, or immediately for a source already known to hand out guarded URLs (`ephemeral`), where the
//     direct attempt is a round trip we know the answer to. One retry, then the poster — never a loop.
function VideoLayer({ item, playing, ephemeral }) {
  const ref = useRef(), bgRef = useRef();
  const [errored, setErrored] = useState(false);
  const [viaProxy, setViaProxy] = useState(!!ephemeral);
  // Sealing is WebCrypto, so a proxied src cannot be derived during render any more. Direct stays synchronous
  // (the common path pays nothing); only the proxied one resolves in an effect, and `src` is null until it
  // does — which the attach effect below treats as "not ready yet" rather than as a failure.
  const [src, setSrc] = useState(ephemeral ? null : item.video);
  useEffect(() => {
    if (!viaProxy) { setSrc(item.video); return; }
    let dead = false;
    framed(item.video, item.page).then((s) => { if (!dead) setSrc(s); }).catch(() => { if (!dead) setErrored(true); });
    return () => { dead = true; };
  }, [viaProxy, item.video, item.page]);
  const [ready, setReady] = useState(false);
  // The active flag as the ATTACH effect will see it whenever it finally resolves. `onReady` fires after an
  // await, so reading `playing` from the closure would play whichever slide was active when the fetch started.
  const wants = useRef(playing);
  wants.current = playing;

  useEffect(() => {
    setErrored(false); setReady(false);
    const v = ref.current; if (!v || !src) return;                                        // no src yet → the seal is still resolving
    v.muted = true; v.loop = true;                                                        // muted → browsers allow autoplay
    v.preload = "auto";                                                                   // a neighbour exists to BUFFER; metadata is not enough
    let handle, dead = false;
    // The ORIGINAL url still has its extension; `src` may be the proxied one, which has none. Sniff the thing
    // that can still be sniffed.
    createPlayer(v, src, {
      type: /\.m3u8(\?|#|$)/i.test(item.video) ? "hls" : "progressive",
      onReady: () => {
        if (dead) return;
        setReady(true);
        seekStart(v);                                                                     // past the source's intro, before the first frame is shown
        if (wants.current) { v.play?.().catch(() => {}); return; }
        /* PRIME. `preload` is a hint the spec explicitly lets a UA ignore, and Chrome's own guidance says
           it downgrades `auto` to `metadata` on cellular (`none` under Data Saver) — i.e. exactly on the
           phone this is for. Metadata is not a picture, so a neighbour could still arrive with nothing to
           show and the blink would survive the rewrite. A muted play() is permitted without a gesture, so
           one is taken and immediately given back: that forces the decode of frame 0, which is the thing
           we actually want buffered. Rewound afterwards to the START, not to 0, so the clip still opens where it should, and
           swallowed on failure — an interrupted play() rejects, and that is not an error here. */
        v.play?.().then(() => {
          if (dead || wants.current) return;                                              // it became active mid-prime — let it run
          v.pause?.();
          seekStart(v);                                                                   // rewound to the START, not to 0 — priming must not undo the skip
        }).catch(() => {});
      },
      // A direct failure is a question, not a verdict: the CDN may simply want a referer we cannot send. Swap
      // to the proxied URL once and let this effect run again; only a proxied failure is really the end.
      onError: () => { if (dead) return; if (viaProxy) setErrored(true); else setViaProxy(true); },
    }).then((h) => { if (dead) h?.destroy?.(); else handle = h; });
    return () => { dead = true; handle?.destroy?.(); };
  }, [src]);

  // Play follows the ACTIVE flag and nothing else — the element is never rebuilt for it. A manual pause (tap)
  // survives, because this only runs when `playing` or `ready` actually changes.
  useEffect(() => {
    const v = ref.current; if (!v || !ready) return;
    if (playing) v.play?.().catch(() => {}); else v.pause?.();
  }, [playing, ready]);

  // The ambient backdrop, for clips with no poster: a muted copy of the same video, blurred, filling the
  // letterbox. Active slide only, and only once the main one has data — see the note above.
  useEffect(() => {
    if (!playing || !ready || item.poster || errored) return;
    const bg = bgRef.current; if (!bg) return;
    bg.muted = true; bg.loop = true;
    let handle, dead = false;
    createPlayer(bg, src, { onReady: () => { if (!dead) bg.play?.().catch(() => {}); } })
      .then((h) => { if (dead) h?.destroy?.(); else handle = h; });
    return () => { dead = true; handle?.destroy?.(); };
  }, [playing, ready, src, item.poster, errored]);

  return html`<${Fragment}>
    ${errored
      ? html`<${PosterFill} poster=${item.poster} />`
      : item.poster
        ? html`<img src=${item.poster} alt="" aria-hidden="true" class="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-60" onError=${(e) => e.currentTarget.remove()} />`
        : html`<video ref=${bgRef} aria-hidden="true" muted loop playsinline class="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50"></video>`}
    <div class="absolute inset-0 bg-black/25" aria-hidden="true"></div>
    ${/* `data-playing` mirrors which element owns playback. A <video> is opaque to every gate this farm has
          — `paused` is a property, not an attribute, so no selector can see it — and the whole claim of the
          preload window is "several are mounted, exactly ONE plays". State the claim in the DOM or it
          cannot be tested, and a window that quietly plays all three is the regression to catch. */""}
    <video ref=${ref} data-main data-playing=${playing ? "" : null} poster=${item.poster || null} playsinline loop muted class=${`absolute inset-0 w-full h-full object-contain ${errored ? "opacity-0" : ""}`}></video>
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

// A slide is the clip and NOTHING else — no chip, no link, no pill. Every affordance it used to carry (dive,
// open the page, "watch on the site") is one control in the island below, where it is stated once instead of
// once per slide, and where a keyboard can reach it. The surface is the video.
function Slide({ S, item, idx, active, near, ephemeral }) {
  const secRef = useRef();
  const [burst, setBurst] = useState(null);
  // Systemic tap dispatch (runtime useTap): SINGLE tap toggles pause on a clip that plays inline, else opens the
  // source page; DOUBLE tap likes + blooms a heart — and never fires the single (so a like never pauses/navigates).
  /* SINGLE tap opens the full clip — for every slide, not just a dead one. It used to toggle pause, and to
     open the page in a browser tab only when the clip could not play here; that made the most valuable action
     on the surface reachable only by failure. The reel is the trailer and the tap is how you watch the thing.
     Pause is not lost: the reel suspends by itself while the overlay is up (see FeedSurface), and swiping away
     is what "not this one" already meant. */
  const onTap = useTap({
    onSingle: () => openFull(S, item),
    onDouble: (p) => { setBurst({ x: p.x, y: p.y, k: Date.now() }); addLike(item); navigator.vibrate?.(12); },
  });
  return html`<section ref=${secRef} data-reel data-idx=${idx} onClick=${onTap} class="snap-start snap-always relative h-[100dvh] w-full flex items-center justify-center bg-black overflow-hidden">
    ${/* `ephemeral` used to mean "do not even try" — a poster and a link out to the site. It meant that because
          a guarded clip looked unplayable, and it looked unplayable because the proxy was sending the wrong
          referer and the HTML branch was reporting the rejection as 200. Both are fixed, so the flag now means
          what it should have meant all along: START on the proxy instead of discovering the need to. */""}
    ${near
      ? html`<${VideoLayer} item=${item} playing=${active} ephemeral=${ephemeral} />`
      : item.poster
        ? html`<${PosterFill} poster=${item.poster} />`
        : null}
    ${burst ? html`<${HeartBurst} x=${burst.x} y=${burst.y} key=${burst.k} onDone=${() => setBurst(null)} />` : null}
  </section>`;
}

function SourceSheet({ S, t }) {
  const [val, setVal] = useState("");
  const [q, setQ] = useState("");
  const norm = () => { const u = val.trim(); return u ? (/^https?:\/\//i.test(u) ? u : "https://" + u) : ""; };
  const goto = (url) => { subscribe({ name: sourceTitle(url), url }); resetNav(S); $owner.set("reel"); openSource(url); S.tab.set("reel"); S.screen.set(null); };
  const load = (e) => { e?.preventDefault?.(); const url = norm(); if (!url) return S.screen.set(null); goto(url); };
  // A pasted results URL (`…/search?q=…`) is searchable → offer to swap the term and play those results.
  const sr = resolveSearch(norm());
  const search = (e) => { e?.preventDefault?.(); const url = norm(), term = q.trim(); if (url && term) goto(buildSearchUrl(url, term)); };
  // The shell is the kit's: drag-to-dismiss, the title row with its close button, the backdrop, and the
  // 88dvh cap with the only sanctioned inner scroll. This app had hand-rolled all four, and had already
  // drifted (no drag-dismiss at all, its own radius, its own backdrop opacity). `open` is derived from the
  // same S.screen atom the close handler writes, so the system Back button still closes it.
  return html`<${Sheet} open onClose=${() => S.screen.set(null)} title=${T(t, "srcTitle")} icon="lucide:link">
    <form onSubmit=${load} class="flex flex-col gap-3">
      <label class="input flex items-center gap-2 rounded-2xl">
        ${Icon("lucide:globe", "opacity-50 shrink-0")}
        <input id="src-input" type="url" inputmode="url" autocomplete="off" class="grow min-w-0" placeholder=${T(t, "srcPlaceholder")} aria-label=${T(t, "srcTitle")} value=${val} onInput=${(e) => setVal(e.target.value)} />
      </label>
      ${sr.searchable ? html`<div class="flex gap-2">
        <label class="input flex items-center gap-2 rounded-2xl flex-1">
          ${Icon("lucide:search", "opacity-50 shrink-0")}
          <input id="sheet-search" type="search" inputmode="search" autocomplete="off" class="grow min-w-0" placeholder=${T(t, "searchPh")} aria-label=${T(t, "search")} value=${q} onInput=${(e) => setQ(e.target.value)} />
        </label>
        <button type="button" class="btn btn-primary rounded-2xl gap-1 shrink-0" onClick=${search}>${Icon("lucide:search")} ${T(t, "search")}</button>
      </div>` : null}
      <button id="src-load" type="submit" class="btn btn-primary rounded-2xl gap-1">${Icon("lucide:play")} ${T(t, "load")}</button>
    </form>
  <//>`;
}

// The session sheet: one field, the site's Cookie header, and a verb. Routed through S.screen like every other
// dismissable surface, so the system Back closes it. "Forget" exists only while a session is saved — a delete,
// so it goes through the undo snackbar (the pasted line is not something you want to type twice).
function SessionSheet({ S, t, undo }) {
  const site = useStore($sessSite), sessions = useStore($sessions);
  const cur = sessions[sessionKey(site)] || "";
  const [val, setVal] = useState(cur);
  // The saved line arrives from the atom (IndexedDB behind it), not from this render: seed once and the field
  // stays empty while the fetch happily uses the session — the owner saw exactly that. Follow the atom.
  useEffect(() => { setVal(cur); }, [cur, site]);
  const close = () => S.screen.set(null);
  const save = (e) => { e?.preventDefault?.(); const next = val.trim(); if (!next) return; setSession(site, next); close(); };
  const forget = () => { undo(() => setSession(site, cur), siteName(site)); setSession(site, ""); close(); };
  return html`<${Sheet} open onClose=${close} title=${T(t, "sessTitle")} subtitle=${sessionKey(site)} icon="lucide:key-round">
    <form onSubmit=${save} class="flex flex-col gap-3">
      <textarea id="sess-input" rows="4" autocomplete="off" spellcheck="false" class="textarea rounded-2xl font-mono text-xs leading-snug w-full break-all" placeholder="name=value; name2=value2" aria-label=${T(t, "sessTitle")} value=${val} onInput=${(e) => setVal(e.target.value)}></textarea>
      <button id="sess-save" type="submit" class="btn btn-primary rounded-2xl gap-1" disabled=${!val.trim()}>${Icon("lucide:check")} ${T(t, "sessSave")}</button>
      ${cur ? html`<button type="button" data-sess-forget class="btn btn-ghost rounded-2xl gap-1 text-base-content/70" onClick=${forget}>${Icon("lucide:trash-2")} ${T(t, "sessForget")}</button>` : null}
    </form>
  <//>`;
}

// ---- the feed surface (shared by the Reel tab and the in-place Liked feed) ---------------------------
// The island is the reel's ONLY chrome, and it sits at the bottom — where the thumb is, above the dock, on
// the systemic rung (`Island pinned at="bottom"` owns the arithmetic; nothing here hardcodes a height).
// It answers the three questions a full-screen feed leaves open — where am I, how do I get back, where does
// this clip go — and it carries the one action a clip that won't play inline needs. Left half is identity,
// right half is actions; both halves shrink before the title does anything but truncate.
//
// It is ALWAYS present now. It used to hide itself on a subscribed root feed "for a clean surface", which
// was affordable only while every control also existed on the slide. It is the controls now.
/* ---- exporting a clip -------------------------------------------------------------------------------
   A SERVER round trip, not a canvas capture, for two reasons that are both already settled elsewhere in this
   file: the clip's bytes are gated on Referer + UA (a forbidden header name for fetch — the whole reason
   /feed/frame exists), and a JS re-encode drops frames under load, which is the one property that was asked
   for. `sealedClipUrl` puts the destination in the envelope and lets the bytes ride TLS — sealing them would
   inflate a 24 MB GIF by a third and double the wait (measured; see the note on that helper).
   Sizes, measured on real clips: GIF is 360px/12.5fps whole-clip, 8-27 MB depending on how much moves; the
   video is a 720p re-encode, ~3 MB. Both are inside the 50 MB the share sheet accepts. */
const $busy = atom("");                                 // "gif-save" | "gif-share" | … — one export at a time

// The file the owner ends up with, named after the clip rather than after our URL scheme. Kept short and
// filesystem-safe; a title is scraped HTML and can carry anything at all.
const exportName = (item, ext) => `${(item?.title || "clip").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "clip"}.${ext}`;

async function exportClip({ item, format, mode, t, toast }) {
  const url = item?.orig || item?.video;
  if (!url || $busy.get()) return;                      // one at a time: the box does real CPU work per call
  $busy.set(`${format}-${mode}`);
  try {
    const r = await fetch(await sealedClipUrl(url, item.page || null, format));
    if (!r.ok) {
      // The edge answers with a reason and a number (a size ceiling, a refused source). Show it — "export
      // failed" with nothing after it is the diagnostic this project keeps having to go back and add.
      const why = await r.json().catch(() => null);
      toast?.(why?.error ? `${T(t, "expFail")}: ${why.error}` : T(t, "expFail"));
      return;
    }
    const blob = await r.blob();
    const name = exportName(item, format);
    if (mode === "share") {
      // shareFile falls back to saving where nothing can share (a desktop browser, a refused bridge), and
      // reports which happened — so the toast tells the truth instead of claiming a share that never opened.
      const how = await shareFile(blob, name);
      if (how === "saved") toast?.(T(t, "expSaved"));
    } else {
      downloadBlob(blob, name);
      toast?.(T(t, "expSaved"));
    }
  } catch {
    toast?.(T(t, "expFail"));
  } finally {
    $busy.set("");
  }
}

/* The overflow sheet. The island had grown to five controls plus a favicon and a title that truncated to
   make room for them — a control panel floating over the video it was meant to stay out of the way of. Only
   the things you reach for WHILE watching stay out there (the way back, the way in, and play); everything
   that is a decision rather than a reflex moved in here.
   A Sheet and not a popover: it is the kit's, it drag-dismisses, and it is routed through S.screen, so the
   system Back closes it like every other dismissable surface in this farm. */
function MoreSheet({ S, t, item, src, title, subbed, openIn, toast }) {
  const busy = useStore($busy), loc = useStore(S.locale);
  const close = () => S.screen.set(null);
  const row = "btn btn-ghost justify-start gap-3 rounded-2xl w-full font-normal";
  // Save and share sit on the same line as the format they act on: two rows instead of four, and the pair
  // reads as one choice about one thing rather than as four unrelated buttons.
  const pair = (format, label) => html`<div class="flex items-center gap-2">
    <span class="flex-1 min-w-0 truncate text-sm font-medium pl-1">${label}</span>
    ${[["save", "lucide:download"], ["share", "lucide:share-2"]].map(([mode, icon]) => {
      const key = `${format}-${mode}`;
      /* No spinner on the button, per the farm rule: a spinner is what you reach for when you have nothing
         to say. There IS something to say here — which artifact is being built — and the line below says it. */
      return html`<button data-exp=${key} class=${`btn btn-sm btn-circle btn-ghost border border-base-content/15${busy === key ? " btn-active" : ""}`} disabled=${!!busy}
        aria-label=${`${T(t, mode === "save" ? "expSave" : "expShare")}: ${label}`}
        onClick=${() => exportClip({ item, format, mode, t, toast })}>${Icon(icon)}</button>`;
    })}
  </div>`;
  return html`<${Sheet} open onClose=${close} title=${T(t, "more")} icon="lucide:ellipsis">
    <div class="flex flex-col gap-2">
      ${item ? html`<${Fragment}>
        ${pair("gif", T(t, "expGif"))}
        ${pair("mp4", T(t, "expVideo"))}
        ${/* The wait is real (a download and a transcode on our box), so it is STATED rather than hidden
              behind a control that simply does not respond for half a minute. */""}
        ${busy ? html`<div data-exp-busy class="text-xs text-muted pl-1">${T(t, "expBusy")} ${T(t, busy.startsWith("mp4") ? "expVideo" : "expGif")}</div>` : null}
        <div class="h-px bg-base-content/10 my-1"></div>
      </${Fragment}>` : null}
      ${/* Clean screen. A reel is the one surface where the chrome is genuinely in the way — it floats over
            the picture rather than beside it, and in landscape the app bar, the island and the dock cover 48%
            of the height (measured, 832x384). The mode belongs to the RUNTIME (S.clean) because the app bar
            and the dock are its elements and --hdr-h/--dock-h are its measurements — an app hiding them from
            the outside would leave both numbers describing chrome that is no longer on screen. */""}
      <button data-clean class=${row} onClick=${() => { close(); S.clean.set(true); }}>${Icon("lucide:maximize-2", "text-lg opacity-70")}${sys("clean", loc)}</button>
      ${!subbed ? html`<button data-subscribe class=${row} onClick=${() => { subscribe({ name: title, url: src }); close(); }}>${Icon("lucide:plus", "text-lg opacity-70")}${T(t, "sub")}</button>` : null}
      ${openIn ? html`<button data-open-page class=${row} onClick=${() => { close(); openIn(); }}>${Icon("lucide:external-link", "text-lg opacity-70")}${T(t, "openBrowser")}</button>` : null}
    </div>
  <//>`;
}

function SourceIsland({ S, t, src, title, depth, dive, watch }) {
  /* btn-GHOST on every control in here, for the island's own reason: `.btn:not(.btn-ghost)` carries
     --sf-drop, the extrusion pair, and the pair's light half has nothing to shade against on a black media
     surface — it draws a white ring instead. In the light theme (--nm-light is bright) each of these
     circles came out haloed inside an island that was itself hard-outlined in white. Same fix as the island
     box and the clean-screen door; a utility cannot reach it, the DaisyUI rule is (0,4,0). */
  const act = "btn btn-ghost btn-sm btn-circle shrink-0 border border-white/20 bg-white/10 text-white";
  return html`<${Island} pinned at="bottom" tone="dark" className="flex items-center gap-1 min-w-0 max-w-full rounded-full">
      ${depth ? html`<button data-feed-back class="btn btn-ghost btn-sm btn-circle text-white shrink-0" aria-label=${T(t, "back")} onClick=${() => popFrame(S)}>${Icon("lucide:chevron-left", "text-xl")}</button>` : null}
      <${Favicon} url=${src} size="w-6 h-6" />
      ${/* The title gets the whole middle. The host used to sit beside it and, at 384px, the two of them
            truncated EACH OTHER — "Free stoc…" next to "mixk…", which is two half-words and no name. The
            favicon already says which site this is; the host stays where it is precision, the sources list. */""}
      <span data-island-label class="text-sm text-white truncate min-w-0 pl-0.5 pr-1">${title}</span>
      ${/* One door instead of three. Clean screen, subscribe and the trip to the site all used to sit out
            here as their own circles; with the export actions added that would have been eight controls in a
            pill 384px wide, which is a control panel laid over the thing it is supposed to keep out of the
            way of. What stays outside is what you reach for WITHOUT deciding — the way back, the way in, and
            play. Everything else is one tap deeper, in a sheet the system Back closes. */""}
      <button data-more class=${act} aria-label=${T(t, "more")} onClick=${() => S.screen.set("more")}>${Icon("lucide:ellipsis", "text-base")}</button>
      ${/* The white "Watch" pill, absorbed. It used to appear ONLY while the clip could not play here (a
            signed ephemeral URL, or a player that errored) — on the theory that a clip which plays needs no
            way out. That theory read the failure backwards: "it plays" is decided by the browser, in a CORS
            check we cannot see from here, so the condition hid the escape hatch exactly when the surface was
            blank. The page is always worth reaching, so the control is always there. It stays a circle and
            never carries a word: filled with a word, on a black media surface, it was the brightest thing on
            the screen.
            It plays HERE, so the glyph stays `play` and never becomes an external-link — an external-link on
            a control that opens an in-app player is the icon lying about where the tap goes. The trip that
            really leaves (what only the site itself has: the rest of the page, its comments, an account)
            moved into the sheet, where it can afford to carry its name instead of a glyph. */""}
      ${watch ? html`<button data-watch class="btn btn-ghost btn-sm btn-circle shrink-0 border-0 bg-primary text-primary-content" aria-label=${T(t, "watch")} onClick=${watch}>${Icon("lucide:play", "text-base")}</button>` : null}
      ${/* forward is the mirror of back: the page this clip lives on. The destination's NAME is not written
            here — it is what the drag reveals under the finger — so the label rides the a11y name instead. */""}
      ${dive ? html`<button data-dive class=${act} aria-label=${`${T(t, "dive")}: ${dive.label}`} onClick=${dive.go}>${Icon("lucide:chevron-right", "text-lg")}</button>` : null}
    <//>
  `;
}

// What the drag reveals underneath the feed: the destination, on the side the finger is uncovering. Painted
// by ref (opacity written straight to the nodes from usePanX's onDrag) — a re-render per pointermove would
// stutter the very gesture it is drawing.
function DragReveal({ underRef, diveRef, backRef, target, targetLabel, prev }) {
  // The layer the reel slides OFF is a recess, not a darker page: base-200 and base-100 are the same colour
  // by design, so the tone step it used to lean on painted nothing at all. `sf-inset` is the word for it.
  return html`<div ref=${underRef} aria-hidden="true" class="fixed inset-0 z-0 sf-inset opacity-0">
    ${prev ? html`<div ref=${backRef} class="absolute inset-y-0 left-0 w-40 flex flex-col items-center justify-center gap-2 px-3 text-center opacity-0">
      ${Icon("lucide:corner-up-left", "text-2xl text-primary")}
      <span class="text-sm font-medium text-base-content truncate max-w-full">${prev.label}</span>
    </div>` : null}
    ${target ? html`<div ref=${diveRef} class="absolute inset-y-0 right-0 w-40 flex flex-col items-center justify-center gap-2 px-3 text-center opacity-0">
      <${Favicon} url=${target} size="w-10 h-10" />
      <span class="text-sm font-medium text-base-content truncate max-w-full">${targetLabel}</span>
      ${Icon("lucide:chevrons-right", "text-2xl text-primary")}
    </div>` : null}
  </div>`;
}

function FeedSurface({ S, t, toast }) {
  const items = useStore($items), loading = useStore($loading), err = useStore($err);
  const active = useStore($active), next = useStore($next), ephemeral = useStore($ephemeral);
  const src = useStore($src), frames = useStore($frames), subs = useStore($subs), restoreTo = useStore($restoreTo);
  const title = useStore($srcTitle);
  /* While the full clip is up, the reel underneath must stop. Two elements playing at once is two soundtracks
     and two decoders, and the preview is the last thing anyone wants to hear over the thing they opened. It
     rides the ACTIVE flag rather than a new mechanism, so the existing play effect handles it and the element
     is never torn down — swiping back finds the slide exactly where it was left. */
  const screen = useStore(S.screen);
  const suspended = screen === "full";
  const clean = useStore(S.clean);
  const underRef = useRef(), diveRef = useRef(), backRef = useRef();
  const target = diveTarget(items[active], src);
  // The destination is named by the clip you're leaving on — the reveal under the finger says where you land,
  // and "Mixkit" (all a `/watch/10241/` URL can yield) is not where you land.
  const targetLabel = target ? sourceTitle(target, { hint: items[active]?.title }) : "";
  const prev = frames.length ? frames[frames.length - 1] : null;

  // The drag IS the navigation: pull the reel left to fall into the page this clip came from, right to come
  // back. The pane follows the finger 1:1 (usePanX), so it reads as moving the reel itself, not pressing a
  // button; `touch-pan-y` keeps the vertical scroll native, and a real drag swallows the tap it would fire.
  const { paneRef, pan } = usePanX({
    threshold: 64,                                                   // a full-screen move deserves a firmer commit than a card flick
    canNext: !!target, canPrev: frames.length > 0,
    onNext: () => diveTo(S, target, items[active]?.title),
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
    /* …and the clean screen dies with the surface it was clearing. It is a property of THIS full-bleed
       thing, not of the app, and the runtime cannot know that — S.clean sits BELOW S.stack in the overlay
       order, so a Back taken from the Liked feed pops the stack first and lands on the liked GRID, which
       would otherwise render with no app bar, no dock and a "show controls" button as its only navigation.
       A dive is the opposite case and stays clean on purpose: the surface never went away, only its source.
       Setting the atom here is also what BALANCES history — the overlay listener sees the count fall and
       consumes clean's own entry with the same go(-1) a tap on the door would. */
    return () => { root.removeAttribute("data-feed"); S.clean.set(false); };
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
        : items.map((it, i) => html`<${Slide} S=${S} item=${it} idx=${i} active=${i === active && !suspended} near=${Math.abs(i - active) <= PRELOAD} ephemeral=${it.eph != null ? it.eph : ephemeral} key=${(it.orig || it.video) + i} />`);

  // The island's controls belong to the ACTIVE clip, so they are derived here, once, from `items[active]` —
  // never per slide. The way out is unconditional: whether the clip plays inline is a browser/CORS verdict
  // this code never sees, so gating the link on it hid the link precisely when the slide was a dead poster.
  const cur = items[active];
  const watch = cur ? (cur.page || cur.orig || cur.video) : null;
  const dive = target ? { label: targetLabel, go: () => diveTo(S, target, cur?.title) } : null;

  return html`<${Fragment}>
    <${DragReveal} underRef=${underRef} diveRef=${diveRef} backRef=${backRef} target=${target} targetLabel=${targetLabel} prev=${prev} />
    ${/* The reel scrolls, so a keyboard has to be able to drive it — and now it MUST be stated here: every
          slide used to contain a link, which is what quietly made this region reachable. With the slide
          empty, the region carries its own focus and its own name (axe: scrollable-region-focusable). */""}
    <div ref=${paneRef} ...${pan} data-scroller tabindex="0" role="region" aria-label=${T(t, "tabReel")} class="fixed inset-0 z-[1] bg-black overflow-y-auto snap-y snap-mandatory overscroll-y-contain touch-pan-y will-change-transform">${body}</div>
    ${/* The island is the app's half of the clean screen: the runtime takes its own chrome off, this comes
          off with it, and what is left is the video and the swipe. Unmounted rather than faded — a
          transparent island still eats the taps under it, which on this surface is the whole gesture. */""}
    ${clean ? null : html`<${SourceIsland} S=${S} t=${t} src=${src} title=${title} subbed=${subs.some((s) => s.url === src)} depth=${frames.length}
      dive=${dive} watch=${watch ? () => openFull(S, cur) : null} />`}
    ${/* The island's overflow. Rendered HERE rather than in reel(), because this surface is what the Liked
          tab plays through too — hanging it off the tab would give the same feed two different sets of
          actions depending on which way you arrived at it. */""}
    ${screen === "more" ? html`<${MoreSheet} S=${S} t=${t} toast=${toast} item=${cur} src=${src} title=${title}
      subbed=${subs.some((s) => s.url === src)} openIn=${watch ? () => openExternal(watch) : null} />` : null}
    ${/* Lives with the feed, not with the tab, so it works identically from Liked — one engine, one overlay. */""}
    ${suspended ? html`<${FullClip} S=${S} t=${t} />` : null}
  </${Fragment}>`;
}

// ---- reel (the feed) --------------------------------------------------------
export function reel({ S, toast }) {
  const t = useStore(S.t), screen = useStore(S.screen);
  return html`<${Fragment}>
    <${FeedSurface} S=${S} t=${t} toast=${toast} />
    ${screen === "source" ? html`<${SourceSheet} S=${S} t=${t} />` : null}
  </${Fragment}>`;
}

// ---- sources (subscriptions + ready channels, grouped by site) ---------------
// A site is the unit, not a URL: dive into a video's page, subscribe, and that page joins its site's card as
// another channel. Rows carry the page's TITLE (sitelabel.sourceTitle: derived from the URL where the URL
// names the page, else the real title saved when you subscribed — no round-trip either way), because a
// truncated raw URL told you nothing and cost a whole line doing it.
// How much name a ROW may show. Not a layout number — the row wraps, so it fits whatever it is given — but a
// ceiling on how much of the screen ONE source may take before it stops being a list. ~2½ lines at 384 px.
const ROW_MAX = 120;
function PageRow({ s, active, subbed, onPlay, onToggle, onOpen, onSession, hasSession, lead, sub, t }) {
  const sr = resolveSearch(s.url);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState(sr.term || "");
  const submit = (e) => { e?.preventDefault?.(); const term = q.trim(); if (term) onPlay({ ...s, url: buildSearchUrl(s.url, term) }); };
  // The playing row is marked by DEPTH, never by a luminance step: this theme's primary and base-content
  // are the same ink, so "active = text-primary" would be 100% vs 100% — the exact trap that hid the dock's
  // active tab for the life of the project. The row it plays from is pressed INTO the card (`sf-inset`) —
  // the material says "selected" without a tint — and the rail stays, readable from across the room.
  return html`<li class=${`flex flex-col ${active ? "sf-inset rounded-2xl" : ""}`}>
    <div class="flex items-center gap-0.5 pr-1">
      <button data-src-row class="flex items-center gap-2.5 flex-1 min-w-0 text-left px-2.5 py-2.5 rounded-xl sf-press" onClick=${() => onPlay(s)}>
        ${lead}
        <span class="min-w-0 flex-1">
          ${/* the saved name is the page's real title — the string the island resolved and renameSub wrote
                back — and it only wins where the URL itself names nothing, so a category page stays "Space",
                not "Mixkit". Fed in as the page's OWN title (which is what it is), the row runs the identical
                priority chain the island ran, on the identical inputs: two surfaces, one answer.
                And it WRAPS. A row is the one place with room for the whole name — the island is a chip
                beside four controls and has to cut, this has a full-width line and can spend two of them —
                so the cap is the row's own (ROW_MAX), not the island's, and there is no `truncate` to cut
                what the cap let through. `break-words` is for the pathological case: a title that is one
                unbroken 60-character token has to break somewhere, and the alternative is a horizontal
                overflow the gates would (rightly) fail. */""}
          <span data-src-title class=${`block break-words leading-snug ${active ? "font-semibold" : ""}`}>${sourceTitle(s.url, { pageTitle: s.name, max: ROW_MAX })}</span>
          ${sub ? html`<span class="block text-[0.7rem] font-mono text-base-content/70 truncate">${sub}</span>` : null}
        </span>
      </button>
      ${sr.searchable ? html`<button data-search-toggle class=${`btn btn-ghost btn-sm btn-circle shrink-0 ${searching ? "text-primary" : "opacity-70"}`} aria-label=${T(t, "search")} aria-pressed=${searching} onClick=${() => setSearching((v) => !v)}>${Icon("lucide:search", "text-lg")}</button>` : null}
      ${onOpen ? html`<button data-open-site class="btn btn-ghost btn-sm btn-circle shrink-0 opacity-70" aria-label=${T(t, "openSite")} onClick=${() => onOpen(s)}>${Icon("lucide:external-link", "text-lg")}</button>` : null}
      ${onSession ? html`<button data-session class=${`btn btn-ghost btn-sm btn-circle shrink-0 ${hasSession ? "text-primary" : "opacity-70"}`} aria-label=${T(t, "sessTitle")} aria-pressed=${hasSession} onClick=${() => onSession(s)}>${Icon("lucide:key-round", "text-lg")}</button>` : null}
      <button class=${`btn btn-ghost btn-sm btn-circle shrink-0 ${subbed ? "text-primary" : "opacity-50"}`} aria-label=${T(t, subbed ? "unsub" : "sub")} data-haptic=${subbed ? "bump" : "off"} onClick=${onToggle}>${Icon(subbed ? "lucide:check" : "lucide:plus", "text-lg")}</button>
    </div>
    ${searching ? html`<form onSubmit=${submit} class="flex items-center gap-2 px-2.5 pb-2.5">
      <label class="input input-sm flex items-center gap-2 rounded-xl flex-1">
        ${Icon("lucide:search", "opacity-50 shrink-0 text-sm")}
        <input data-search-input type="search" inputmode="search" autocomplete="off" class="grow min-w-0" placeholder=${T(t, "searchPh")} aria-label=${T(t, "search")} value=${q} onInput=${(e) => setQ(e.target.value)} />
      </label>
      <button type="submit" class="btn btn-primary btn-sm btn-circle" aria-label=${T(t, "search")}>${Icon("lucide:play")}</button>
    </form>` : null}
  </li>`;
}

// One site. A single page renders as one self-contained row (a header above its only child would be the same
// line twice); two or more get a site header with the page count over hairline-separated page rows.
// The card is the page extruded, on the shallow rung a long scrolling list can afford (`sf-e2`); the site
// you are watching right now stands one rung higher (`sf-e3`) and keeps the primary tint as its FILL. The
// `border-base-300 bg-base-100` / `border-primary/50` hairlines it replaces drew the edge the pair now owns.
function DomainCard({ g, curSrc, subbedUrls, onPlay, onOpen, onToggle, onSession, sessions, t }) {
  const hot = g.items.some((s) => s.url === curSrc);
  const hasSession = !!(sessions && sessions[g.domain]);
  const shell = `rounded-2xl ${hot ? "bg-primary/10 sf-e3" : "sf-raised sf-e2"}`;
  if (g.items.length === 1) {
    const s = g.items[0];
    return html`<ul class=${shell}><${PageRow} s=${s} active=${s.url === curSrc} subbed=${subbedUrls.has(s.url)} onPlay=${onPlay} onOpen=${onOpen} onToggle=${() => onToggle(s)} onSession=${onSession} hasSession=${hasSession} lead=${html`<${Favicon} url=${s.url} size="w-10 h-10" />`} sub=${g.domain} t=${t} /></ul>`;
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
      ${onSession ? html`<button data-session class=${`btn btn-ghost btn-sm btn-circle shrink-0 ${hasSession ? "text-primary" : "opacity-70"}`} aria-label=${T(t, "sessTitle")} aria-pressed=${hasSession} onClick=${() => onSession(g.items[0])}>${Icon("lucide:key-round", "text-lg")}</button>` : null}
    </header>
    <ul class="divide-y divide-base-300/60">
      ${g.items.map((s) => html`<${PageRow} s=${s} active=${s.url === curSrc} subbed=${subbedUrls.has(s.url)} onPlay=${onPlay} onToggle=${() => onToggle(s)} lead=${html`<span class=${`shrink-0 rounded-full ${s.url === curSrc ? "w-1.5 h-5 bg-primary" : "w-1.5 h-1.5 bg-base-content/30"}`}></span>`} t=${t} key=${s.url} />`)}
    </ul>
  </section>`;
}

export function sources({ S, undo }) {
  const t = useStore(S.t), screen = useStore(S.screen);
  const subs = useStore($subs), curSrc = useStore($src), watchedN = useStore($watched).size, sessions = useStore($sessions);
  const editSession = (s) => { $sessSite.set(s.url); S.screen.set("session"); };
  const play = (s) => { resetNav(S); $owner.set("reel"); openSource(s.url, s.name); S.tab.set("reel"); };   // the saved title carries into the island
  const subbedUrls = new Set(subs.map((x) => x.url));
  const mine = groupByDomain(subs);
  const discover = groupByDomain(PRESETS.filter((p) => !subbedUrls.has(p.url)));

  return html`<${Fragment}>
    <div class="flex flex-col gap-4 @container">
      <button id="add-url" class="btn btn-primary rounded-2xl gap-2" onClick=${() => S.screen.set("source")}>${Icon("lucide:plus")} ${T(t, "addUrl")}</button>

      <div class="flex flex-col gap-2.5">
        <div class="text-sm font-semibold px-1 flex items-center gap-1.5">${Icon("lucide:bookmark", "text-primary")} ${T(t, "subs")}</div>
        ${mine.length
          ? mine.map((g) => html`<${DomainCard} g=${g} curSrc=${curSrc} subbedUrls=${subbedUrls} onPlay=${play} onOpen=${openSite} onToggle=${(s) => unsubscribe(s.url)} onSession=${editSession} sessions=${sessions} t=${t} key=${g.domain} />`)
          : html`<div class="text-sm text-base-content/70 px-1 py-3">${T(t, "noSubs")}</div>`}
      </div>

      ${discover.length ? html`<div class="flex flex-col gap-2.5">
        <div class="text-sm font-semibold px-1 flex items-center gap-1.5">${Icon("lucide:compass")} ${T(t, "discover")}</div>
        ${discover.map((g) => html`<${DomainCard} g=${g} curSrc=${curSrc} subbedUrls=${subbedUrls} onPlay=${play} onOpen=${openSite} onToggle=${(s) => subscribe(s)} t=${t} key=${g.domain} />`)}
      </div>` : null}

      ${watchedN > 0 ? html`<button id="clear-watched" class="btn btn-ghost btn-sm rounded-2xl gap-2 text-base-content/70 self-center mt-2" onClick=${clearWatched} data-haptic="bump">${Icon("lucide:rotate-ccw")} ${T(t, "clearWatched", { n: watchedN })}</button>` : null}
    </div>
    ${screen === "source" ? html`<${SourceSheet} S=${S} t=${t} />` : null}
    ${screen === "session" ? html`<${SessionSheet} S=${S} t=${t} undo=${undo} />` : null}
  </${Fragment}>`;
}

// ---- liked (saved reels) ----------------------------------------------------
// A poster grid of the reels you double-tapped, newest first. Tapping a tile plays the liked collection AS A
// FEED RIGHT HERE — the Liked tab becomes the reel, no tab switch, and Back (system or the island chevron)
// brings the grid straight back with the source feed underneath untouched. Removal lives ONLY here.
export function liked({ S, toast }) {
  const t = useStore(S.t), likes = useStore($likes), owner = useStore($owner);
  const sorted = [...likes].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  if (owner === "liked") return html`<${FeedSurface} S=${S} t=${t} toast=${toast} />`;
  const playAt = (i) => {
    pushFrame(S, T(t, "tabLiked"));                       // …so Back returns to THIS grid, one step
    $owner.set("liked"); $ephemeral.set(false); $next.set(null); $err.set(false); $loading.set(false);
    $items.set([...sorted.slice(i), ...sorted.slice(0, i)]);
    $active.set(0); $restoreTo.set(0);
  };
  if (!sorted.length) return html`<div class="flex flex-col items-center justify-center gap-3 text-muted text-center" style="min-height:60vh">${Icon("lucide:heart", "text-6xl opacity-30")}<div class="text-sm max-w-[16rem]">${T(t, "likedEmpty")}</div></div>`;
  return html`<div data-liked class="grid grid-cols-3 gap-1.5">
    ${/* A tile is a SLOT the poster drops into — `sf-inset`. It reads as an empty well until the frame
          lands and fills it, which is what `bg-base-300` was trying to say with a tone step. */""}
    ${sorted.map((l, i) => html`<div class="relative aspect-[9/16] rounded-xl overflow-hidden sf-inset" key=${l.id}>
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
