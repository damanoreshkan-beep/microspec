#!/usr/bin/env -S deno run -A --import-map=packages/gates/preflight.importmap.json
/**
 * preflight — the FAST, browser-free half of the gate. Mounts an app's spec + view in a linkedom DOM (no
 * Chromium) and catches the render-time class of bugs BEFORE the ~1-min CI round-trip:
 *   • the view throws (undefined var, bad import, V8-only syntax swc lets through)
 *   • an unclosed tag (htm renders the tag NAME as literal text → "div" on screen, corrupt DOM)
 *   • a missing i18n key referenced by the view (`T(t,"x")` where x isn't in every locale)
 *   • a blank / error-only render
 * It does NOT replace verify (axe / overflow / shots need a real browser). Run before every push.
 *
 *   deno run -A --import-map=packages/gates/preflight.importmap.json packages/gates/preflight.mjs apps/<id> [apps/<id> ...]
 */
import { parseHTML } from "https://esm.sh/linkedom@0.18.5?external=canvas";

const C = { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", d: "\x1b[2m", x: "\x1b[0m" };
// Tag names an unclosed tag can leak as literal text (htm renders `<span>` with no close as the text
// "span"). Only ≥3-char structural tags — 1–2-char tags (a, p, li, tr, td, ul, ol, g) collide with real
// content: ISO language/country codes ("tr" = Türkçe, "td" = Chad), single letters, abbreviations. Those
// are also the tags least likely to be a genuine forgotten-close (people drop <div>/<span>/<button>, not
// <a>/<tr>). The walk enforces the length floor too, so this set stays self-documenting.
const TAGS = new Set(["div", "span", "button", "svg", "section", "header", "main", "footer", "nav", "input", "select", "option", "label", "rect", "circle", "path", "line", "polyline", "polygon", "text", "iconify-icon", "img", "table"]);

// one shared DOM + global shim, reset per app
function installDom() {
  const { window, document } = parseHTML(`<!doctype html><html data-theme="signal"><head></head><body><div id="app"></div></body></html>`);
  const noop = () => {};
  const ctxStub = new Proxy({}, { get: (_, p) => (["fillStyle", "strokeStyle", "lineWidth", "font", "globalAlpha", "lineCap", "lineJoin"].includes(p) ? "" : noop) });
  try { window.HTMLCanvasElement && (window.HTMLCanvasElement.prototype.getContext = () => ctxStub); } catch { /* linkedom may lack it */ }
  // Web Animations API stub so `motion`'s animate() is a no-op instead of crashing (linkedom has no WAAPI)
  const animStub = () => ({ finished: Promise.resolve(), cancel() {}, finish() {}, play() {}, pause() {}, reverse() {}, commitStyles() {}, persist() {}, updatePlaybackRate() {}, addEventListener() {}, removeEventListener() {}, currentTime: 0, playState: "finished", effect: null });
  for (const proto of ["Element", "HTMLElement", "SVGElement"]) { try { window[proto] && (window[proto].prototype.animate = animStub); } catch { /* */ } }
  try { window.document.getAnimations = () => []; window.document.timeline = { currentTime: 0 }; } catch { /* */ }
  const store = new Map();
  const g = globalThis;
  g.window = window; g.document = document;
  g.HTMLElement = window.HTMLElement; g.customElements = window.customElements;
  g.Element = window.Element || class Element {}; g.NodeList = window.NodeList || class NodeList {}; g.HTMLCollection = window.HTMLCollection || class HTMLCollection {}; g.SVGElement = window.SVGElement || class SVGElement {}; g.Node = window.Node || class Node {};
  g.navigator = { userAgent: "preflight", language: "uk", onLine: true, permissions: { query: async () => ({ state: "prompt", onchange: null }) }, geolocation: { getCurrentPosition: noop, watchPosition: () => 0, clearWatch: noop } };
  g.location = window.location = { hostname: "localhost", search: "", href: "http://localhost/", origin: "http://localhost", pathname: "/", protocol: "http:" };
  g.history = window.history = { state: null, pushState() {}, replaceState() {}, back() {}, forward() {}, go() {} };
  g.localStorage = window.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear(), key: () => null, length: 0 };
  g.matchMedia = window.matchMedia = () => ({ matches: false, media: "", addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop, onchange: null });
  g.scrollTo = window.scrollTo = noop;
  g.getComputedStyle = window.getComputedStyle || (() => ({ getPropertyValue: () => "" }));
  g.performance = g.performance || { now: () => 0 };
  class Obs { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  g.ResizeObserver = window.ResizeObserver = Obs; g.IntersectionObserver = window.IntersectionObserver = Obs; g.MutationObserver = window.MutationObserver = Obs;
  let rafN = 0; const rafErr = [];
  g.requestAnimationFrame = window.requestAnimationFrame = (cb) => { if (rafN++ < 10) queueMicrotask(() => { try { cb(0); } catch (e) { rafErr.push(e); } }); return rafN; };
  g.cancelAnimationFrame = window.cancelAnimationFrame = noop;
  // fetch: only local /_rt/ assets could be requested at mount; anything else (live APIs) is refused —
  // apps must use their isGate/?mock sample on localhost, which is exactly what we set the hostname to.
  const realFetch = g.fetch;
  g.fetch = (u) => { const s = String(u); if (s.startsWith("file:")) return realFetch(u); return Promise.reject(new Error("preflight: network blocked (" + s.slice(0, 48) + ")")); };
  // capture async/effect throws (they run in timers → would otherwise hard-crash the process) as findings
  const uncaught = [];
  try { globalThis.addEventListener("error", (e) => { uncaught.push(e.error?.message || e.message || String(e)); e.preventDefault?.(); }); } catch { /* */ }
  try { globalThis.addEventListener("unhandledrejection", (e) => { const m = e.reason?.message || String(e.reason || ""); if (!/network blocked/.test(m)) uncaught.push(m); e.preventDefault?.(); }); } catch { /* */ }
  return { window, document, rafErr, uncaught };
}

const flush = () => new Promise((r) => setTimeout(r, 60));

async function preflight(appdir) {
  const errs = [], warns = [];
  const read = async (p) => JSON.parse(await Deno.readTextFile(p));
  const spec = await read(`${appdir}/spec.json`);

  // locales
  const i18n = {}; const locales = [];
  for await (const e of Deno.readDir(`${appdir}/i18n`)) if (e.isFile && e.name.endsWith(".json")) { const l = e.name.replace(".json", ""); i18n[l] = await read(`${appdir}/i18n/${l}.json`); locales.push(l); }
  if (!i18n.en) errs.push("i18n/en.json missing (required fallback)");

  // --- static: every T(t,"key") the source references must exist in EVERY locale ---
  const mode = await exists(`${appdir}/view.js`) ? "tool" : await exists(`${appdir}/stream.js`) ? "stream" : "data";
  const srcFile = mode === "tool" ? "view.js" : mode === "stream" ? "stream.js" : "data.js";
  let src = "";
  try { src = await Deno.readTextFile(`${appdir}/${srcFile}`); } catch { /* data apps may have no adapter here */ }
  const keys = new Set();
  // only COMPLETE static keys: the string must be the last arg (→ `)`) or before params (→ `,`), NOT part
  // of a concatenated dynamic key like T(t, "b" + capitalize(x)) — those can't be verified statically.
  for (const m of src.matchAll(/\bT\(\s*t\s*,\s*["'`]([A-Za-z][\w]*)["'`]\s*[),]/g)) keys.add(m[1]);
  // spec-declared label / titleKey references too
  for (const m of JSON.stringify(spec).matchAll(/"(?:label|titleKey|searchKey)":"([A-Za-z][\w]*)"/g)) keys.add(m[1]);
  for (const k of keys) for (const l of locales) if (!(k in i18n[l])) errs.push(`i18n key "${k}" missing in ${l}.json`);

  // locale parity: every locale must define EXACTLY the en keys. Catches a dropped/forgotten translation
  // even for keys the runtime (not the app source) renders — T() falls back to the raw key, so a missing
  // uk "close"/"refresh" would ship an English word in a Ukrainian UI. (Enforces the every-string-in-every-
  // locale rule; measured by packages/gates/efficacy.mjs.)
  if (i18n.en) for (const l of locales) { if (l === "en") continue;
    for (const k of Object.keys(i18n.en)) if (!(k in i18n[l])) errs.push(`i18n key "${k}" missing in ${l}.json (locale parity)`);
    for (const k of Object.keys(i18n[l])) if (!(k in i18n.en)) errs.push(`i18n key "${k}" in ${l}.json absent from en.json (locale parity)`);
  }

  // --- strings the RUNTIME renders because of what the spec DECLARED ---
  //
  // Locale parity compares the locales to each other, and the key check reads the app's own source. A string
  // that neither locale defines, referenced by neither — rendered by the runtime purely because a capability
  // was switched on in spec.json — slips through both: parity holds (both are equally missing it) and the
  // app source never mentions it. T() then falls back to the raw key and the screen literally says
  // "searchPrompt". That shipped: winapps turned on searchFetch and greeted everyone with the key name.
  const declared = [
    [(s) => (s.tabs || []).some((t) => t.searchFetch && !t.browse && !t.prompt), ["searchPrompt", "searchPromptHint"], "tab.searchFetch without browse/prompt shows the search empty-state"],
    [(s) => (s.tabs || []).some((t) => t.paginate), ["loadMore"], "tab.paginate renders a load-more control"],
    [(s) => !!s.detail, ["back"], "spec.detail renders a back button"],
    [(s) => !!s.fav, ["favAria", "unfavAria"], "spec.fav renders bookmark controls"],
  ];
  for (const [applies, keys, why] of declared) {
    if (!applies(spec)) continue;
    for (const k of keys) for (const l of locales) {
      if (!(k in i18n[l])) errs.push(`i18n key "${k}" missing in ${l}.json — ${why}, and the runtime would render the raw key`);
    }
  }

  // No content-less spinner loaders — show the app + a modern skeleton (/_rt/skeleton.js Loading/Scramble/
  // Pixels) instead. DaisyUI loading spinners are banned in app source.
  if (/loading loading-(spinner|ring|dots|ball|bars|infinity)/.test(src)) errs.push(`spinner loader banned — use <${"Loading"}/> from /_rt/skeleton.js (or Scramble/Pixels skeletons), never a content-less spinner`);

  // Locale-blind date/number formatting. `toLocale*String()` with no locale (or `undefined`) formats with the
  // system/browser locale, not the app's — it freezes one language and never reacts to the toggle (weather
  // shipped English weekdays under a Ukrainian UI). Pass the app locale explicitly (see globe/kp:
  // `loc === "uk" ? "uk-UA" : "en-US"`), or return a raw timestamp for the runtime renderer to format.
  { const m = src.match(/\.toLocale(?:Date|Time)?String\(\s*(?:undefined\b|\))/);
    if (m) errs.push(`locale-blind \`${m[0]}…\` — pass the app locale, or return a raw value for the renderer to format (never bake a locale-frozen string in an adapter/view)`); }

  // --- mount: render the app in a linkedom DOM and inspect the output ---
  const { document, rafErr, uncaught } = installDom();
  try {
    const views = mode === "tool" ? await import(`file://${await Deno.realPath(`${appdir}/view.js`)}`) : {};
    const { start } = await import("/_rt/index.js");
    const composed = { ...spec, i18n };
    if (mode === "tool") start(composed, { views });
    else if (mode === "stream") { const { stream } = await import(`file://${await Deno.realPath(`${appdir}/stream.js`)}`); start(composed, { stream }); }
    else { let load = async () => ({ items: [], meta: {} }); try { ({ load } = await import(`file://${await Deno.realPath(`${appdir}/data.js`)}`)); } catch { /* no adapter */ } start(composed, load); }
    await flush();

    const app = document.getElementById("app");
    const htmlOut = app?.innerHTML || "";
    if (!htmlOut.trim() || htmlOut.length < 30) errs.push("render produced (almost) no output — blank/crashed view");

    // stray tag-name text nodes = an unclosed tag htm turned into literal text
    const strays = new Set();
    const walk = (n) => { for (const c of n.childNodes || []) { if (c.nodeType === 3) { const v = (c.textContent || "").trim(); if (v.length >= 3 && TAGS.has(v)) strays.add(v); } else walk(c); } };
    walk(app);
    if (strays.size) errs.push(`stray tag-name text ${[...strays].map((s) => `"${s}"`).join(", ")} — likely an UNCLOSED tag in ${srcFile}`);

    // --- an app that reads a sensor must render a READING here, not an empty waiting state ---
    //
    // Headless has no GPS, no magnetometer, no microphone. Left alone, a sensor app renders its "locating…"
    // branch forever, and that is the branch every gate downstream then measures: the a11y sweep, the 384px
    // overflow check and the watch check all sign off on a screen the user never sees. The live layout —
    // the rotated dial whose bounding box grows √2, the readout that is widest once it has a value, the
    // colour that only appears at low contrast when there is something to colour — is exactly the part
    // nobody looks at, and it ships green while being broken on a phone.
    //
    // So a sensor app seeds its mock with a plausible reading, and the way to prove it did is to require
    // the reading-shaped UI to exist. `data-live` marks an element that CANNOT render without a reading;
    // if none mounted, the app is sitting in its empty state and the gates below are measuring nothing.
    const sensorImport = src.match(/import\s*\{([^}]*)\}\s*from\s*["']\/_rt\/sensors\.js["']/);
    const reads = sensorImport && /\b(geo|compass|motion|mic|camera)\b/.test(sensorImport[1]);
    if (reads && !app?.querySelector("[data-live]")) {
      errs.push(`reads a sensor but rendered no [data-live] element — headless has no hardware, so this is the empty waiting state, and every check below (a11y, overflow@384, watch@200) is now measuring a screen no user sees. Seed the mock with a reading (see apps/ruler SAMPLE_FIXES) and mark what it renders with data-live.`);
    }

    for (const e of rafErr) errs.push("render loop threw: " + (e?.message || e));
    for (const m of uncaught) errs.push("async/effect threw: " + m);
  } catch (e) {
    errs.push("mount threw: " + (e?.stack?.split("\n").slice(0, 3).join(" | ") || e?.message || e));
  }

  const name = appdir.replace(/\/$/, "").split("/").pop();
  if (errs.length) { console.log(`  ${C.r}✗ ${name}${C.x}`); errs.forEach((e) => console.log(`      ${C.r}${e}${C.x}`)); }
  else { console.log(`  ${C.g}✓ ${name}${C.x}${warns.length ? C.y + " (" + warns.length + " warn)" + C.x : ""}`); warns.forEach((w) => console.log(`      ${C.y}${w}${C.x}`)); }
  return errs.length;
}

async function exists(p) { try { await Deno.stat(p); return true; } catch { return false; } }

const dirs = Deno.args.map((a) => a.replace(/\/$/, ""));
if (!dirs.length) { console.error("usage: preflight.mjs apps/<id> [apps/<id> ...]"); Deno.exit(2); }
console.log(`\n  preflight (browser-free)\n`);
let fail = 0;
for (const d of dirs) fail += await preflight(d);
console.log(`\n  ${fail ? C.r + "✗ " + fail + " app(s) failed" : C.g + "✓ all clean"}${C.x}\n`);
Deno.exit(fail ? 1 : 0);
