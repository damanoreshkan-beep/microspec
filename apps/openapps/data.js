// Open apps — a catalogue of open-source applications, straight from GitHub, filtered by the OS they run on.
//
// No view.js: the showcase is `layout: "gallery"`, the drill-down is `spec.detail`, and search / OS filter /
// favourites all come from the list family. The art is the owner's avatar — for a GitHub-sourced catalogue
// that IS the app's mark (Microsoft, Flutter, VLC), and unlike a package feed it is present on every repo.
//
// Source, probed before a line was written:
// • GitHub's Search API answers with `access-control-allow-origin: *` — it needs NO proxy, so every user
//   spends their own 10-req/min search quota rather than sharing ours. This is why it replaced the
//   Chocolatey feed, which had no CORS and lived only behind our VPS proxy. Fetched via viaProxy (direct
//   first) for the same reason frontier does — it is the farm's proven GitHub path.
// • OS categories are GitHub topics, and the counts are real: `topic:windows topic:desktop-app` → 2.7k,
//   macos → 1.2k, linux → 833, `topic:android-app` → 15.8k, and the broad `topic:app` → 17.8k for "All".
//   `-topic:awesome -topic:library -topic:framework -topic:template` strips the link-lists and the SDKs,
//   which are the noise a "which app do I install" catalogue must not show.
// • Sorting by stars is the popularity signal (what people actually run); `updated` surfaces what is alive.
import { viaProxy, isJsonObject } from "/_rt/feed.js";

const API = "https://api.github.com/search/repositories";
const PAGE = 24;

// Each OS category is a topic query. "All" is the broad `topic:app` union of desktop + mobile; the rest pin
// the platform. The exclusions strip awesome-lists, libraries, frameworks and templates from every category.
const OS = {
  "": "topic:app",
  windows: "topic:windows topic:desktop-app",
  macos: "topic:macos topic:desktop-app",
  linux: "topic:linux topic:desktop-app",
  android: "topic:android-app",
};
const EXCLUDE = "-topic:awesome -topic:library -topic:framework -topic:template";

// A GitHub avatar is served at its native size; ?size= asks for a scaled copy so a 3-up grid of tiles is not
// three full-resolution org logos. It already carries ?v=4, so this is a second query param, not the first.
const avatar = (u) => (u ? `${u}${u.includes("?") ? "&" : "?"}size=160` : "");
const num = (n) => { const v = Number(n) || 0; return v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : String(v); };
// pushed_at is an ISO timestamp; the detail wants a real epoch so the runtime renders it locale-aware with
// format:"ago". Never format it here — a baked string freezes one language.
const when = (s) => { const d = new Date(s); return isFinite(+d) ? +d : null; };
// GitHub reports an undetected licence as the literal "NOASSERTION" — that is not a licence name, it is a
// missing value, so it renders as blank rather than as a badge that says nothing.
const lic = (l) => { const id = l?.spdx_id; return id && id !== "NOASSERTION" ? id : ""; };

const query = (os, q) => {
  const base = OS[os] ?? OS[""];
  const term = q ? `${q} ` : "";
  return `${term}${base} ${EXCLUDE}`;
};

export async function load(filters = {}) {
  const q = (filters.q || "").trim();
  const os = filters.os || "";
  const sort = filters.sort === "updated" ? "updated" : "stars";
  // The infinite-scroll cursor arrives as filters.cursor (the `next` we returned last time), NOT a second
  // argument — the runtime calls load({ ...filters, q, cursor }). It IS the last GitHub page number, so the
  // next page is cursor + 1; a first load has no cursor and starts at page 1.
  const page = (Number(filters.cursor) || 0) + 1;

  const params = new URLSearchParams({
    q: query(os, q),
    sort,
    order: "desc",
    per_page: String(PAGE),
    page: String(page),
  });

  const data = JSON.parse(await viaProxy(`${API}?${params}`, isJsonObject, 15000));

  const raw = (data.items || []).length;
  const items = (data.items || []).map((it) => ({
    id: String(it.id),
    title: it.name,
    owner: it.owner?.login || "",
    icon: avatar(it.owner?.avatar_url),
    desc: (it.description || "").slice(0, 600),
    stars: num(it.stargazers_count),
    lang: it.language || "",
    license: lic(it.license),
    updated: when(it.pushed_at),
    url: it.html_url,
  })).filter((it) => it.title);

  // "Is there another page" is a property of the SOURCE, not of our client-side filtering: keying it off the
  // post-filter `items.length` meant one dropped item (empty name) on a full page read as "last page" and
  // killed paging with results still behind it. Use GitHub's own signals — a full RAW page (more likely
  // follows) and the total, capped at the 1000 results the Search API will actually serve (it 422s past
  // them). The cursor we hand back is this page's number; loadMore returns it as filters.cursor → page + 1.
  const total = Math.min(data.total_count ?? 0, 1000);
  const more = raw === PAGE && page * PAGE < total;
  return { items, next: more ? String(page) : undefined };
}
