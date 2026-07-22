// microspec runtime — wishlist logic. Pure helpers (parsing, totals, sort, money) live here with unit
// tests (runtime_test.js); the app (apps/wish/view.js) is just the surface. No rendering, no DOM.
//
// Link prefill reuses the farm's metadata path — Jina Reader (r.jina.ai, CORS-direct, keyless, fail-open),
// the same source enrich.js uses for article previews — so there is NO new proxy. fetchWishMeta() is the
// only side-effecting export; everything else is pure. The gate never calls it (the view guards on isGate).

const NBSP = " ";                                 // groups thousands / separates symbol; never breaks

// Currency tokens → ISO code. Symbols and codes both, plus the Ukrainian «грн».
const CUR = {
  "$": "USD", "us$": "USD", "usd": "USD",
  "€": "EUR", "eur": "EUR",
  "£": "GBP", "gbp": "GBP",
  "₴": "UAH", "uah": "UAH", "грн": "UAH", "грн.": "UAH",
  "zł": "PLN", "zl": "PLN", "pln": "PLN",
};
export const CURRENCIES = ["UAH", "USD", "EUR", "GBP", "PLN"];
const SYMBOL = { UAH: "₴", USD: "$", EUR: "€", GBP: "£", PLN: "zł" };
const SUFFIX = { UAH: true, PLN: true };               // symbol trails the number (14 200 ₴ / 199 zł)

const curOf = (tok) => CUR[String(tok || "").toLowerCase()] || null;

// toNumber("1 299,00") → 1299 · ("1,299.00") → 1299 · ("14 200") → 14200 · ("199,90") → 199.9
export function toNumber(raw) {
  let s = String(raw || "").replace(/\s/g, "");        // drop all whitespace incl. NBSP / narrow NBSP
  if (!s) return null;
  const hasDot = s.includes("."), hasComma = s.includes(",");
  if (hasDot && hasComma) s = s.replace(/,/g, "");                 // both → comma = thousands, dot = decimal
  else if (hasComma) s = /,\d{2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, ""); // ,dd decimal else thousands
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

const CUR_RE = "\\$|€|£|₴|zł|zl|us\\$|usd|eur|gbp|uah|pln|грн\\.?";
const NUM_RE = "\\d[\\d.,\\u00a0\\u202f ]*\\d|\\d";
// A price = a number ANCHORED to a currency token (before or after). A bare number is ignored so we never
// mistake a model number ("iPhone 15") for a price. First anchored amount wins.
const PRICE_RE = new RegExp(`(?:(${CUR_RE})\\s*)?(${NUM_RE})(?:\\s*(${CUR_RE}))?`, "gi");

export function parsePrice(text) {
  const s = String(text || "");
  for (const m of s.matchAll(PRICE_RE)) {
    const cur = curOf(m[1]) || curOf(m[3]);
    if (!cur) continue;                                             // no currency anchor → not a price
    const price = toNumber(m[2]);
    if (price == null || price <= 0) continue;
    return { price, currency: cur };
  }
  return null;
}

// Pick a preview image from a Jina `data` object: its `images` map first, else the first markdown image in
// the content body. Returns "" on none.
function pickImage(data) {
  const imgs = data && data.images;
  if (imgs && typeof imgs === "object") {
    for (const v of Object.values(imgs)) if (typeof v === "string" && /^https?:\/\//.test(v)) return v;
  }
  const m = String(data && data.content || "").match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/);
  return m ? m[1] : "";
}

// parseWishMeta(jinaData, url) → { title, image, price, currency }. Pure: no fetch. Fields are best-effort;
// any of them may be "" / null and the caller keeps whatever the user already typed.
export function parseWishMeta(data, url) {
  data = data || {};
  const title = String(data.title || "").replace(/\s+/g, " ").trim().slice(0, 80);
  const body = `${data.title || ""} ${data.description || ""} ${String(data.content || "").slice(0, 4000)}`;
  const p = parsePrice(body);
  return { title, image: pickImage(data), price: p ? p.price : null, currency: p ? p.currency : null };
}

// fetchWishMeta(url) — thin Jina Reader wrapper. Returns parsed meta or throws (caller is fail-open). NEVER
// call from the gate: the view guards this behind isGate so headless renders deterministically.
export async function fetchWishMeta(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch("https://r.jina.ai/" + url, { signal: ctrl.signal, headers: { Accept: "application/json", "X-Timeout": "8" } });
    if (!r.ok) throw new Error("status " + r.status);
    const data = (await r.json())?.data || {};
    return parseWishMeta(data, url);
  } finally { clearTimeout(t); }
}

// sortWishes — most-wanted first (want 3→1), then newest. Stable, non-mutating.
export function sortWishes(list) {
  return [...(list || [])].sort((a, b) => (b.want || 0) - (a.want || 0) || (b.createdAt || 0) - (a.createdAt || 0));
}

// wishTotals — per-currency sums over the NON-granted items (mixed currencies can't be summed, so group).
// → [{ currency, sum, count }], currencies in CURRENCIES order.
export function wishTotals(list) {
  const by = {};
  for (const w of list || []) {
    if (w.granted || w.price == null || !(w.price > 0)) continue;
    const c = w.currency || "UAH";
    (by[c] || (by[c] = { currency: c, sum: 0, count: 0 }));
    by[c].sum += w.price; by[c].count += 1;
  }
  return CURRENCIES.filter((c) => by[c]).map((c) => by[c]);
}

// fmtMoney(14200,"UAH") → "14 200 ₴" · fmtMoney(1299,"USD") → "$1 299" (spaces are NBSP). Up to 2 decimals
// only when non-integer.
export function fmtMoney(n, currency) {
  if (n == null || !Number.isFinite(n)) return "";
  const sym = SYMBOL[currency] || "";
  const int = Math.trunc(Math.abs(n));
  const grouped = String(int).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const frac = Math.round((Math.abs(n) - int) * 100);
  const num = (n < 0 ? "-" : "") + grouped + (frac ? "," + String(frac).padStart(2, "0") : "");
  return SUFFIX[currency] ? num + NBSP + sym : sym + num;
}
