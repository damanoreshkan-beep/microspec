// Кіно — public-domain feature films from the Internet Archive, watched in the app.
//
// This app has no view.js, and that is the point: it is a spec plus this adapter. The player it opens —
// screen kept awake, picture-in-picture, fullscreen, resume where you left off — is the runtime's, reached
// by declaring `"play": "video"` in detail.actions. If a video app needs its own view, video isn't in the
// system yet; it is.
//
// Everything below was measured against the live API before it was written, not assumed:
//
// • `format:("h.264")` is INDEXED — so the search itself only ever returns films with a browser-playable
//   derivative (16k of them). Filtering server-side is what makes the next line safe.
// • `download/<id>/format=h.264` 302s straight to that derivative. So the video URL is DERIVABLE from the
//   identifier, and this app makes exactly ONE request per page. The obvious alternative — read each item's
//   file list to find its video — costs ~22 KB × every film on screen, roughly half a megabyte a page, for
//   a URL we can compute.
// • Taking an item's ORIGINAL file would be the trap: it is routinely a 773 MB Cinepak .avi that no browser
//   can decode, sitting right next to the h.264 that plays. `format=` sidesteps that entirely.
// • Search + metadata send `access-control-allow-origin: *` → fetched directly, no proxy. The video and the
//   thumbnail do NOT, and do not need to: <video src> and <img src> load cross-origin without CORS. (A
//   fetch() of those bytes would fail, and drawing frames to a canvas would taint it — neither is done.)
const API = "https://archive.org/advancedsearch.php";
const Q = 'collection:(feature_films) AND mediatype:(movies) AND format:("h.264")';
const FIELDS = ["identifier", "title", "year", "description", "downloads"];

// IA descriptions are user-submitted: sometimes an array, usually HTML, occasionally an essay. The card
// wants a sentence. Tags are stripped rather than rendered — the runtime prints text, and a card is not a
// place to run someone else's markup.
const clean = (d) => {
  const raw = Array.isArray(d) ? d.join(" ") : typeof d === "string" ? d : "";
  return raw
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(nbsp|amp|quot|#39|lt|gt);/gi, (m) => ({ "&nbsp;": " ", "&amp;": "&", "&quot;": '"', "&#39;": "'", "&lt;": "<", "&gt;": ">" }[m.toLowerCase()] || " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
};

// Год is a free-text field here: plenty of items have none, and some carry junk. A badge must not print a
// question mark — an absent year is simply not shown.
const year = (y) => { const n = parseInt(Array.isArray(y) ? y[0] : y, 10); return n >= 1870 && n <= 2100 ? String(n) : ""; };
const views = (n) => { const v = Number(n) || 0; return v >= 1000 ? `${Math.round(v / 1000)}k` : v ? String(v) : ""; };

export async function load() {
  const u = new URL(API);
  u.searchParams.set("q", Q);
  for (const f of FIELDS) u.searchParams.append("fl[]", f);
  u.searchParams.append("sort[]", "downloads desc");     // what people actually watch, not what was uploaded last
  u.searchParams.set("rows", "60");
  u.searchParams.set("page", "1");
  u.searchParams.set("output", "json");

  const r = await fetch(u);
  if (!r.ok) throw new Error(`archive.org ${r.status}`);
  const j = await r.json();

  const items = (j.response?.docs || [])
    .filter((d) => d.identifier && d.title)
    .map((d) => {
      const id = encodeURIComponent(d.identifier);
      return {
        id: d.identifier,
        title: Array.isArray(d.title) ? d.title[0] : d.title,
        desc: clean(d.description),
        year: year(d.year),
        views: views(d.downloads),
        thumb: `https://archive.org/services/img/${id}`,
        video: `https://archive.org/download/${id}/format=h.264`,
        url: `https://archive.org/details/${id}`,
      };
    });
  return { items };
}
