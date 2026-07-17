// gate efficacy — mutation testing for the gates themselves.
//
// "Green = correct" is only trustworthy if the gates actually catch the things they claim to. This harness
// measures that: it injects a catalog of known-bad mutations (a dropped translation, an invalid spec, a
// banned spinner, a throwing view, …) into a copy of each app, runs a gate, and records whether the gate
// went RED (caught) or stayed GREEN (escaped). The score is caught / total — a measured floor, not a vibe.
//
// SAFE BY CONSTRUCTION: every mutation is applied to a throwaway temp copy; the real apps/ tree is never
// touched (verified — the harness refuses to run if it can't copy out first).
//
//   deno run -A packages/gates/efficacy.mjs                 # preflight tier, curated sample
//   deno run -A packages/gates/efficacy.mjs --all           # every app
//   deno run -A packages/gates/efficacy.mjs --apps hn,rave  # specific apps
//   deno run -A packages/gates/efficacy.mjs --json docs/efficacy.json
//
// Tiers: the browser-free `preflight` tier runs anywhere (this is what CI-less machines measure). The
// `verify` tier (a11y / overflow / e2e) needs Chromium and is measured in CI — its mutations are defined
// here and marked tier:"verify" so the same catalog drives both.

const C = { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", d: "\x1b[2m", b: "\x1b[1m", x: "\x1b[0m" };
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const IMPORTMAP = `${ROOT}/packages/gates/preflight.importmap.json`;
const PREFLIGHT = `${ROOT}/packages/gates/preflight.mjs`;

const args = Deno.args;
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? (args[i + 1] || "") : null; };
const has = (n) => args.includes(n);

// A curated, diverse sample keeps a full run ~2 min while staying representative (data + tool + dashboard
// families, translated + sensor + audio apps). --all measures every app.
const SAMPLE = ["hn", "hf", "frontier", "weather", "dou", "rave", "kalimba", "ruler"];

const readJson = async (p) => JSON.parse(await Deno.readTextFile(p));
const exists = async (p) => { try { await Deno.stat(p); return true; } catch { return false; } };

async function listApps() {
  const out = [];
  for await (const e of Deno.readDir(`${ROOT}/apps`)) if (e.isDirectory && await exists(`${ROOT}/apps/${e.name}/spec.json`)) out.push(e.name);
  return out.sort();
}

async function copyApp(app) {
  const dir = await Deno.makeTempDir({ prefix: `eff_${app}_` });
  const dst = `${dir}/${app}`;
  const p = new Deno.Command("cp", { args: ["-r", `${ROOT}/apps/${app}`, dst] });
  const { success } = await p.output();
  if (!success) throw new Error(`copy failed for ${app}`);
  return { dir, dst };
}

// Run a gate on an app dir. Returns true if it went RED (caught the injected problem). `preflight` is
// browser-free (runs anywhere); `verify` drives Chromium (CI only — needs DISPLAY + CHROMIUM_PATH, which
// the efficacy-verify CI job sets, mirroring the verify matrix).
async function gateRed(gate, appdir) {
  const cmd = gate === "verify"
    ? new Deno.Command("deno", { args: ["run", "-A", `${ROOT}/packages/gates/verify.mjs`, appdir], stdout: "null", stderr: "null", cwd: ROOT, env: Deno.env.toObject() })
    : new Deno.Command("deno", { args: ["run", "-A", `--import-map=${IMPORTMAP}`, PREFLIGHT, appdir], stdout: "null", stderr: "null", cwd: ROOT });
  const { code } = await cmd.output();
  return code !== 0;
}

// ---- mutation catalog -------------------------------------------------------
// Each mutation edits files inside a temp copy. `tier` = the gate that should catch it. `applies(ctx)`
// gates it to the right app kind. Keep them realistic — each is a mistake an agent actually makes.
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
    async mutate(d) { let hit = false; for (const k of ["close", "refresh", "title"]) { try { await editJson(`${d}/i18n/uk.json`, (o) => { if (k in o) { delete o[k]; hit = k; } }); if (hit) break; } catch { /* */ } } return hit ? `removed runtime key "${hit}"` : false; } },

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

  // The defect this reproduces is the one that actually shipped, twice: headless has no hardware, so a
  // sensor app renders its "locating…" branch, and every check downstream then signs off on a screen no
  // user sees. Disabling the gate detection is precisely that failure — the mock stops seeding a reading,
  // the live UI never mounts, and the app looks perfect while its real layout was measured by nobody.
  // Note this is not a mutation of the marker (renaming data-live would only prove the selector runs); it
  // mutates the CAUSE, and the check has to notice the empty state that results.
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

  // preflight deliberately does NOT execute data.js (no fetch, no logic), so a broken adapter is invisible
  // to it — that regression is the verify tier's job (the app errors at runtime, caught by e2e in CI).
  { id: "data-adapter-throws", cat: "render", tier: "verify",
    applies: ({ mode }) => mode === "data",
    async mutate(d) { const f = `${d}/data.js`; if (!await exists(f)) return false; await Deno.writeTextFile(f, 'throw new Error("mutant: broken data module");\n' + await Deno.readTextFile(f)); return "data.js throws on import"; } },

  // e2e: strip the badges the card declares — the app's own e2e.spec.mjs asserts them, so it goes red.
  { id: "strip-card-badges", cat: "e2e", tier: "verify",
    applies: ({ spec }) => JSON.stringify(spec).includes('"badges"'),
    async mutate(d) { await editJson(`${d}/spec.json`, (o) => { for (const t of o.tabs || []) if (t.card?.badges) delete t.card.badges; }); return "removed all card badges"; } },

  // NOTE: a synthetic overflow mutation (a 140-char tab label) was dropped — the dock truncates the label,
  // so it escaped. That's a weak mutation, not a gate gap: overflow@384 is enforced continuously across all
  // 24 apps on every push. We measure the classes we can inject cleanly (data-integrity, e2e, a11y).

  // a11y: empty every tab label → the dock buttons lose their accessible name (axe button-name).
  { id: "a11y-empty-tab-names", cat: "a11y", tier: "verify",
    applies: ({ spec }) => (spec.tabs || []).some((t) => t.label),
    async mutate(d, { spec }) { const keys = (spec.tabs || []).map((t) => t.label).filter(Boolean); for (const l of ["uk", "en"]) { const p = `${d}/i18n/${l}.json`; if (await exists(p)) await editJson(p, (o) => { for (const k of keys) if (k in o) o[k] = ""; }); } return "emptied tab labels"; } },
];

// ---- run --------------------------------------------------------------------
async function run() {
  const gate = flag("--gate") || "preflight";
  let apps = flag("--apps") ? flag("--apps").split(",") : (has("--all") ? await listApps() : SAMPLE);
  apps = apps.filter(Boolean);
  const muts = MUTATIONS.filter((m) => m.tier === gate);

  console.log(`\n  ${C.b}gate efficacy${C.x} ${C.d}— mutation testing the ${gate} gate over ${apps.length} apps${C.x}\n`);

  const trials = [];
  for (const app of apps) {
    const spec = await readJson(`${ROOT}/apps/${app}/spec.json`);
    const mode = await exists(`${ROOT}/apps/${app}/view.js`) ? "tool" : await exists(`${ROOT}/apps/${app}/stream.js`) ? "stream" : "data";
    const ctx = { spec, mode };

    // baseline: a clean copy MUST be green, else the environment is off and trials are inconclusive.
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
        if (detail === false) continue;              // mutation not applicable to this app's shape
        caught = await gateRed(gate, dst);
      } finally { await Deno.remove(dir, { recursive: true }).catch(() => {}); }
      trials.push({ app, mut: m.id, cat: m.cat, caught });
      row.push(`${caught ? C.g + "✓" : C.r + "✗"}${C.x}${C.d}${m.id}${C.x}`);
    }
    console.log(`  ${C.b}${app}${C.x}  ${row.join("  ")}`);
  }

  // aggregate
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
// CI guard ("gate on the gate"): any escape means the gate regressed → fail. An all-baselines-inconclusive
// run (total 0, e.g. an offline runner) is not a regression → pass with a warning.
if (has("--ci") && total > 0 && pct < 100) Deno.exit(1);
