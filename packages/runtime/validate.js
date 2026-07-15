// microspec runtime — loud, fail-fast spec guard (pure, zero-dependency).
//
// Two-tier validation by design:
//   • packages/schema (ajv, draft 2020-12) is the EXHAUSTIVE author-time contract — run by the
//     generator's retry loop and CI, where loading a big validator is fine.
//   • validateSpec() below is the LIGHTWEIGHT runtime guard — it runs in the browser at start(),
//     where ajv is too heavy to ship. It catches the high-value "AI footguns" and throws an Error
//     naming the exact JSON path, so a bad spec fails loudly at boot instead of rendering blank.
//
// Kept dependency-free on purpose: importable from Deno/Node unit tests with no import map.

export const SPEC_MAJOR = 1; // spec contract major; bump on a breaking spec change

const TAB_TYPES = new Set(["list", "converter", "profile", "dashboard", "tool"]);
const nonEmpty = (v) => typeof v === "string" && v.trim() !== "";

export function validateSpec(spec) {
  const die = (path, msg) => { throw new Error(`Invalid spec at ${path}: ${msg}`); };
  const need = (cond, path, msg) => { if (!cond) die(path, msg); };

  need(spec && typeof spec === "object", "spec", "must be a non-null object");
  if (spec.v != null && spec.v !== SPEC_MAJOR) {
    die("spec.v", `incompatible spec version ${spec.v} (this runtime is spec major ${SPEC_MAJOR})`);
  }
  need(nonEmpty(spec.id), "spec.id", "required non-empty string (storage namespace)");
  need(Array.isArray(spec.tabs) && spec.tabs.length >= 1, "spec.tabs", "required array with at least one tab");
  need(spec.i18n && typeof spec.i18n === "object", "spec.i18n", "required object of locale dictionaries");
  need(spec.i18n.en && typeof spec.i18n.en === "object", "spec.i18n.en", "required: 'en' is the fallback locale");

  if (spec.fav != null) {
    need(typeof spec.fav === "object", "spec.fav", "must be an object when present");
    need(nonEmpty(spec.fav.key), "spec.fav.key", "required non-empty string when spec.fav is present");
  }

  spec.tabs.forEach((tab, i) => validateTab(tab, `spec.tabs[${i}]`, die, need));

  if (spec.detail != null) validateDetail(spec.detail, die, need);
  if (spec.filters?.controls != null) validateControls(spec.filters.controls, die, need);

  return spec;
}

function validateTab(tab, p, die, need) {
  need(tab && typeof tab === "object", p, "must be an object");
  need(nonEmpty(tab.id), `${p}.id`, "required non-empty string");
  need(nonEmpty(tab.type), `${p}.type`, "required string");
  need(TAB_TYPES.has(tab.type), `${p}.type`, `unknown type "${tab.type}" (expected: ${[...TAB_TYPES].join(", ")})`);
  need(nonEmpty(tab.icon), `${p}.icon`, "required iconify icon name");
  need(nonEmpty(tab.label), `${p}.label`, "required i18n key");

  if (tab.type === "list") {
    const c = tab.card;
    need(c && typeof c === "object", `${p}.card`, "required object for list tabs");
    need(["row", "feed", "grid", "table"].includes(c.layout), `${p}.card.layout`, `unknown layout "${c?.layout}" (expected "row", "feed", "grid" or "table")`);
    if (c.layout !== "table") need(nonEmpty(c.title), `${p}.card.title`, "required field name (card title / list key)");
    if (c.layout === "table") need(Array.isArray(c.columns) && c.columns.length, `${p}.card.columns`, 'layout "table" needs a non-empty columns array of { field, ... }');
    if (c.layout === "row") {
      need(nonEmpty(c.lead), `${p}.card.lead`, 'required for layout "row"');
      need(nonEmpty(c.trailing), `${p}.card.trailing`, 'required for layout "row"');
    }
    if (c.layout === "grid") {
      need(nonEmpty(c.icon) || nonEmpty(c.image), `${p}.card`, 'layout "grid" needs a tile — set icon (item field with an iconify name) or image (item field with an icon URL)');
    }
    // UX guardrail: a "feed" card is the large, content-forward card — a title with nothing under it is a
    // raw card. Require at least one preview slot (subtitle / body / image); badges & meta are metadata,
    // not a preview. For a compact title+value line use layout:"row" instead. (Link feeds with no preview
    // text in their API can fill `body` via spec.enrich — see enrich.js.)
    if (c.layout === "feed") {
      need(nonEmpty(c.subtitle) || nonEmpty(c.body) || nonEmpty(c.image), `${p}.card`,
        'a "feed" card needs a preview slot — set at least one of subtitle/body/image (a title-only feed card is raw; use layout:"row" for a compact title+value line, or add spec.enrich to fetch a body preview)');
    }
    if (tab.searchFetch) need(tab.search === true, `${p}.search`, "searchFetch requires search:true");
    if (tab.sections != null) {
      need(Array.isArray(tab.sections), `${p}.sections`, "must be an array when present");
      tab.sections.forEach((sec, j) => {
        need(sec && typeof sec === "object", `${p}.sections[${j}]`, "must be an object");
        need(nonEmpty(sec.filter), `${p}.sections[${j}].filter`, "required non-empty test expression");
      });
    }
  }

  if (tab.type === "converter") {
    for (const f of ["codeField", "rateField", "base"]) {
      need(nonEmpty(tab[f]), `${p}.${f}`, "required non-empty string for converter tabs");
    }
    for (const f of ["defaultFrom", "defaultTo"]) {
      if (tab[f] != null) need(typeof tab[f] === "string", `${p}.${f}`, "must be a string when present");
    }
  }

  if (tab.type === "tool") {
    need(nonEmpty(tab.view), `${p}.view`, "required: a key in the views map passed to start(spec, { views })");
    if (tab.needs != null) need(Array.isArray(tab.needs), `${p}.needs`, "must be an array of capability names when present");
  }

  if (tab.type === "dashboard") {
    const h = tab.hero;
    need(h && typeof h === "object", `${p}.hero`, "required object for dashboard tabs");
    need(nonEmpty(h.value), `${p}.hero.value`, "required: a key in data.meta for the big value");
    if (h.metrics != null) {
      need(Array.isArray(h.metrics), `${p}.hero.metrics`, "must be an array when present");
      h.metrics.forEach((m, j) => need(nonEmpty(m?.field), `${p}.hero.metrics[${j}].field`, "required meta field name"));
    }
    if (tab.strip != null) {
      need(typeof tab.strip === "object", `${p}.strip`, "must be an object when present");
      need(nonEmpty(tab.strip.from), `${p}.strip.from`, "required: a key in data.meta holding the strip array");
      for (const f of ["time", "value"]) need(nonEmpty(tab.strip[f]), `${p}.strip.${f}`, "required field name on the strip items");
    }
    if (tab.days != null) {
      need(typeof tab.days === "object", `${p}.days`, "must be an object when present");
      for (const f of ["day", "hi"]) need(nonEmpty(tab.days[f]), `${p}.days.${f}`, "required item field for the days list");
    }
  }
}

function validateDetail(d, die, need) {
  need(typeof d === "object", "spec.detail", "must be an object when present");
  need(nonEmpty(d.title), "spec.detail.title", "required: item field for the detail-page title");
  if (d.rows != null) {
    need(Array.isArray(d.rows), "spec.detail.rows", "must be an array when present");
    d.rows.forEach((r, i) => {
      need(nonEmpty(r?.field), `spec.detail.rows[${i}].field`, "required item field name");
      need(nonEmpty(r?.label), `spec.detail.rows[${i}].label`, "required i18n key");
    });
  }
  if (d.actions != null) {
    need(Array.isArray(d.actions), "spec.detail.actions", "must be an array when present");
    d.actions.forEach((a, i) => {
      need(nonEmpty(a?.href), `spec.detail.actions[${i}].href`, "required item field holding a URL");
      need(nonEmpty(a?.label), `spec.detail.actions[${i}].label`, "required i18n key");
    });
  }
}

function validateControls(controls, die, need) {
  need(Array.isArray(controls), "spec.filters.controls", "must be an array when present");
  controls.forEach((c, i) => {
    const cp = `spec.filters.controls[${i}]`;
    need(c && typeof c === "object", cp, "must be an object");
    need(nonEmpty(c.type), `${cp}.type`, 'required (e.g. "select", "toggle", "segment")');
    need(nonEmpty(c.key), `${cp}.key`, "required non-empty filter state key");
    need(nonEmpty(c.label), `${cp}.label`, "required i18n key");
    if (c.type === "select") need(nonEmpty(c.optionsFrom) || (Array.isArray(c.options) && c.options.length), `${cp}.optionsFrom`, "select requires optionsFrom (a data.meta key) or an inline options array of [value, labelKey] pairs");
    if (c.type === "segment" || c.type === "multi") need(Array.isArray(c.options) && c.options.length, `${cp}.options`, `${c.type} requires a non-empty options array of [value, labelKey] pairs`);
  });
}
