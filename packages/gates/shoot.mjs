// shoot — fetch server-side screenshots of the LIVE apps so an agent can run the design taste review
// (packages/gates/taste review, see docs/DESIGN_RUBRIC.md). The render happens on microlink's servers, so
// this needs NO local Chromium (which never runs on-device here) and NO API key. Output feeds a Claude
// agent — in a session or a headless CI step — which is the "VLM" of the taste gate: it reads the PNGs and
// judges them against the rubric. axe/overflow/e2e can't see "this looks generic / incoherent"; the agent can.
//
//   deno run -A packages/gates/shoot.mjs habits rave ruler --seed
//   deno run -A packages/gates/shoot.mjs drift --bp phone-land          # one breakpoint
//   deno run -A packages/gates/shoot.mjs rave v2m --locale en --fresh   # English chrome (README stills)
//   deno run -A packages/gates/shoot.mjs drift --bp all --seed          # the whole matrix, one PNG each
//   deno run -A packages/gates/shoot.mjs hf --out /tmp/shots --base https://damanoreshkan-beep.github.io/microspec/
//
// --bp mirrors the verify gate's BREAKPOINTS. The measurable half of responsiveness (overflow, fit) is
// checked in CI; this is how the TASTE half gets looked at — a screen that technically fits at 390px tall
// can still be a squashed mess, and nobody was ever able to see that from a single 390×844 PNG.

const args = Deno.args;
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? (args[i + 1] ?? d) : d; };
const isFlagVal = (a) => ["--out", "--base", "--bp", "--theme", "--locale", "--query"].some((f) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] === a; });
const apps = args.filter((a) => !a.startsWith("--") && !isFlagVal(a));
const base = flag("--base", "https://damanoreshkan-beep.github.io/microspec/").replace(/\/?$/, "/");
const out = flag("--out", "packages/gates/shots");
const seed = args.includes("--seed");
// A TOOL app seeds its fixture off /_rt/gate.js, which flips on ?mock — not ?seed. Shooting one with
// --seed photographs its EMPTY state and calls it the app: pins was judged on 80% of void that way.
const mock = args.includes("--mock");
// --theme light shoots the OTHER theme. Half of every taste review is "and now look at it light", and the
// only thing that could produce that still was verify.mjs --shots, i.e. a local Chromium — which this
// project never runs. The runtime honours ?theme= for exactly this (it does not persist).
const theme = flag("--theme", "");
// --locale en shoots the OTHER language. The farm's stored default is `uk`, so every still this tool could
// produce — including the ones in the public README — shipped Cyrillic chrome. The runtime honours
// ?locale= for exactly this (validated against the app's own dicts; it does not persist).
const locale = flag("--locale", "");

// Kept in sync with packages/gates/browser-lib.mjs BREAKPOINTS (that file is the gate's copy; this one is
// the eye's). `default` is the historical single shot, so an existing invocation is unchanged.
const BP = {
  "phone-sm": [320, 568], "phone": [384, 832], "default": [390, 844], "phone-tall": [412, 915],
  "phone-land": [844, 390], "split": [412, 430], "split-sm": [360, 340], "watch": [208, 248], "watch-sq": [200, 200],
  "tablet": [768, 1024], "tablet-land": [1024, 768], "desktop": [1280, 900],
};
const bpArg = flag("--bp", "default");
const chosen = bpArg === "all" ? Object.keys(BP).filter((k) => k !== "default") : [bpArg];
for (const b of chosen) if (!BP[b]) { console.error(`unknown --bp "${b}" — one of: ${Object.keys(BP).join(", ")}, all`); Deno.exit(2); }

if (!apps.length) { console.error("usage: shoot.mjs <appId...> [--seed] [--mock] [--bp <id|all>] [--theme light] [--locale en] [--query k=v] [--out dir] [--base url]"); Deno.exit(2); }
await Deno.mkdir(out, { recursive: true });

// microlink caches per URL, so the shot you get right after a deploy is usually the app you just
// replaced. --fresh forces a re-render. Not the default: it's slower and spends quota, and most reviews
// are of something that shipped a while ago.
const fresh = args.includes("--fresh");
// --query "detail=190192" — anything else the runtime honours from the URL. The one that made this necessary
// is `?detail=`: a drill-down is the DEEPEST screen an app has and in some apps it IS the app, and until it
// could be addressed the eye could only ever see a landing page. A screenshot service cannot tap.
const query = flag("--query", "");

async function shoot(app, bp) {
  const [W, H] = BP[bp];
  const q = [seed ? "seed" : "", mock ? "mock" : "", theme ? `theme=${theme}` : "", locale ? `locale=${locale}` : "", query].filter(Boolean).join("&");
  const url = `${base}${app}/${q ? "?" + q : ""}`;
  const api = `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false&waitUntil=networkidle2&viewport.width=${W}&viewport.height=${H}&viewport.deviceScaleFactor=2${fresh ? "&force=true" : ""}`;
  const r = await fetch(api);
  const j = await r.json();
  const shotUrl = j?.data?.screenshot?.url;
  if (j.status !== "success" || !shotUrl) throw new Error(`microlink: ${j.status} ${j.message || ""}`);
  const png = new Uint8Array(await (await fetch(shotUrl)).arrayBuffer());
  const path = `${out}/${app}${bp === "default" ? "" : "@" + bp}${theme ? "~" + theme : ""}${locale ? "." + locale : ""}.png`;
  await Deno.writeFile(path, png);
  return { app, path, bytes: png.length };
}

for (const app of apps) {
  for (const bp of chosen) {
    try { const r = await shoot(app, bp); console.log(`  ✓ ${r.app} ${bp} → ${r.path} (${(r.bytes / 1024).toFixed(0)} KB)`); }
    catch (e) { console.log(`  ✗ ${app} ${bp} — ${e.message}`); }
  }
}
console.log(`\n  Next: have a Claude agent read ${out}/*.png against docs/DESIGN_RUBRIC.md and emit a verdict.`);
