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
const TAGS = new Set(["div", "span", "button", "svg", "section", "header", "main", "footer", "nav", "input", "select", "option", "label", "rect", "circle", "path", "line", "polyline", "polygon", "text", "iconify-icon", "img", "table"]);

function installDom() {
  const { window, document } = parseHTML(`<!doctype html><html data-theme="signal"><head></head><body><div id="app"></div></body></html>`);
  const noop = () => {};
  const ctxStub = new Proxy({}, { get: (_, p) => (["fillStyle", "strokeStyle", "lineWidth", "font", "globalAlpha", "lineCap", "lineJoin"].includes(p) ? "" : noop) });
  try { window.HTMLCanvasElement && (window.HTMLCanvasElement.prototype.getContext = () => ctxStub); } catch {  }
  const animStub = () => ({ finished: Promise.resolve(), cancel() {}, finish() {}, play() {}, pause() {}, reverse() {}, commitStyles() {}, persist() {}, updatePlaybackRate() {}, addEventListener() {}, removeEventListener() {}, currentTime: 0, playState: "finished", effect: null });
  for (const proto of ["Element", "HTMLElement", "SVGElement"]) { try { window[proto] && (window[proto].prototype.animate = animStub); } catch {  } }
  try { window.document.getAnimations = () => []; window.document.timeline = { currentTime: 0 }; } catch {  }
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
  const realFetch = g.fetch;
  g.fetch = (u) => { const s = String(u); if (s.startsWith("file:")) return realFetch(u); return Promise.reject(new Error("preflight: network blocked (" + s.slice(0, 48) + ")")); };
  const uncaught = [];
  try { globalThis.addEventListener("error", (e) => { uncaught.push(e.error?.message || e.message || String(e)); e.preventDefault?.(); }); } catch {  }
  try { globalThis.addEventListener("unhandledrejection", (e) => { const m = e.reason?.message || String(e.reason || ""); if (!/network blocked/.test(m)) uncaught.push(m); e.preventDefault?.(); }); } catch {  }
  return { window, document, rafErr, uncaught };
}

const flush = () => new Promise((r) => setTimeout(r, 60));

async function preflight(appdir) {
  const errs = [], warns = [];
  const read = async (p) => JSON.parse(await Deno.readTextFile(p));
  const spec = await read(`${appdir}/spec.json`);

  const i18n = {}; const locales = [];
  for await (const e of Deno.readDir(`${appdir}/i18n`)) if (e.isFile && e.name.endsWith(".json")) { const l = e.name.replace(".json", ""); i18n[l] = await read(`${appdir}/i18n/${l}.json`); locales.push(l); }
  if (!i18n.en) errs.push("i18n/en.json missing (required fallback)");

  const mode = await exists(`${appdir}/view.js`) ? "tool" : await exists(`${appdir}/stream.js`) ? "stream" : "data";
  const srcFile = mode === "tool" ? "view.js" : mode === "stream" ? "stream.js" : "data.js";
  let src = "";
  try { src = await Deno.readTextFile(`${appdir}/${srcFile}`); } catch {  }
  const keys = new Set();
  for (const m of src.matchAll(/\bT\(\s*t\s*,\s*["'`]([A-Za-z][\w]*)["'`]\s*[),]/g)) keys.add(m[1]);
  for (const m of JSON.stringify(spec).matchAll(/"(?:label|titleKey|searchKey)":"([A-Za-z][\w]*)"/g)) keys.add(m[1]);
  for (const k of keys) for (const l of locales) if (!(k in i18n[l])) errs.push(`i18n key "${k}" missing in ${l}.json`);

  if (i18n.en) for (const l of locales) { if (l === "en") continue;
    for (const k of Object.keys(i18n.en)) if (!(k in i18n[l])) errs.push(`i18n key "${k}" missing in ${l}.json (locale parity)`);
    for (const k of Object.keys(i18n[l])) if (!(k in i18n.en)) errs.push(`i18n key "${k}" in ${l}.json absent from en.json (locale parity)`);
  }

  if (/loading loading-(spinner|ring|dots|ball|bars|infinity)/.test(src)) errs.push(`spinner loader banned — use <${"Loading"}/> from /_rt/skeleton.js (or Scramble/Pixels skeletons), never a content-less spinner`);

  const { document, rafErr, uncaught } = installDom();
  try {
    const views = mode === "tool" ? await import(`file://${await Deno.realPath(`${appdir}/view.js`)}`) : {};
    const { start } = await import("/_rt/index.js");
    const composed = { ...spec, i18n };
    if (mode === "tool") start(composed, { views });
    else if (mode === "stream") { const { stream } = await import(`file://${await Deno.realPath(`${appdir}/stream.js`)}`); start(composed, { stream }); }
    else { let load = async () => ({ items: [], meta: {} }); try { ({ load } = await import(`file://${await Deno.realPath(`${appdir}/data.js`)}`)); } catch {  } start(composed, load); }
    await flush();

    const app = document.getElementById("app");
    const htmlOut = app?.innerHTML || "";
    if (!htmlOut.trim() || htmlOut.length < 30) errs.push("render produced (almost) no output — blank/crashed view");

    const strays = new Set();
    const walk = (n) => { for (const c of n.childNodes || []) { if (c.nodeType === 3) { const v = (c.textContent || "").trim(); if (v.length >= 3 && TAGS.has(v)) strays.add(v); } else walk(c); } };
    walk(app);
    if (strays.size) errs.push(`stray tag-name text ${[...strays].map((s) => `"${s}"`).join(", ")} — likely an UNCLOSED tag in ${srcFile}`);

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
