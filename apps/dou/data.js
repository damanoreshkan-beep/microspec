// DOU data adapter. Returns { items (tagged bron), meta:{bron,rest,categories} }.
//
// DOU sends NO CORS, so it routes through a proxy we control: the dev `/feed` on localhost, and our own
// hardened proxy on the VPS in production (see proxy/feed-proxy.mjs + deploy notes). The URL comes from the
// runtime so there is one place to change it, not one per app.
import { VPS_PROXY } from "/_rt/feed.js";
const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const proxied = (u) => (isLocal ? "/feed" : VPS_PROXY) + "?url=" + encodeURIComponent(u);

async function fetchFeed(url, ok) {
  const r = await fetch(proxied(url));
  const t = await r.text();
  if (!ok(t)) throw new Error("bad feed");
  return t;
}

const okFeed = (x) => x.includes("<item") || x.includes("<option");
const PAGE = "https://jobs.dou.ua/vacancies/";
const SEARCH = "&search=%D0%B1%D1%80%D0%BE%D0%BD%D1%8E%D0%B2%D0%B0%D0%BD%D0%BD%D1%8F";
const feedBase = (c) => "https://jobs.dou.ua/vacancies/feeds/?category=" + encodeURIComponent(c);
const TECH = ["React", "Vue", "Nuxt", "Next", "Angular", "Svelte", "TypeScript", "JavaScript", "Node", "Astro", "RxJS", "Pinia", "Redux", "GraphQL", "Tailwind"];

function parseTitle(t) {
  const i = t.indexOf(" в ");
  let position = t.trim(), company = "", locs = [];
  if (i >= 0) { position = t.slice(0, i).trim(); const r = t.slice(i + 3).split(",").map((s) => s.trim()).filter(Boolean); company = r.shift() || ""; locs = r; }
  const remote = /віддален|remote/i.test(t), abroad = /за кордоном/i.test(t);
  const salary = (t.match(/\$\s?[\d\s.–-]*\d|\d[\d\s]*грн/) || [])[0] || "";
  const city = locs.find((l) => !/\$|грн|віддален|remote|за кордоном/i.test(l)) || "";
  return { position, company, city, remote, abroad, salary };
}
function parse(xml, bron) {
  const d = new DOMParser().parseFromString(xml, "text/xml");
  return [...d.querySelectorAll("item")].map((it) => {
    const g = (s) => it.querySelector(s)?.textContent?.trim() || "";
    const tmp = document.createElement("div"); tmp.innerHTML = g("description");
    // Block elements carry no text of their own, so textContent concatenates their contents with nothing
    // between them: "<b>Роль</b><p>Завдання…</p>" came out as "РольЗавдання", and a <ul> of technologies as
    // "ReactTypeScript". Insert a space at every block boundary first; the \s+ collapse below tidies the rest.
    for (const el of tmp.querySelectorAll("p,div,br,li,tr,h1,h2,h3,h4,h5,h6,section,article,blockquote")) {
      el.parentNode?.insertBefore(document.createTextNode(" "), el);
    }
    const desc = tmp.textContent.replace(/\s+/g, " ").trim();
    const m = parseTitle(g("title"));
    const tech = TECH.filter((k) => new RegExp("\\b" + k.replace("+", "\\+"), "i").test(m.position + " " + desc)).slice(0, 3);
    return { ...m, link: g("link"), bron, tech, desc: desc.slice(0, 600), ts: new Date(g("pubDate")).getTime() };
  });
}
let _cats = null;
async function cats() {
  if (_cats) return _cats;
  try { const doc = new DOMParser().parseFromString(await fetchFeed(PAGE, okFeed), "text/html"); _cats = [...doc.querySelectorAll('select[name="category"] option')].map((o) => ({ v: o.value, l: o.textContent.trim() })); }
  catch { _cats = []; }
  return _cats;
}
export async function load(filters) {
  const cat = filters.category || "Front End";
  const ex = filters.exp ? "&exp=" + filters.exp : "";
  const [b, a, c] = await Promise.allSettled([fetchFeed(feedBase(cat) + SEARCH + ex, okFeed), fetchFeed(feedBase(cat) + ex, okFeed), cats()]);
  const bronL = b.status === "fulfilled" ? parse(b.value, true) : [];
  const all = a.status === "fulfilled" ? parse(a.value, false) : [];
  if (b.status !== "fulfilled" && a.status !== "fulfilled") throw new Error("feeds");
  const seen = new Set(bronL.map((j) => j.link));
  const rest = all.filter((j) => !seen.has(j.link));
  return { items: [...bronL, ...rest], meta: { bron: bronL.length, rest: rest.length, categories: c.status === "fulfilled" ? c.value : [] } };
}
