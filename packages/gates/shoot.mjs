
const args = Deno.args;
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? (args[i + 1] ?? d) : d; };
const isFlagVal = (a) => ["--out", "--base"].some((f) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] === a; });
const apps = args.filter((a) => !a.startsWith("--") && !isFlagVal(a));
const base = flag("--base", "https://damanoreshkan-beep.github.io/microspec/").replace(/\/?$/, "/");
const out = flag("--out", "packages/gates/shots");
const seed = args.includes("--seed");
const W = 390, H = 844;

if (!apps.length) { console.error("usage: shoot.mjs <appId...> [--seed] [--out dir] [--base url]"); Deno.exit(2); }
await Deno.mkdir(out, { recursive: true });

async function shoot(app) {
  const url = `${base}${app}/${seed ? "?seed" : ""}`;
  const api = `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false&waitUntil=networkidle2&viewport.width=${W}&viewport.height=${H}&viewport.deviceScaleFactor=2`;
  const r = await fetch(api);
  const j = await r.json();
  const shotUrl = j?.data?.screenshot?.url;
  if (j.status !== "success" || !shotUrl) throw new Error(`microlink: ${j.status} ${j.message || ""}`);
  const png = new Uint8Array(await (await fetch(shotUrl)).arrayBuffer());
  const path = `${out}/${app}.png`;
  await Deno.writeFile(path, png);
  return { app, path, bytes: png.length };
}

for (const app of apps) {
  try { const r = await shoot(app); console.log(`  ✓ ${r.app} → ${r.path} (${(r.bytes / 1024).toFixed(0)} KB)`); }
  catch (e) { console.log(`  ✗ ${app} — ${e.message}`); }
}
console.log(`\n  Next: have a Claude agent read ${out}/*.png against docs/DESIGN_RUBRIC.md and emit a verdict.`);
