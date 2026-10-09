/* @ts-self-types="./preflight.d.mts" */
/**
 * # preflight — the fast, browser-free half of the gate
 *
 * Mounts an app's spec + view in a linkedom DOM, no Chromium, and answers in about two seconds what the
 * CI round-trip would take a minute to say: the view throws, a tag was left unclosed, a string is missing
 * from a locale, the screen rendered blank. Around the mount it enforces the farm's own invariants
 * statically — no emoji, no spinners, no hand-rolled sheets or transports, no app-authored shadows, one
 * icon set, camera and mic priming, every runtime-rendered key present in every locale. It does not
 * replace `verify` (axe, overflow and screenshots need a real browser); it runs before every push so the
 * browser only ever sees what already mounts. A gate script with no exports.
 *
 * ![The 8n8 pipeline with the preflight node lit](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/pipeline-preflight.svg)
 *
 * ## Usage
 * ```sh
 * deno run -A --import-map=preflight.map.json jsr:@microspec/core/preflight apps/<id> [apps/<id> ...] [--url "?tab=<id>&screen=<key>"]
 * ```
 * `deno task gates` runs it as the 8n8 node `preflight` over every `apps/<id>` that has a `spec.json`. The
 * node picks the map and the script per realm: a product tree runs `.microspec/preflight.mjs` (the shim
 * `rtmap` generates) under `preflight.map.json`, because a dynamic import of consumer files must originate
 * in a local module; the core checkout runs this file under `packages/gates/preflight.importmap.json`.
 *
 * ## Flags and arguments
 * | argument | meaning |
 * | --- | --- |
 * | `apps/<id>` (one or more) | app directories to mount; a trailing slash is stripped |
 * | `--url "<query>"` | mount the app AT a screen (`?tab=hits&screen=pl:mars`) instead of its landing state — whatever the runtime routes from `location.search`, preflight can mount |
 *
 * Without `--url`, every `tool` tab after the first gets its own mount (`?tab=<id>`), so what sits behind a
 * tool tab no longer fails one CI round later. An explicit `--url` disables that sweep.
 *
 * ## What it checks
 * Static, before the mount (the mode is `view.js` → tool, `stream.js` → stream, else `data.js`):
 * - `i18n/en.json` missing — en is the required fallback.
 * - every `T(t,"key")` in the source and every `label` / `titleKey` / `searchKey` in the spec must exist in every locale.
 * - locale parity: every locale defines exactly the en keys, in both directions.
 * - keys the RUNTIME renders because the spec declared a capability (`searchPrompt`, `loadMore`, `statusError`, `back`, `favAria`, `title`, `profTagline`, `profTheme`, `profLang`, `install…`) — parity cannot see these, so they are tied to the declaration.
 * - a DaisyUI `loading-spinner` (use `/_rt/skeleton.js`), `transition-all`, a `shadow-*` surface utility, frosted glass over a `bg-base-*` surface.
 * - a hand-rolled bottom sheet (`modal-bottom`, or `fixed inset-0` + `role="dialog"` without the kit's `Sheet`) and a hand-rolled play/pause toggle without `Transport`.
 * - a canvas measured against itself (`x.width = x.clientWidth * dpr`), a `requestAnimationFrame` driving a `.volume` fade, locale-blind `toLocaleString()`.
 * - a non-lucide icon set, and emoji anywhere in the source, the spec or a locale.
 *
 * At the mount (`fetch` is refused for anything but `file:` — apps render their `?mock` fixture):
 * - render produced (almost) no output — a blank or crashed view.
 * - stray tag-name text (`"div"`, `"span"` on screen) — an unclosed tag htm turned into literal text.
 * - a sensor app that rendered no `[data-live]` element — the empty waiting state every downstream check would measure.
 * - a camera or mic import without `CameraPrime` / `MicPrime`.
 * - a throw from the render loop, from an async effect, or from the mount itself.
 *
 * It writes nothing. Each app prints `✓` or `✗` with every finding in full; the summary counts failed apps
 * and problems separately, so twenty missing keys read as one broken app, not twenty.
 *
 * ## Exit codes
 * - `0` — all clean.
 * - `1` — at least one problem in at least one app.
 * - `2` — no app directory given (prints the usage line).
 *
 * ## Where it sits
 * gate · script · needs: `scaffold`, `demo`, `rtmap` · needed by: `push`. Part of the `gates` flow, the
 * pre-push floor. The same file runs in both realms — a checkout and the JSR cache — which is why the
 * consumer files are loaded through a local shim rather than from here.
 *
 * ![The three realms and their laws](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/realms.svg)
 *
 * ## Why
 * The farm's own invariants — no emoji, no spinners, camera priming, i18n keys — checked in linkedom,
 * with no Chromium. `scaffold` precedes it because there is nothing to mount before the shell exists;
 * `rtmap` precedes it because a stale import map is a gate that tests the wrong runtime.
 * @module
 */
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
import { parseHTML } from "linkedom";
import { importSpecs, resolveSpec } from "../../tools/graph.mjs";

const dynImport = (s) => (globalThis.__msImport ?? ((x) => import(x)))(s);

const C = { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", d: "\x1b[2m", x: "\x1b[0m" };
const TAGS = new Set(["div", "span", "button", "svg", "section", "header", "main", "footer", "nav", "input", "select", "option", "label", "rect", "circle", "path", "line", "polyline", "polygon", "text", "iconify-icon", "img", "table"]);

const ICON_SETS = new Set(["mdi", "ph", "tabler", "carbon", "ri", "material-symbols", "simple-icons", "logos",
  "bi", "heroicons", "solar", "iconoir", "fluent", "octicon", "codicon", "fa6-solid", "fa6-regular",
  "fa6-brands", "ic", "majesticons", "gravity-ui", "hugeicons", "streamline", "mingcute", "akar-icons"]);

const URL_ARG = (() => { const i = Deno.args.indexOf("--url"); return i >= 0 ? (Deno.args[i + 1] || "") : ""; })();
let URL_QUERY = URL_ARG;

function installDom() {
  const { window, document } = parseHTML(`<!doctype html><html data-theme="signal"><head></head><body><div id="app"></div></body></html>`);
  const noop = () => {};
  const ctxStub = new Proxy({}, { get: (_, p) => (["fillStyle", "strokeStyle", "lineWidth", "font", "globalAlpha", "lineCap", "lineJoin"].includes(p) ? "" : noop) });
  try { window.HTMLCanvasElement && (window.HTMLCanvasElement.prototype.getContext = () => ctxStub); } catch { }
  const animStub = () => ({ finished: Promise.resolve(), cancel() {}, finish() {}, play() {}, pause() {}, reverse() {}, commitStyles() {}, persist() {}, updatePlaybackRate() {}, addEventListener() {}, removeEventListener() {}, currentTime: 0, playState: "finished", effect: null });
  for (const proto of ["Element", "HTMLElement", "SVGElement"]) { try { window[proto] && (window[proto].prototype.animate = animStub); } catch { } }
  try { window.document.getAnimations = () => []; window.document.timeline = { currentTime: 0 }; } catch { }
  const store = new Map();
  const g = globalThis;
  g.window = window; g.document = document;
  g.HTMLElement = window.HTMLElement; g.customElements = window.customElements;
  g.Element = window.Element || class Element {}; g.NodeList = window.NodeList || class NodeList {}; g.HTMLCollection = window.HTMLCollection || class HTMLCollection {}; g.SVGElement = window.SVGElement || class SVGElement {}; g.Node = window.Node || class Node {};
  g.navigator = { userAgent: "preflight", language: "uk", onLine: true, permissions: { query: async () => ({ state: "prompt", onchange: null }) }, geolocation: { getCurrentPosition: noop, watchPosition: () => 0, clearWatch: noop } };
  const search = URL_QUERY ? (URL_QUERY.startsWith("?") ? URL_QUERY : "?" + URL_QUERY) : "";
  g.location = window.location = { hostname: "localhost", search, href: "http://localhost/" + search, origin: "http://localhost", pathname: "/", protocol: "http:" };
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
  try { globalThis.addEventListener("error", (e) => { uncaught.push(e.error?.message || e.message || String(e)); e.preventDefault?.(); }); } catch { }
  try { globalThis.addEventListener("unhandledrejection", (e) => { const m = e.reason?.message || String(e.reason || ""); if (!/network blocked/.test(m)) uncaught.push(m); e.preventDefault?.(); }); } catch { }
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
  const parts = [];
  { const base = appdir.replace(/\/+$/, ""), seen = new Set(), stack = [`${base}/${srcFile}`];
    while (stack.length) {
      const f = stack.pop();
      if (seen.has(f)) continue;
      seen.add(f);
      let text;
      try { text = await Deno.readTextFile(f); } catch { continue; }
      parts.push([f.slice(base.length + 1), text]);
      for (const s of importSpecs(text)) { const r = resolveSpec(s, f); if (r?.startsWith(`${base}/`) && r.endsWith(".js")) stack.push(r); }
    } }
  const src = parts.map(([, t]) => t).join("\n");
  const at = (re) => parts.find(([, t]) => re.test(t))?.[0] ?? srcFile;
  const keys = new Set();
  for (const m of src.matchAll(/\bT\(\s*t\s*,\s*["'`]([A-Za-z][\w]*)["'`]\s*[),]/g)) keys.add(m[1]);
  for (const m of JSON.stringify(spec).matchAll(/"(?:label|titleKey|searchKey)":"([A-Za-z][\w]*)"/g)) keys.add(m[1]);
  for (const k of keys) for (const l of locales) if (!(k in i18n[l])) errs.push(`i18n key "${k}" missing in ${l}.json`);

  if (i18n.en) for (const l of locales) { if (l === "en") continue;
    for (const k of Object.keys(i18n.en)) if (!(k in i18n[l])) errs.push(`i18n key "${k}" missing in ${l}.json (locale parity)`);
    for (const k of Object.keys(i18n[l])) if (!(k in i18n.en)) errs.push(`i18n key "${k}" in ${l}.json absent from en.json (locale parity)`);
  }

  const declared = [
    [(s) => (s.tabs || []).some((t) => t.searchFetch && !t.browse && !t.prompt), ["searchPrompt", "searchPromptHint"], "tab.searchFetch without browse/prompt shows the search empty-state"],
    [(s) => (s.tabs || []).some((t) => t.paginate), ["loadMore"], "tab.paginate renders a load-more control"],
    [(s) => (s.tabs || []).some((t) => ["list", "dashboard", "converter"].includes(t.type)), ["statusError", "errorHint"], "a data tab renders the runtime's failed-load state"],
    [(s) => !!s.detail, ["back"], "spec.detail renders a back button"],
    [(s) => !!s.fav, ["favAria", "unfavAria"], "spec.fav renders bookmark controls"],
    [() => true, ["title"], "the header renders the app name"],
    [(s) => !!s.profile, ["profTagline"], "the profile tab renders the app tagline"],
    [(s) => !!s.profile?.theme, ["profTheme"], "profile.theme renders a dark-theme toggle"],
    [(s) => !!s.profile?.lang, ["profLang"], "profile.lang renders a language switch"],
    [(s) => !!s.profile?.install, ["install", "installTitle", "installBtn", "installDesc", "installIosHint", "installGenericHint", "close"], "profile.install renders the install button + install sheet"],
  ];
  for (const [applies, keys, why] of declared) {
    if (!applies(spec)) continue;
    for (const k of keys) for (const l of locales) {
      if (!(k in i18n[l])) errs.push(`i18n key "${k}" missing in ${l}.json — ${why}, and the runtime would render the raw key`);
    }
  }

  if (/loading loading-(spinner|ring|dots|ball|bars|infinity)/.test(src)) errs.push(`spinner loader banned — use <${"Loading"}/> from /_rt/skeleton.js (or Scramble/Pixels skeletons), never a content-less spinner`);

  for (const [file, text] of parts) text.split("\n").forEach((ln, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(ln)) return;
    const m = ln.match(/text-\[var\(--ms-(label|title|icon|hero)\)\]/);
    if (m) errs.push(`${m[0]} in ${file}:${i + 1} is a COLOUR, not a size — Tailwind compiles it to \`color: var(--ms-${m[1]})\`, the browser drops the invalid value and the text silently keeps its parent's size. Write \`text-[length:var(--ms-${m[1]})]\`.`);
  });

  {
    const audible = /(^|[^\w.])(\w+)\.volume\s*=/;
    for (const [file, text] of parts) for (const m of text.matchAll(/function\s+\w+[\s\S]{0,600}?\n\}/g)) {
      if (audible.test(m[0]) && /requestAnimationFrame/.test(m[0])) {
        const line = text.slice(0, m.index).split("\n").length;
        errs.push(`requestAnimationFrame drives a \`.volume\` fade in ${file}:${line} — rAF does not fire in a hidden document, so this fade stalls when the app is backgrounded and leaves the element SILENT (a reconnect that lands in the background never becomes audible). Drive it with setTimeout, and when document.visibilityState === "hidden" set the target value and finish synchronously.`);
      }
    }
  }

  if (/modal-bottom/.test(src)) {
    errs.push(`hand-rolled bottom sheet (\`modal-bottom\`) in ${at(/modal-bottom/)} — import { Sheet } from "/_rt/ui.js" instead. The kit owns the shell (glass, drag-to-dismiss, title row, close, backdrop); pass open/onClose from your S.screen atom so Back still closes it.`);
  }

  {
    const self = new RegExp(
      String.raw`(\w+)\.width\s*=[^;\n]*\b\1\.client(Width|Height)|` +
      String.raw`(\w+)\.client(Width|Height)[^;\n]*;\s*[^;\n]*\b\3\.width\s*=`,
    ).exec(src);
    if (self) {
      const el = self[1] || self[3];
      errs.push(`\`${el}\` is a canvas measured against itself in ${parts.find(([, t]) => t.includes(self[0]))?.[0] ?? srcFile} —\`${el}.width = ${el}.clientWidth * dpr\`. Before the browser-generated stylesheet lands, \`clientWidth\` on a canvas is its INTRINSIC size (300), so this bakes 300×DPR into layout and the page overflows on a cold open; an ancestor's \`overflow-hidden\` has not applied yet either, so nothing clips it. Measure a wrapper whose height is its own (or the viewport for a fixed field), set \`style.width\`/\`style.height\` AND the backing store, and observe the BOX — never the canvas.`);
    }
  }

  {
    const bespokeSheet = /role=["']dialog["']/.test(src) && /fixed inset-0/.test(src);
    if (bespokeSheet && !/\bSheet\b/.test(src)) {
      errs.push(`hand-rolled bottom sheet in ${srcFile} — a \`fixed inset-0\` + \`role="dialog"\` is the farm's Sheet built by hand. import { Sheet } from "/_rt/ui.js": it owns the shell (glass, drag-to-dismiss, title row, close, backdrop, max-h-88dvh with the only sanctioned inner scroll) and the contents stay yours. Pass open/onClose from your S.screen atom so the system Back button still closes it.`);
    }
  }

  // THE GOLDEN RULE OF TYPING (owner 2026-10-09): a text field is a <textarea rows="1"> that grows (runtime.css
  // field-sizing + grow.js). A password stays an <input> (a textarea cannot mask); every non-text type is fine.
  for (const [file, text] of parts) for (const m of text.matchAll(/<input\b[^>]*>/gs)) {
    if (/type=["']?(file|checkbox|radio|range|hidden|color|date|time|datetime-local|month|week|submit|button|reset|image|password)\b/.test(m[0]) || /password/.test(m[0])) continue;
    const line = text.slice(0, m.index).split("\n").length;
    if (/^\s*(\*|\/\/)/.test(text.split("\n")[line - 1])) continue;   // a doc comment showing the old shape
    errs.push(`text <input> in ${file}:${line} — every text field is a <textarea rows="1"> that grows with what is typed (the farm's golden rule). A one-line one (search, URL, name, number) adds data-line (Enter submits, a pasted line break becomes a space); the keyboard comes from inputmode / enterkeyhint / autocomplete, never from type. Only a password stays an <input>.`);
  }

  if (/lucide:play/.test(src) && /lucide:(pause|square)/.test(src)) {
    const toggles = /\?\s*"lucide:(pause|square)"\s*:\s*"lucide:play"|\?\s*"lucide:play"\s*:\s*"lucide:(pause|square)"/.test(src);
    if (toggles && !/\bTransport\b/.test(src)) {
      errs.push(`hand-rolled play/pause control in ${srcFile} — import { Transport } from "/_rt/ui.js" instead. Every control is opt-in (pass onPrev/onNext/onSeek/onRepeat/onShuffle and it appears), it carries its own a11y labels in both locales, and it is the only one that compacts correctly in a split-screen window.`);
    }
  }

  {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    const surfaceShadow = /(?:^|[\s"'`])shadow-(?:sm|md|lg|xl|2xl|inner)\b/;
    if (surfaceShadow.test(code)) {
      errs.push(`app-authored shadow in ${at(surfaceShadow)} — the material is systemic. Declare what the surface IS: \`sf-raised\` / \`sf-inset\` / \`sf-pressed\`, or a rung of the ladder \`sf-e2\` (hover) … \`sf-e5\` (popover). A hardcoded shadow does not invert with the theme and does not compact with the density ladder.`);
    }
    const glassOnOurSurface = /backdrop-blur(-[a-z0-9]+)?\b[^"'`]*\bbg-base-|bg-base-[0-9]+\/[0-9]+[^"'`]*\bbackdrop-blur\b/;
    if (glassOnOurSurface.test(code)) {
      errs.push(`frosted glass over a base surface in ${at(glassOnOurSurface)} — glass and the extrusion are answers to the same question and cannot both be on screen: the blur erases the shadow pair that makes the surface read. Use \`sf-raised\`/\`sf-e4\` and an opaque bg-base-100. (Blur over a VIDEO or camera frame is still fine — that is foreign content, not our surface.)`);
    }

    if (/(?:^|[\s"'`])transition-all\b/.test(code)) {
      errs.push(`\`transition-all\` in ${at(/(?:^|[\s"'`])transition-all\b/)} — name the properties instead. It animates the material too: sf-raised/sf-inset are box-shadow pairs, so the extrusion cross-fades on every state change, and layout properties (width/margin) re-layout each frame off the compositor. Use \`transition-colors\`/\`transition-opacity\`/\`transition-shadow\`/\`transition-transform\`, or an arbitrary set like \`transition-[width]\` / \`transition-[box-shadow,background-color,scale]\`.`);
    }

    { const foreign = [...code.matchAll(/["']([a-z0-9-]+):[a-z0-9-]+["']/g)]
        .map((m) => m[1])
        .filter((p) => p !== "lucide" && ICON_SETS.has(p));
      if (foreign.length) {
        errs.push(`non-lucide icon set (${[...new Set(foreign)].join(", ")}) in ${srcFile} — the farm draws from ONE set. Mixed sets differ in stroke weight and optical size on the same row, which reads as sloppiness rather than variety. Use a \`lucide:*\` glyph, or draw a runtime SVG if lucide genuinely lacks the shape.`);
      } }
  }

  { const emojiRe = /\p{Emoji_Presentation}/gu;
    const scan = (label, text) => { const m = text.match(emojiRe); if (m) errs.push(`emoji ${[...new Set(m)].join(" ")} in ${label} — emoji are banned farm-wide; use a crafted vector (iconify lucide:*/mdi:*, an /_rt SVG like Sign) or plain words, never an emoji`); };
    for (const [file, text] of parts) scan(file, text);
    scan("spec.json", JSON.stringify(spec));
    for (const l of locales) scan(`i18n/${l}.json`, JSON.stringify(i18n[l])); }

  { const m = src.match(/\.toLocale(?:Date|Time)?String\(\s*(?:undefined\b|\))/);
    if (m) errs.push(`locale-blind \`${m[0]}…\` — pass the app locale, or return a raw value for the renderer to format (never bake a locale-frozen string in an adapter/view)`); }

  const { document, rafErr, uncaught } = installDom();
  try {
    const views = mode === "tool" ? await dynImport(`file://${await Deno.realPath(`${appdir}/view.js`)}`) : {};
    const { start } = await dynImport("/_rt/index.js");
    const composed = { ...spec, i18n };
    if (mode === "tool") start(composed, { views });
    else if (mode === "stream") { const { stream } = await dynImport(`file://${await Deno.realPath(`${appdir}/stream.js`)}`); start(composed, { stream }); }
    else { let load = async () => ({ items: [], meta: {} }); try { ({ load } = await dynImport(`file://${await Deno.realPath(`${appdir}/data.js`)}`)); } catch { } start(composed, load); }
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
    if (sensorImport && /\bcamera\b/.test(sensorImport[1]) && !/CameraPrime/.test(src)) {
      errs.push(`imports the camera but never renders <${"CameraPrime"}/> — a camera view must PRIME the permission with a custom "why + processed on your device" screen before the native getUserMedia prompt, never open the stream cold. Import { CameraPrime } from "/_rt/camprime.js" and show it until the user opts in.`);
    }
    if (sensorImport && /\bmic\b/.test(sensorImport[1]) && !/MicPrime/.test(src)) {
      errs.push(`imports the microphone but never renders <${"MicPrime"}/> — a mic view must PRIME the permission with a custom "why + processed on your device" screen before the native getUserMedia prompt. Import { MicPrime } from "/_rt/camprime.js" and show it until the user opts in.`);
    }

    for (const e of rafErr) errs.push("render loop threw: " + (e?.message || e));
    for (const m of uncaught) errs.push("async/effect threw: " + m);
  } catch (e) {
    errs.push("mount threw: " + (e?.stack?.split("\n").slice(0, 3).join(" | ") || e?.message || e));
  }

  const name = appdir.replace(/\/$/, "").split("/").pop() + (URL_QUERY ? C.d + " " + URL_QUERY + C.x : "");
  if (errs.length) { console.log(`  ${C.r}✗ ${name}${C.x}`); errs.forEach((e) => console.log(`      ${C.r}${e}${C.x}`)); }
  else { console.log(`  ${C.g}✓ ${name}${C.x}${warns.length ? C.y + " (" + warns.length + " warn)" + C.x : ""}`); warns.forEach((w) => console.log(`      ${C.y}${w}${C.x}`)); }
  return errs.length;
}

async function exists(p) { try { await Deno.stat(p); return true; } catch { return false; } }

const dirs = Deno.args.filter((a) => !a.startsWith("--") && a !== URL_ARG).map((a) => a.replace(/\/$/, ""));
if (!dirs.length) { console.error(`usage: preflight.mjs apps/<id> [apps/<id> ...] [--url "?tab=<id>&screen=<key>"]`); Deno.exit(2); }
console.log(`\n  preflight (browser-free)${URL_ARG ? C.d + "  " + URL_ARG + C.x : ""}\n`);
let fail = 0;
const toolTabsAfterFirst = (d) => {
  if (URL_ARG) return [];
  try {
    const tabs = JSON.parse(Deno.readTextFileSync(`${d}/spec.json`)).tabs || [];
    return tabs.slice(1).filter((t) => t.type === "tool" && t.id).map((t) => `?tab=${t.id}`);
  } catch { return []; }
};
const badApps = new Set();
for (const d of dirs) {
  URL_QUERY = URL_ARG;
  let n = await preflight(d);
  for (const q of toolTabsAfterFirst(d)) { URL_QUERY = q; n += await preflight(d); }
  URL_QUERY = URL_ARG;
  fail += n;
  if (n) badApps.add(d);
}
console.log(`\n  ${fail ? `${C.r}✗ ${badApps.size} app(s) failed · ${fail} problem(s)` : C.g + "✓ all clean"}${C.x}\n`);
Deno.exit(fail ? 1 : 0);
