// authorless — a deterministic app generator. NO LLM. Point: the moat isn't the model, it's the contract
// + runtime + gates. A plain function turns a recipe (source URL + a field map) into a full list-family app
// — spec.json + data.js + i18n + brand — that passes the SAME ajv + preflight + Chromium gates as any hand-
// or Claude-authored app. Swap the author, keep the floor. That's the answer to "it's just an AI wrapper".
//
//   deno run -A packages/gen/authorless.mjs recipes/books.json            # → apps/<id>/
//   deno run -A packages/gen/authorless.mjs recipes/books.json --check    # generate to a temp dir + validate only
//
// A recipe (see recipes/*.json): { id, source, proxy?, root, map, urlTemplate?, compact?, translate?,
// badges?, brand, source_url, i18n:{uk,en} }. map values are dot/array paths ("authors.0.name").

const recipePath = Deno.args[0];
const check = Deno.args.includes("--check");
if (!recipePath) { console.error("usage: authorless.mjs <recipe.json> [--check]"); Deno.exit(2); }
const R = JSON.parse(await Deno.readTextFile(recipePath));

// Boilerplate strings every list+fav+profile app needs — the recipe only supplies the few app-specific ones.
// Kept in lockstep uk⇄en so the locale-parity gate stays green automatically.
const BASE = {
  uk: { tabSaved: "Збережені", tabMe: "Я", searchSaved: "Шукати у збережених…", status: "", open: "Відкрити",
    statusLoading: "Оновлення…", statusError: "Дані недоступні", savedCount: "{n} збережено",
    noResults: "Нічого не знайдено", noResultsHint: "Спробуй інший запит", errorHint: "Перевір зʼєднання та онови",
    emptySaved: "Ще нічого не збережено", emptySavedHint: "Тисни закладку на картці, щоб зберегти сюди",
    favAria: "Зберегти", unfavAria: "Прибрати зі збережених", profTheme: "Темна тема", profLang: "Мова",
    install: "Встановити застосунок", installTitle: "Встановлення", installBtn: "Встановити",
    installDesc: "Працює офлайн, відкривається як застосунок", installIosHint: "У Safari: «Поділитися» → «На початковий екран».",
    installGenericHint: "У меню браузера обери «Встановити».", close: "Закрити", refresh: "Оновити",
    toastSaved: "Збережено", toastRemoved: "Видалено зі збережених" },
  en: { tabSaved: "Saved", tabMe: "Me", searchSaved: "Search saved…", status: "", open: "Open",
    statusLoading: "Refreshing…", statusError: "Data unavailable", savedCount: "{n} saved",
    noResults: "Nothing found", noResultsHint: "Try another query", errorHint: "Check your connection and refresh",
    emptySaved: "Nothing saved yet", emptySavedHint: "Tap the bookmark on a card to save it here",
    favAria: "Save", unfavAria: "Remove from saved", profTheme: "Dark theme", profLang: "Language",
    install: "Install app", installTitle: "Install", installBtn: "Install",
    installDesc: "Works offline, opens as an app", installIosHint: "In Safari: Share → Add to Home Screen.",
    installGenericHint: "In the browser menu choose Install.", close: "Close", refresh: "Refresh",
    toastSaved: "Saved", toastRemoved: "Removed from saved" },
};

// ---- spec.json (list family) ----
const badges = (R.badges || []).map((b) => ({ field: b.field, icon: b.icon, variant: b.variant || "ghost" }));
// The card drills IN, never out: `more` is the affordance, and the outbound link lives in detail.actions.
// A generated app gets a detail unconditionally — the contract requires one for any card with an href
// (see packages/runtime/validate.js), and a card is a 2-line clamp of a body that is usually far longer.
const card = { layout: "feed", href: "url", title: "title", subtitle: "author", body: "desc", more: "open", badges };
const detail = {
  ...(R.detail?.image ? { image: R.detail.image, ...(R.detail.imageFit ? { imageFit: R.detail.imageFit } : {}) } : {}),
  title: "title",
  ...(R.detail?.subtitle ? { subtitle: R.detail.subtitle } : { subtitle: "author" }),
  body: R.detail?.body || "desc",                       // the FULL text — the card only ever shows 2 lines of it
  rows: R.detail?.rows || [],
  // Always end with the source link. Recipe actions come first (a direct read/download beats a landing page).
  actions: [...(R.detail?.actions || []), { icon: "lucide:external-link", label: "open", href: "url" }],
};
const spec = {
  id: R.id, theme: R.theme || "signal",
  ...(R.translate ? { translate: R.translate } : {}),
  fav: { key: "id" },
  detail,
  tabs: [
    { id: "feed", type: "list", icon: R.icon || "lucide:layers", label: "tabFeed", search: true, searchKey: "search", statusKey: "status",
      empty: { icon: "lucide:search-x", text: "noResults", hint: "noResultsHint" }, card },
    { id: "saved", type: "list", icon: "lucide:bookmark", label: "tabSaved", source: "fav", titleKey: "tabSaved",
      search: true, searchKey: "searchSaved", empty: { icon: "lucide:bookmark", text: "emptySaved", hint: "emptySavedHint" }, card },
    { id: "me", type: "profile", icon: "lucide:user", label: "tabMe", titleKey: "tabMe" },
  ],
  profile: { icon: R.icon || "lucide:layers", theme: true, lang: true, install: true,
    source: { label: "profSource", url: R.source_url || R.source, icon: "lucide:database" } },
};

// ---- data.js ----
const compactFields = JSON.stringify(R.compact || []);
// `join`: fields whose source value is an ARRAY (subjects, categories, languages…). They must be flattened
// here, in the adapter — a raw array handed to the runtime renders as its elements glued together with no
// separator ("AdventureFictionWhaling"), which looks like corrupt data rather than a list. `cap` bounds the
// long ones so a detail row stays a row instead of a wall.
const joinFields = JSON.stringify(R.join || []);
const joinCap = Number(R.joinCap) || 8;
const data = `// GENERATED by packages/gen/authorless.mjs from ${recipePath.split("/").pop()} — deterministic, no LLM.
${R.proxy ? 'import { viaProxy, isJsonObject } from "/_rt/feed.js";' : ""}
const pick = (o, path) => path.split(".").reduce((v, k) => (v == null ? v : v[k]), o);
const compact = (n) => { n = Number(n) || 0; if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\\.0$/, "") + "M"; if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\\.0$/, "") + "K"; return String(n); };
const COMPACT = new Set(${compactFields});
const JOIN = new Set(${joinFields});
const JOIN_CAP = ${joinCap};
const joinList = (v) => Array.isArray(v) ? v.slice(0, JOIN_CAP).join(", ") : (v ?? "");
const MAP = ${JSON.stringify(R.map)};
const URLT = ${JSON.stringify(R.urlTemplate || "")};

export async function load(filters = {}) {
  const q = (filters.q || "").trim();
  const url = ${JSON.stringify(R.source)}${R.searchParam ? ` + (q ? "${R.searchParam}" + encodeURIComponent(q) : "")` : ""};
  ${R.proxy ? "const raw = await viaProxy(url, isJsonObject); const data = JSON.parse(raw);" : "const data = await (await fetch(url)).json();"}
  const rows = ${R.root ? `pick(data, ${JSON.stringify(R.root)})` : "data"} || [];
  const items = rows.map((r) => {
    const it = {};
    for (const k in MAP) { let v = pick(r, MAP[k]); if (JOIN.has(k)) v = joinList(v); if (COMPACT.has(k)) v = compact(v); it[k] = v == null ? "" : v; }
    it.url = URLT ? URLT.replace(/\\{(\\w+)\\}/g, (_, f) => pick(r, f) ?? "") : it.url;
    return it;
  }).filter((it) => it.id != null && it.title);
  return { items, meta: {} };
}
`;

// ---- i18n (merge BASE + recipe) ----
const i18n = {};
for (const loc of ["uk", "en"]) {
  const r = (R.i18n && R.i18n[loc]) || {};
  i18n[loc] = { title: r.title || R.id, tabFeed: r.tabFeed || (loc === "uk" ? "Каталог" : "Catalog"),
    search: r.search || (loc === "uk" ? "Пошук…" : "Search…"),
    profTagline: r.profTagline || "", profSource: r.profSource || (loc === "uk" ? "Джерело" : "Source"),
    ...BASE[loc], ...r };
}

// ---- e2e (generic list) ----
const e2e = `// GENERATED (authorless) — structural list e2e; works for any generated feed app.
const load = async (h) => { for (let i = 0; i < 24; i++) { if ((await h.count("[data-fav]")) > 0) break; await h.wait(500); } };
export default [
  { name: "стрічка вантажиться з картками", run: async (h) => { await load(h);
    h.expect((await h.count(".card")) > 3, "немає карток"); } },
  { name: "картка відкриває деталі, а не викидає з апки", run: async (h) => { await load(h);
    h.expect((await h.count(".card[href]")) === 0, "картка — зовнішнє посилання; тап має вести в деталі");
    await h.click(".aw-tap"); await h.wait(350);
    h.expect((await h.count("#detail-back")) === 1, "деталі не відкрились");
    h.expect(/^https?:/.test(await h.attr("a.btn-primary", "href")), "у деталях немає кнопки відкрити джерело");
    await h.back(); await h.wait(250);
    h.expect((await h.count("#detail-back")) === 0, "Back не закрив деталі"); } },
  { name: "пошук звужує до 0 і відновлює", run: async (h) => { await load(h);
    const base = await h.count(".card"); await h.type("#filter", "zzzzнемає"); await h.wait(250);
    h.expect((await h.count(".card")) < base, "пошук не звузив");
    await h.type("#filter", ""); await h.wait(250);
    h.expect((await h.count(".card")) >= base, "не відновив"); } },
  { name: "збереження: закладка → Збережені", run: async (h) => { await load(h);
    await h.click("[data-fav]"); await h.wait(150); await h.click('[data-tab="saved"]'); await h.wait(200);
    h.expect((await h.count("[data-fav]")) >= 1, "не зберігся"); await h.click('[data-tab="feed"]'); await h.wait(120); } },
  { name: "i18n EN/UA", run: async (h) => {
    await h.click('[data-tab="me"]'); await h.wait(150); await h.click('[data-loc="en"]'); await h.wait(250);
    h.expect(/Language|Saved/i.test(await h.bodyText()), "не EN");
    await h.click('[data-loc="uk"]'); await h.wait(250); h.expect(/Мова|Збережені/.test(await h.bodyText()), "не UA");
    await h.click('[data-tab="feed"]'); await h.wait(120); } },
  { name: "PWA: install-модалка, Back закриває", run: async (h) => {
    await h.click('[data-tab="me"]'); await h.wait(150); await h.click("#p-install"); await h.wait(150);
    h.expect((await h.prop("#install", "open")) === true, "не відкрилась");
    await h.back(); await h.wait(200); h.expect((await h.prop("#install", "open")) !== true, "Back не закрив"); } },
];
`;

// brand.svg — the glyph the PWA icons are cut from. Without it build.mjs generates NO PNG icons and Chrome
// refuses to install the app (an SVG-only manifest is not installable) — which is exactly what shipped for
// `books`: it had a placeholder square for an icon and no install prompt at all, green through every gate.
// The geometry comes from lucide-static at a PINNED version, so the generator stays deterministic and no
// model invents a path. icons.mjs supplies the <svg>/<g> wrapper and the stroke settings, so we keep only
// the raw shapes — the same shape a hand-authored brand.svg has.
const LUCIDE = "0.544.0";
async function brandSvg(icon) {
  const name = String(icon || "").replace(/^lucide:/, "").trim();
  if (!name) throw new Error("recipe.icon is required — it becomes the app's PWA icon");
  const r = await fetch(`https://unpkg.com/lucide-static@${LUCIDE}/icons/${name}.svg`);
  if (!r.ok) throw new Error(`recipe.icon "${icon}": lucide-static has no "${name}.svg" (HTTP ${r.status})`);
  const shapes = [...(await r.text()).matchAll(/<(?:path|circle|rect|line|polyline|polygon|ellipse)\b[^>]*\/>/g)].map((m) => m[0].replace(/\s+/g, " ").trim());
  if (!shapes.length) throw new Error(`lucide icon "${name}" yielded no geometry`);
  return shapes.join("");
}

// ---- write ----
const dir = check ? await Deno.makeTempDir({ prefix: `authorless_${R.id}_` }) + `/${R.id}` : `apps/${R.id}`;
await Deno.mkdir(`${dir}/i18n`, { recursive: true });
await Deno.writeTextFile(`${dir}/spec.json`, JSON.stringify(spec, null, 2) + "\n");
await Deno.writeTextFile(`${dir}/data.js`, data);
await Deno.writeTextFile(`${dir}/i18n/uk.json`, JSON.stringify(i18n.uk, null, 2) + "\n");
await Deno.writeTextFile(`${dir}/i18n/en.json`, JSON.stringify(i18n.en, null, 2) + "\n");
await Deno.writeTextFile(`${dir}/brand.json`, JSON.stringify(R.brand || { bg: "#1f2430", fg: "#a78bfa" }) + "\n");
await Deno.writeTextFile(`${dir}/brand.svg`, (await brandSvg(R.icon)) + "\n");
await Deno.writeTextFile(`${dir}/e2e.spec.mjs`, e2e);
console.log(`authorless: wrote ${dir} (spec + data + i18n×2 + brand + e2e) — 0 lines authored by a model`);

if (check) {
  // conformance: the generated app must clear the same browser-free gates as any authored app.
  const run = async (cmd) => (await new Deno.Command("deno", { args: cmd, stdout: "inherit", stderr: "inherit" }).output()).code;
  const a = await run(["run", "-A", "packages/schema/validate.mjs", `${dir}/spec.json`]);
  const p = await run(["run", "-A", "--import-map=packages/gates/preflight.importmap.json", "packages/gates/preflight.mjs", dir]);
  console.log(a === 0 && p === 0 ? "\n  ✓ conformance: a script-authored app passes ajv + preflight (the author is pluggable)" : "\n  ✗ conformance failed");
  Deno.exit(a === 0 && p === 0 ? 0 : 1);
} else {
  console.log(`  next: deno run -A packages/gen/scaffold.mjs ${dir}`);
}
