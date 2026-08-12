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

// Iconify prefixes that are plausibly reachable from the CDN we load. A WHITELIST rather than "anything
// shaped like prefix:name", because that shape also matches `"data:image"`, a bare `"uk:UA"`, and any
// two-part id an app happens to store — a gate that fires on those would be teaching people to work around
// it. Only `lucide` is legal (see the ban below); the rest of the list exists so the ban can NAME what it
// caught instead of saying "something looked like an icon".
const ICON_SETS = new Set(["mdi", "ph", "tabler", "carbon", "ri", "material-symbols", "simple-icons", "logos",
  "bi", "heroicons", "solar", "iconoir", "fluent", "octicon", "codicon", "fa6-solid", "fa6-regular",
  "fa6-brands", "ic", "majesticons", "gravity-ui", "hugeicons", "streamline", "mingcute", "akar-icons"]);

// one shared DOM + global shim, reset per app
// `--url "?tab=hits&screen=pl:mars"` — mount the app AT a screen instead of at its landing state.
//
// Preflight has always mounted the FIRST tab and nothing else, so everything behind a tool tab or a
// history-backed sheet was invisible to the fast gate and could only fail in Chromium, one CI round later.
// The runtime already routes `?tab=`/`?screen=`/`?theme=`/`?locale=` for the screenshot service, which
// cannot tap either — this hands the same door to the local gate. Whatever the runtime honours, preflight
// can now mount.
const URL_ARG = (() => { const i = Deno.args.indexOf("--url"); return i >= 0 ? (Deno.args[i + 1] || "") : ""; })();
let URL_QUERY = URL_ARG;   // reassigned by the tab sweep below when no explicit --url was given

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
    // The profile tab is 100% runtime-rendered from spec.profile flags — its labels live in NO app source,
    // so a missing one prints the raw key ("profTheme", "install") on a screen the app author never wrote.
    // Parity can't catch it (both locales equally missing) — only tying the key to the declared capability does.
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

  // No content-less spinner loaders — show the app + a modern skeleton (/_rt/skeleton.js Loading/Scramble/
  // Pixels) instead. DaisyUI loading spinners are banned in app source.
  if (/loading loading-(spinner|ring|dots|ball|bars|infinity)/.test(src)) errs.push(`spinner loader banned — use <${"Loading"}/> from /_rt/skeleton.js (or Scramble/Pixels skeletons), never a content-less spinner`);

  // ONE bottom sheet for the whole farm. Eight apps had hand-rolled the same <dialog class="modal
  // modal-bottom"> + grip + close, and they had already drifted: different max-widths, different title
  // sizes, some with a close button and some only the drag. Nothing a gate could see — a copied component
  // fails by divergence, silently, which is why this is a static ban rather than a review note. The kit's
  // Sheet is the shell only; everything inside it is still the app's.
  if (/modal-bottom/.test(src)) {
    errs.push(`hand-rolled bottom sheet (\`modal-bottom\`) in ${srcFile} — import { Sheet } from "/_rt/ui.js" instead. The kit owns the shell (glass, drag-to-dismiss, title row, close, backdrop); pass open/onClose from your S.screen atom so Back still closes it.`);
  }

  /* A canvas may not be measured against ITSELF. Four apps shipped `x.width = x.clientWidth * dpr`,
     and it is a race rather than a mistake you can see: `clientWidth` on a canvas reports its
     INTRINSIC size for exactly as long as no CSS width applies, and this farm generates its utility
     sheet in the browser. So on a cold open there is a window in which `w-full` has not applied —
     nor `fixed`, nor an ancestor's `overflow-hidden` — the canvas reads its default 300px, writes
     back 300×DPR, and bakes that into layout. lorawatch pushed a 384px page out to 600px this way
     and only failed when a runtime change forced the first whole-farm verify in weeks; ruler's copy
     multiplied by 3 and reached 900px; drift observed the canvas with a ResizeObserver, so the loop
     fed itself. gsmscan and ruler were green in the run that caught lorawatch, which is the whole
     argument for a static ban: three of the four were passing at the moment the bug was found.

     Measure a BOX whose size cannot depend on the canvas — a wrapper with its own height, or the
     viewport for a `fixed inset-0` field — and write both halves of the HiDPI pair. */
  {
    const self = new RegExp(
      String.raw`(\w+)\.width\s*=[^;\n]*\b\1\.client(Width|Height)|` +
      String.raw`(\w+)\.client(Width|Height)[^;\n]*;\s*[^;\n]*\b\3\.width\s*=`,
    ).exec(src);
    if (self) {
      const el = self[1] || self[3];
      errs.push(`\`${el}\` is a canvas measured against itself in ${srcFile} — \`${el}.width = ${el}.clientWidth * dpr\`. Before the browser-generated stylesheet lands, \`clientWidth\` on a canvas is its INTRINSIC size (300), so this bakes 300×DPR into layout and the page overflows on a cold open; an ancestor's \`overflow-hidden\` has not applied yet either, so nothing clips it. Measure a wrapper whose height is its own (or the viewport for a fixed field), set \`style.width\`/\`style.height\` AND the backing store, and observe the BOX — never the canvas.`);
    }
  }

  // The `modal-bottom` ban above only caught the apps that hand-rolled a sheet out of DaisyUI. Five more had
  // built the same thing one layer lower — a bare `<div class="fixed inset-0" role="dialog">` with their own
  // backdrop button, their own grip and their own close — so they sailed past a class-name check while being
  // exactly the defect it exists to stop. sigil had two of them; nova had one in view.js and another in
  // finale.js. They had already drifted apart (different radii, different backdrop opacities, two of them
  // with no drag-to-dismiss at all), which is the failure mode: a copied component diverges silently.
  //   Scoped to a FIXED, full-inset dialog, because that is a bottom sheet's geometry. An `absolute inset-0`
  // overlay inside a game board (code's game-over screen) is not a sheet, and a <dialog> element driven by
  // the kit is excluded by the Sheet import.
  {
    const bespokeSheet = /role=["']dialog["']/.test(src) && /fixed inset-0/.test(src);
    if (bespokeSheet && !/\bSheet\b/.test(src)) {
      errs.push(`hand-rolled bottom sheet in ${srcFile} — a \`fixed inset-0\` + \`role="dialog"\` is the farm's Sheet built by hand. import { Sheet } from "/_rt/ui.js": it owns the shell (glass, drag-to-dismiss, title row, close, backdrop, max-h-88dvh with the only sanctioned inner scroll) and the contents stay yours. Pass open/onClose from your S.screen atom so the system Back button still closes it.`);
    }
  }

  // ONE transport for the whole farm, same argument as the sheet above and the same static ban. Six apps had
  // hand-rolled a play control (rave's pad row, handpan twice, fmradio, drift, ambient, synesth, kalimba,
  // breathe) and they had already drifted: some square-stop and some pause-bar, some with a seek bar and some
  // without, three different a11y labels for "Play". A play/pause toggle is the one control whose behaviour
  // (auto-advance, repeat modes, scrub lifecycle, the compact ladder) is worth getting right ONCE.
  //   A per-item play button in a LIST is not a transport — it plays row N, it has no state to keep — so the
  // ban is scoped to a control that toggles between the two icons, which only a transport does.
  if (/lucide:play/.test(src) && /lucide:(pause|square)/.test(src)) {
    const toggles = /\?\s*"lucide:(pause|square)"\s*:\s*"lucide:play"|\?\s*"lucide:play"\s*:\s*"lucide:(pause|square)"/.test(src);
    if (toggles && !/\bTransport\b/.test(src)) {
      errs.push(`hand-rolled play/pause control in ${srcFile} — import { Transport } from "/_rt/ui.js" instead. Every control is opt-in (pass onPrev/onNext/onSeek/onRepeat/onShuffle and it appears), it carries its own a11y labels in both locales, and it is the only one that compacts correctly in a split-screen window.`);
    }
  }

  // ONE material for the whole farm, and the same argument as the sheet and the transport above: an app
  // that writes its own shadow is a second design system with a sample size of one. Twenty-seven of these
  // had accumulated across twelve apps — `shadow-lg` on a card, `shadow-sm` on a tile, a hand-rolled
  // `bg-base-100/80 backdrop-blur-xl border border-base-content/10` "glass island" in six different apps
  // with six different opacities. None of it survived the repaint, because none of it was reading the
  // theme: a fixed rgba(0,0,0,.5) drop is invisible on a dark page and a bruise on a light one.
  //   The farm's surfaces are declared, not drawn: `sf-raised` · `sf-inset` · `sf-pressed`, or a rung of
  // the elevation ladder `sf-e1`…`sf-e5`. Those read --nm-dark/--nm-light, so they invert with the theme
  // and compact with the density ladder for free.
  //   Scoped to Tailwind's SURFACE shadow utilities on purpose. `drop-shadow-*` is a filter on a glyph
  // (legibility over arbitrary video, not a surface) and stays legal, as does an arbitrary shadow that
  // paints a literal light source — an LED, a camera flash ring — which is depicting a thing, not a widget.
  {
    // Scanned WITHOUT comments. These two bans match on class-name shapes, and the most likely place to
    // write the banned shape deliberately is a comment explaining what was removed and why — outpost's
    // note recording the hairline-plus-glass it had replaced failed its own app for describing history.
    // A gate that punishes documentation teaches people to delete the documentation.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    const surfaceShadow = /(?:^|[\s"'`])shadow-(?:sm|md|lg|xl|2xl|inner)\b/;
    if (surfaceShadow.test(code)) {
      errs.push(`app-authored shadow in ${srcFile} — the material is systemic. Declare what the surface IS: \`sf-raised\` / \`sf-inset\` / \`sf-pressed\`, or a rung of the ladder \`sf-e2\` (hover) … \`sf-e5\` (popover). A hardcoded shadow does not invert with the theme and does not compact with the density ladder.`);
    }
    // Glass over the app's OWN surface fights the extrusion it is blurring — and the sheet is opaque now.
    // Over foreign content (a video frame, a camera feed) it is still the right call, so the ban is scoped
    // to a blur sitting on a base-* surface, which is what every offender actually was.
    // `backdrop-blur` with NO suffix is Tailwind's DEFAULT blur, not a typo — and the first version of this
    // ban required the hyphen, so four sticky headers (rave, handpan, actions, outpost) sailed straight
    // through it while being the exact defect. `-?` where the suffix is optional; `\b` so it still cannot
    // match `backdrop-blur-none`-style words mid-token.
    const glassOnOurSurface = /backdrop-blur(-[a-z0-9]+)?\b[^"'`]*\bbg-base-|bg-base-[0-9]+\/[0-9]+[^"'`]*\bbackdrop-blur\b/;
    if (glassOnOurSurface.test(code)) {
      errs.push(`frosted glass over a base surface in ${srcFile} — glass and the extrusion are answers to the same question and cannot both be on screen: the blur erases the shadow pair that makes the surface read. Use \`sf-raised\`/\`sf-e4\` and an opaque bg-base-100. (Blur over a VIDEO or camera frame is still fine — that is foreign content, not our surface.)`);
    }

    // `transition-all` animates EVERY animatable property, including the ones you did not mean and the ones
    // the material owns. On this farm that is not a style nit: `sf-raised`/`sf-inset`/`sf-e2` are box-shadow
    // pairs, so a state change under `transition-all` cross-fades the extrusion itself — the surface visibly
    // melts between raised and recessed instead of snapping, and on a sequencer running at tempo it smears
    // sixteen cells at once. It also animates layout properties (width, margin, padding), which is the
    // expensive half: the compositor cannot take those, so every frame is a full re-layout.
    //   The fix is always the same and always cheap: name the properties. Tailwind ships `transition-colors`,
    // `transition-opacity`, `transition-shadow` and `transition-transform` (which covers transform, translate,
    // scale and rotate); anything else is an arbitrary value — `transition-[width]`,
    // `transition-[box-shadow,background-color,scale]`.
    if (/(?:^|[\s"'`])transition-all\b/.test(code)) {
      errs.push(`\`transition-all\` in ${srcFile} — name the properties instead. It animates the material too: sf-raised/sf-inset are box-shadow pairs, so the extrusion cross-fades on every state change, and layout properties (width/margin) re-layout each frame off the compositor. Use \`transition-colors\`/\`transition-opacity\`/\`transition-shadow\`/\`transition-transform\`, or an arbitrary set like \`transition-[width]\` / \`transition-[box-shadow,background-color,scale]\`.`);
    }

    // ONE icon set for the whole farm. Two libraries on one surface never look like two libraries — they look
    // like sloppiness, because they differ in exactly the ways the eye reads as craft: stroke weight, corner
    // radius, optical size, how much of the 24-unit box the glyph fills. The farm is 100% `lucide:` today
    // (1114 references, zero mixing) and that is worth PINNING rather than rediscovering: the first `mdi:`
    // glyph beside a lucide one is a hairline next to a 2px stroke, and it will be added by someone reaching
    // for the one icon lucide happens not to have. If lucide genuinely lacks it, draw it as a runtime SVG
    // (the /_rt/zodiac.js `Sign` precedent) so it is OURS and matches the set, or pick a different metaphor.
    { const foreign = [...code.matchAll(/["']([a-z0-9-]+):[a-z0-9-]+["']/g)]
        .map((m) => m[1])
        .filter((p) => p !== "lucide" && ICON_SETS.has(p));
      if (foreign.length) {
        errs.push(`non-lucide icon set (${[...new Set(foreign)].join(", ")}) in ${srcFile} — the farm draws from ONE set. Mixed sets differ in stroke weight and optical size on the same row, which reads as sloppiness rather than variety. Use a \`lucide:*\` glyph, or draw a runtime SVG if lucide genuinely lacks the shape.`);
      } }
  }

  // No emoji anywhere in app source — they render as OS-specific colour clip-art (cheap, inconsistent, off-brand)
  // and can't be themed. Use a crafted vector instead: an iconify glyph (lucide:*, mdi:*), a runtime SVG
  // (e.g. /_rt/zodiac.js `Sign`), or — where the render context can't hold a component (a native <option>,
  // a plain string) — just words. `\p{Emoji_Presentation}` targets default-emoji chars (incl. flags, zodiac
  // signs) without flagging text symbols like ·, →, ♪, digits.
  { const emojiRe = /\p{Emoji_Presentation}/gu;
    const scan = (label, text) => { const m = text.match(emojiRe); if (m) errs.push(`emoji ${[...new Set(m)].join(" ")} in ${label} — emoji are banned farm-wide; use a crafted vector (iconify lucide:*/mdi:*, an /_rt SVG like Sign) or plain words, never an emoji`); };
    scan(srcFile, src);
    scan("spec.json", JSON.stringify(spec));
    for (const l of locales) scan(`i18n/${l}.json`, JSON.stringify(i18n[l])); }

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
    // The camera never opens cold: a native prompt with no context scares users into denying. An app that
    // imports `camera` MUST render the priming screen (/_rt/camprime.js) and only start the stream on the
    // user's explicit tap. Grepped, not inferred — the check is the policy.
    if (sensorImport && /\bcamera\b/.test(sensorImport[1]) && !/CameraPrime/.test(src)) {
      errs.push(`imports the camera but never renders <${"CameraPrime"}/> — a camera view must PRIME the permission with a custom "why + processed on your device" screen before the native getUserMedia prompt, never open the stream cold. Import { CameraPrime } from "/_rt/camprime.js" and show it until the user opts in.`);
    }
    // The microphone is the same policy, and worse if skipped: a cold prompt for the mic reads as spyware.
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
// Every TOOL tab past the first gets its own mount. An explicit --url means the caller is aiming at one
// screen deliberately, so the sweep stays out of the way. Non-tool tabs (list/stream) render through the
// runtime rather than app code and are already covered by the default mount.
const toolTabsAfterFirst = (d) => {
  if (URL_ARG) return [];
  try {
    const tabs = JSON.parse(Deno.readTextFileSync(`${d}/spec.json`)).tabs || [];
    return tabs.slice(1).filter((t) => t.type === "tool" && t.id).map((t) => `?tab=${t.id}`);
  } catch { return []; }
};
// preflight() returns a PROBLEM count, so summing it and calling the total "apps" reports 20 broken apps
// when one app has 20 missing i18n keys — a number that sends you looking for a farm-wide regression that
// does not exist. Count the two things separately and name both.
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
