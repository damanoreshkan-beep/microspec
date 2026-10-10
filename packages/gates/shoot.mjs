const args = Deno.args;
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? (args[i + 1] ?? d) : d; };
const isFlagVal = (a) => ["--out", "--base", "--bp", "--theme", "--locale", "--query"].some((f) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] === a; });
const apps = args.filter((a) => !a.startsWith("--") && !isFlagVal(a));
const base = flag("--base", "https://mriia.si/").replace(/\/?$/, "/");
const out = flag("--out", "packages/gates/shots");
const seed = args.includes("--seed");
const mock = args.includes("--mock");
const theme = flag("--theme", "");
const locale = flag("--locale", "");

const BP = {
  "phone-sm": [320, 568], "phone": [384, 832], "default": [390, 844], "phone-tall": [412, 915],
  "phone-land": [844, 390], "split": [412, 430], "split-sm": [360, 340],
  "tablet": [768, 1024], "tablet-land": [1024, 768], "desktop": [1280, 900],
};
const bpArg = flag("--bp", "default");
const chosen = bpArg === "all" ? Object.keys(BP).filter((k) => k !== "default") : [bpArg];
for (const b of chosen) if (!BP[b]) { console.error(`unknown --bp "${b}" — one of: ${Object.keys(BP).join(", ")}, all`); Deno.exit(2); }

if (!apps.length) { console.error("usage: shoot.mjs <appId...> [--seed] [--mock] [--bp <id|all>] [--theme light] [--locale en] [--query k=v] [--out dir] [--base url]"); Deno.exit(2); }
await Deno.mkdir(out, { recursive: true });

const fresh = args.includes("--fresh");
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
