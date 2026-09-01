/* @ts-self-types="./authorless.d.mts" */
/**
 * # authorless — the frozen author. A recipe in, a complete list-family app out, no model.
 *
 * The moat is not the model; it is the contract, the runtime and the gates. This script is the existence
 * proof: a plain function turns a recipe (a source URL and a field map) into a full list-family app —
 * spec.json, data.js, i18n in uk and en, brand, e2e — that must clear the SAME ajv + preflight + Chromium
 * gates as any hand- or model-authored app. Swap the author, keep the floor. It is also how the appless
 * core gets its gate material: tools/demo.mjs generates apps/books from recipes/books.json before any gate
 * runs, and the history of the farm is verified against a generated app. It exports nothing.
 *
 * ![The authorless node in the author lane, the only script node there before scaffold](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/pipeline-authorless.svg)
 *
 * ## Usage
 * ```sh
 * deno run -A jsr:@microspec/core/authorless recipes/books.json           # writes apps/books/
 * deno run -A jsr:@microspec/core/authorless recipes/books.json --check   # temp dir, then ajv + preflight
 * ```
 * The 8n8 node `authorless` runs it with `--recipe=<path>` from the runner (default `recipes/<id>.json`);
 * `deno task demo` runs it on the books recipe when the tree has no apps. The generated app is not yet
 * runnable: the script ends by naming the next step, `scaffold` over the new directory.
 *
 * ## Flags and arguments
 * | argument | meaning |
 * | --- | --- |
 * | `<recipe.json>` | positional, required: the recipe. Missing → usage line, exit 2 |
 * | `--check` | generate into a temp dir (`authorless_<id>_…`) instead of `apps/<id>/`, then run the browser-free gates over it |
 *
 * A recipe: `{ id, source, proxy?, root, map, urlTemplate?, searchParam?, compact?, join?, joinCap?,
 * translate?, badges?, detail?, theme?, icon, brand, source_url, i18n: { uk, en } }`. Map values are dot
 * paths into a source row (`authors.0.name`); `join` names the fields whose source value is an array and
 * must be flattened in the adapter, capped at `joinCap` (default 8); `compact` names counts rendered as
 * 1.2K / 3M. `icon` is a lucide name and is required — it becomes the PWA icon.
 *
 * ## What it checks / produces
 * Writes seven files under `apps/<id>/` (or the temp dir):
 * - `spec.json` — the list family: a `feed` list tab with search, a `saved` tab over favourites, a `me`
 *   profile tab with theme, language, install and the source link; a card that drills IN to a detail
 *   (the outbound link lives in the detail's actions, always ending with the source), badges from the recipe.
 * - `data.js` — the adapter: `load()` fetches the source (through the feed proxy when `proxy` is set),
 *   picks the mapped fields, joins arrays, compacts counts, fills `url` from `urlTemplate`. Under the gate
 *   (`?mock`, verify, shoot) it answers a deterministic twelve-row fixture shaped by the map instead — no
 *   live fetch ever runs in a gate.
 * - `i18n/uk.json`, `i18n/en.json` — the base dictionary every list app needs, kept in lockstep so the
 *   locale-parity gate stays green, merged with the recipe's own strings.
 * - `brand.json` — bg and fg for the icon; `brand.svg` — the raw lucide geometry, fetched from
 *   lucide-static at the pinned version 0.544.0, so the PWA icons can be cut and Chrome will install the app.
 *   An unknown icon name or an icon with no geometry throws, and nothing is written past that point.
 * - `e2e.spec.mjs` — a structural list e2e: cards load, a card opens the detail and Back closes it, search
 *   narrows and restores, save lands in Saved, EN and UA both render, the install modal opens and Back closes it.
 * - Prints `authorless: wrote <dir> (spec + data + i18n×2 + brand + e2e) — 0 lines authored by a model`.
 * - With `--check`, runs validate.mjs over the spec and preflight.mjs over the directory and prints
 *   `✓ conformance: a script-authored app passes ajv + preflight (the author is pluggable)` or
 *   `✗ conformance failed`, with each gate's own output above it.
 *
 * ## Exit codes
 * - `0` — the app was written; with `--check`, ajv and preflight both passed.
 * - `1` — `--check` and either gate failed; also Deno's own code for an uncaught error, such as a lucide
 *   icon that does not exist.
 * - `2` — no recipe path given.
 *
 * ## Where it sits
 * 8n8 node `authorless` · phase author · script, frozen 2026-07-05 · needs: ideate · needed by: none in the
 * DAG. The `demo` node calls it directly (authorless → scaffold → sw → readme) to seed a tree with no apps,
 * so every gate node depends on its output through demo; verify.yml runs the `--check` conformance step
 * on every push.
 *
 * ## Why
 * The frozen author. A recipe (source + field map) → a complete list-family app, no model. This node is
 * the existence proof that agent nodes can freeze: the `spec` node is freezable per family because this
 * already emits it deterministically for the list family, and the `i18n` node is partially frozen because
 * this carries the base dictionary every list app needs, so only app-specific strings are authored.
 * @module
 */
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
// The gate never reaches the live source: under verify/shoot (or ?mock) load() answers with a deterministic
// fixture shaped by the recipe's own MAP, so the e2e (cards → detail → search narrows to 0 → save) measures
// the app, not gutendex's uptime. A live fetch in a gate is the flake that failed a core verify on a
// commit that touched nothing but a tool (2026-09-01), and it is against the farm's fixture rule anyway.
const data = `// GENERATED by packages/gen/authorless.mjs from ${recipePath.split("/").pop()} — deterministic, no LLM.
import { gate } from "/_rt/gate.js";
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
  if (gate) {
    // the gate's fixture: twelve rows shaped by MAP, no network — pictures stay empty (a fake URL would 404)
    const items = Array.from({ length: 12 }, (_, i) => {
      const it = {};
      for (const k in MAP) it[k] = /url|cover|thumb|image|img|href/i.test(k) ? "" : k === "id" ? String(i + 1) : k === "title" ? "Title " + (i + 1) : k + " " + (i + 1);
      it.url = URLT ? URLT.replace(/\\{(\\w+)\\}/g, () => it.id) : it.url;
      return it;
    }).filter((it) => !q || it.title.toLowerCase().includes(q.toLowerCase()));
    return { items, meta: {} };
  }
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
