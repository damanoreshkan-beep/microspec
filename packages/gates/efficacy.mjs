const C = { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", d: "\x1b[2m", b: "\x1b[1m", x: "\x1b[0m" };
import { APPS } from "../../tools/graph.mjs";
const ROOT = Deno.cwd();
const PREFLIGHT = await Deno.stat(`${Deno.cwd()}/.microspec/preflight.mjs`).then(() => `${Deno.cwd()}/.microspec/preflight.mjs`)
  .catch(() => new URL("./preflight.mjs", import.meta.url).href);
const IMPORTMAP = await Deno.stat(`${ROOT}/preflight.map.json`).then(() => `${ROOT}/preflight.map.json`)
  .catch(() => new URL("./preflight.importmap.json", import.meta.url).href);

const args = Deno.args;
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? (args[i + 1] || "") : null; };
const has = (n) => args.includes(n);

const SAMPLE = ["hn", "hf", "frontier", "weather", "dou", "rave", "kalimba", "ruler", "code"];

const readJson = async (p) => JSON.parse(await Deno.readTextFile(p));
const exists = async (p) => { try { await Deno.stat(p); return true; } catch { return false; } };

async function listApps() {
  const out = [];
  for await (const e of Deno.readDir(`${ROOT}/${APPS}`)) if (e.isDirectory && await exists(`${ROOT}/${APPS}/${e.name}/spec.json`)) out.push(e.name);
  return out.sort();
}

async function copyApp(app) {
  const dir = await Deno.makeTempDir({ prefix: `eff_${app}_` });
  const dst = `${dir}/${app}`;
  const p = new Deno.Command("cp", { args: ["-r", `${ROOT}/${APPS}/${app}`, dst] });
  const { success } = await p.output();
  if (!success) throw new Error(`copy failed for ${app}`);
  return { dir, dst };
}

async function gateRed(gate, appdir) {
  const cmd = gate === "verify"
    ? new Deno.Command("deno", { args: ["run", "-A", `${ROOT}/packages/gates/verify.mjs`, appdir], stdout: "null", stderr: "null", cwd: ROOT, env: Deno.env.toObject() })
    : new Deno.Command("deno", { args: ["run", "-A", `--import-map=${IMPORTMAP}`, PREFLIGHT, appdir], stdout: "null", stderr: "null", cwd: ROOT });
  const { code } = await cmd.output();
  return code !== 0;
}

const editJson = async (p, fn) => { const d = await readJson(p); fn(d); await Deno.writeTextFile(p, JSON.stringify(d, null, 2)); };
const specLabelKey = (spec) => (JSON.stringify(spec).match(/"(?:label|titleKey|searchKey)":"([A-Za-z][\w]*)"/) || [])[1];

const MUTATIONS = [
  { id: "drop-spec-label-key", cat: "i18n", tier: "preflight",
    applies: () => true,
    async mutate(d, { spec }) { const k = specLabelKey(spec); if (!k) return false; await editJson(`${d}/i18n/uk.json`, (o) => { delete o[k]; }); return `removed "${k}"`; } },

  { id: "drop-en-fallback", cat: "i18n", tier: "preflight",
    applies: () => true,
    async mutate(d) { if (!await exists(`${d}/i18n/en.json`)) return false; await Deno.remove(`${d}/i18n/en.json`); return "deleted en.json"; } },

  { id: "drop-runtime-key", cat: "i18n", tier: "preflight",
    applies: () => true,
    async mutate(d) { let hit = false; for (const k of ["close", "refresh", "title"]) { try { await editJson(`${d}/i18n/uk.json`, (o) => { if (k in o) { delete o[k]; hit = k; } }); if (hit) break; } catch { } } return hit ? `removed runtime key "${hit}"` : false; } },

  { id: "invalid-spec-missing-id", cat: "schema", tier: "preflight",
    applies: () => true,
    async mutate(d) { await editJson(`${d}/spec.json`, (o) => { delete o.id; }); return "removed spec.id"; } },

  { id: "invalid-spec-bad-tabtype", cat: "schema", tier: "preflight",
    applies: () => true,
    async mutate(d) { await editJson(`${d}/spec.json`, (o) => { if (o.tabs?.[0]) o.tabs[0].type = "not_a_family"; }); return "tabs[0].type = not_a_family"; } },

  { id: "spinner-loader", cat: "spinner", tier: "preflight",
    applies: ({ mode }) => mode !== "stream",
    async mutate(d, { mode }) { const f = `${d}/${mode === "tool" ? "view.js" : "data.js"}`; if (!await exists(f)) return false; await Deno.writeTextFile(f, await Deno.readTextFile(f) + '\nexport const __mut = "loading loading-spinner"; // injected\n'); return "injected spinner class"; } },

  { id: "locale-blind-date", cat: "i18n", tier: "preflight",
    applies: ({ mode }) => mode !== "stream",
    async mutate(d, { mode }) { const f = `${d}/${mode === "tool" ? "view.js" : "data.js"}`; if (!await exists(f)) return false; await Deno.writeTextFile(f, await Deno.readTextFile(f) + '\nexport const __mut = new Date().toLocaleDateString(undefined, { weekday: "short" }); // injected\n'); return "injected locale-blind toLocaleDateString(undefined)"; } },

  { id: "view-throws", cat: "render", tier: "preflight",
    applies: ({ mode }) => mode === "tool",
    async mutate(d) { const f = `${d}/view.js`; await Deno.writeTextFile(f, 'throw new Error("mutant: broken view module");\n' + await Deno.readTextFile(f)); return "view.js throws on import"; } },

  { id: "sensor-mock-unseeded", cat: "render", tier: "preflight",
    applies: ({ mode }) => mode === "tool",
    async mutate(d) {
      const f = `${d}/view.js`;
      const s = await Deno.readTextFile(f);
      if (!/import\s*\{[^}]*\b(geo|compass|motion|mic|camera)\b[^}]*\}\s*from\s*["']\/_rt\/sensors\.js["']/.test(s)) return false;
      const out = s.replace(/\.test\(location\.hostname\)/g, ".test('nowhere')");
      if (out === s) return false;
      await Deno.writeTextFile(f, out);
      return "gate detection disabled — the mock no longer seeds a reading";
    } },

  { id: "data-adapter-throws", cat: "render", tier: "verify",
    applies: ({ mode }) => mode === "data",
    async mutate(d) { const f = `${d}/data.js`; if (!await exists(f)) return false; await Deno.writeTextFile(f, 'throw new Error("mutant: broken data module");\n' + await Deno.readTextFile(f)); return "data.js throws on import"; } },

  { id: "strip-card-badges", cat: "e2e", tier: "verify",
    applies: ({ spec }) => JSON.stringify(spec).includes('"badges"'),
    async mutate(d) { await editJson(`${d}/spec.json`, (o) => { for (const t of o.tabs || []) if (t.card?.badges) delete t.card.badges; }); return "removed all card badges"; } },

  { id: "a11y-empty-tab-names", cat: "a11y", tier: "verify",
    applies: ({ spec }) => (spec.tabs || []).some((t) => t.label),
    async mutate(d, { spec }) { const keys = (spec.tabs || []).map((t) => t.label).filter(Boolean); for (const l of ["uk", "en"]) { const p = `${d}/i18n/${l}.json`; if (await exists(p)) await editJson(p, (o) => { for (const k of keys) if (k in o) o[k] = ""; }); } return "emptied tab labels"; } },
];

async function run() {
  const gate = flag("--gate") || "preflight";
  let apps = flag("--apps") ? flag("--apps").split(",") : (has("--all") ? await listApps() : SAMPLE);
  const present = [];
  for (const a of apps) if (await exists(`${ROOT}/${APPS}/${a}/spec.json`)) present.push(a);
  if (!present.length) for (const a of await listApps()) present.push(a);
  if (!present.length) { console.error("efficacy: no apps in this tree — seed one first (deno run -A tools/demo.mjs)"); Deno.exit(1); }
  if (present.length < apps.length) console.log(`efficacy: sample filtered to what this tree holds → ${present.join(", ")}`);
  apps = present;
  apps = apps.filter(Boolean);
  const muts = MUTATIONS.filter((m) => m.tier === gate);

  console.log(`\n  ${C.b}gate efficacy${C.x} ${C.d}— mutation testing the ${gate} gate over ${apps.length} apps${C.x}\n`);

  const trials = [];
  for (const app of apps) {
    const spec = await readJson(`${ROOT}/${APPS}/${app}/spec.json`);
    const mode = await exists(`${ROOT}/${APPS}/${app}/view.js`) ? "tool" : await exists(`${ROOT}/${APPS}/${app}/stream.js`) ? "stream" : "data";
    const ctx = { spec, mode };

    const base = await copyApp(app);
    let baseRed = true;
    try { baseRed = await gateRed(gate, base.dst); } finally { await Deno.remove(base.dir, { recursive: true }).catch(() => {}); }
    if (baseRed) { console.log(`  ${C.y}⚠ ${app}${C.x} ${C.d}baseline not green — skipped (env/network?)${C.x}`); continue; }

    const row = [];
    for (const m of muts) {
      if (!m.applies(ctx)) continue;
      const { dir, dst } = await copyApp(app);
      let detail = false, caught = null;
      try {
        detail = await m.mutate(dst, ctx);
        if (detail === false) continue;
        caught = await gateRed(gate, dst);
      } finally { await Deno.remove(dir, { recursive: true }).catch(() => {}); }
      trials.push({ app, mut: m.id, cat: m.cat, caught });
      row.push(`${caught ? C.g + "✓" : C.r + "✗"}${C.x}${C.d}${m.id}${C.x}`);
    }
    console.log(`  ${C.b}${app}${C.x}  ${row.join("  ")}`);
  }

  const byCat = {};
  for (const t of trials) { (byCat[t.cat] ??= { c: 0, n: 0 }).n++; if (t.caught) byCat[t.cat].c++; }
  const caught = trials.filter((t) => t.caught).length, total = trials.length;
  const pct = total ? Math.round((caught / total) * 100) : 0;

  console.log(`\n  ${C.b}by category${C.x}`);
  for (const [cat, { c, n }] of Object.entries(byCat)) console.log(`    ${(c === n ? C.g : C.y)}${String(Math.round(c / n * 100)).padStart(3)}%${C.x}  ${cat} ${C.d}(${c}/${n})${C.x}`);

  const escapes = trials.filter((t) => !t.caught);
  if (escapes.length) {
    console.log(`\n  ${C.y}escapes (gaps to close, or caught by the verify tier in CI):${C.x}`);
    for (const e of escapes) console.log(`    ${C.r}✗${C.x} ${e.app} · ${e.mut} ${C.d}(${e.cat})${C.x}`);
  }

  const color = pct >= 90 ? C.g : pct >= 70 ? C.y : C.r;
  console.log(`\n  ${C.b}${gate}-tier efficacy: ${color}${pct}%${C.x} ${C.d}(${caught}/${total} injected regressions caught)${C.x}\n`);

  if (flag("--json")) {
    const badgeColor = pct >= 90 ? "brightgreen" : pct >= 70 ? "yellow" : "red";
    const report = { schemaVersion: 1, label: "gate efficacy", message: `${pct}%`, color: badgeColor,
      _meta: { gate, apps: apps.length, caught, total, byCategory: byCat, escapes: escapes.map((e) => `${e.app}:${e.mut}`) } };
    await Deno.writeTextFile(flag("--json"), JSON.stringify(report, null, 2) + "\n");
    console.log(`  ${C.d}wrote ${flag("--json")}${C.x}\n`);
  }
  return { pct, total };
}

const { pct, total } = await run();
if (has("--ci") && total > 0 && pct < 100) Deno.exit(1);
