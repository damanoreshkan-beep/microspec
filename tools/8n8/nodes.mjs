// 8n8 — the farm's pipeline registry. n8n inside out.
//
// n8n: a human draws the graph, the machine executes it. The graph precedes the work.
// 8n8: the AGENT does the work, and a run that proved itself FREEZES into a deterministic node.
// The graph does not precede the work — it precipitates out of it. Every `script` node below was an
// `agent` node once; `packages/gen/authorless.mjs` is the proof that a whole authoring stage can freeze
// (it emits a complete list-family app from a recipe with no LLM at all).
//
// So the registry is not documentation. It is the measurement: `determinism()` is the share of the
// pipeline that no longer needs a model, and the job of every cycle is to move that number up.
//
// A node:
//   id      unique
//   kind    "script" — a command, reproducible, no model.  "agent" — still needs judgment.
//   phase   which stage of the loop it belongs to
//   needs   node ids that must be green first (the DAG edges)
//   scope   "farm" — runs once.  "app" — runs per app id.
//   run     for script nodes: argv array, or (ctx) => argv
//   why     one line: what it buys. For agent nodes, what would have to be true to freeze it.
//   frozen  ISO date the node stopped being an agent node, or null if it never was one
//
// An `agent` node may additionally carry:
//   agent     "claude" | "codex" — which CLI runs it. Reading goes to codex (rules/research.md); the rest
//             to claude. Both run headless as subprocesses, so this works in CI and off a phone alike.
//   brief     (ctx) => string. The prompt. A node WITHOUT a brief is a hand-off the runner only announces —
//             `taste` is deliberately one of those, because an eye cannot be spawned.
//   produces  (ctx) => string[]. Files the node MUST have created or modified. Checked by mtime+existence
//             after it returns, and this is the whole point: an agent node that "succeeded" while writing
//             nothing is the failure mode automation invites, so it is a hard error rather than a green tick.
//   verify    node id. The deterministic gate that judges the output — spec→validate, view→noundef.
//             Generation you do not check is not a pipeline stage, it is a suggestion.

export const NODES = [
  // ── author: the generative half ────────────────────────────────────────────────────────────────
  {
    id: "ideate", kind: "agent", phase: "author", needs: [], scope: "farm", frozen: null,
    why: "Propose the app. Unfreezable by nature — a registry of app ideas is a registry of the past.",
  },
  {
    id: "research", kind: "agent", phase: "author", needs: ["ideate"], scope: "app", frozen: null,
    why: "The long read → apps/<id>/RESEARCH.md. Delegated to Codex; freezing it would mean the farm " +
      "already knows the API it has never met.",
    agent: "codex",
    produces: (ctx) => [`apps/${ctx.app}/RESEARCH.md`],
    brief: (ctx) => `You are a READ-ONLY researcher for the microspec farm (see AGENTS.md). Do not edit any` +
      ` file except apps/${ctx.app}/RESEARCH.md, which you must write.\n\nTask: ${ctx.task ?? "research this app`s domain"}\n\n` +
      `Write apps/${ctx.app}/RESEARCH.md as a research note: the concrete recipe the build will follow —` +
      ` numbers, formulas, idioms, pitfalls. Every load-bearing claim carries its source (a URL, or a path:line` +
      ` in this repo). Label each claim VERIFIED / INFERRED / UNKNOWN. End with an UNVERIFIED section naming` +
      ` what the build must NOT depend on. Numbers, not adjectives. No Chromium on this device.`,
  },
  {
    id: "spec", kind: "agent", phase: "author", needs: ["research"], scope: "app", frozen: null,
    why: "spec.json — the tab contract. Freezable per FAMILY, not in general: authorless.mjs already " +
      "emits it deterministically for the list family from a recipe.",
    agent: "claude",
    // No `verify` here, and that is a measured correction rather than an omission: validate.mjs checks the
    // COMPOSITION of spec + i18n (composeSpec reads apps/<id>/i18n/*.json), so running it after `spec`
    // fails on a missing `en` dictionary that this node was never supposed to write. A real run said
    // "/i18n must have required property 'en'". The contract is checked one node later, after `i18n`,
    // which is the first moment the thing validate actually validates exists.
    produces: (ctx) => [`apps/${ctx.app}/spec.json`],
    brief: (ctx) => `Author apps/${ctx.app}/spec.json for the microspec farm. Read packages/schema/SCHEMA.md` +
      ` first and obey it exactly; read apps/${ctx.app}/RESEARCH.md if it exists.\n\nApp: ${ctx.task ?? ctx.app}\n\n` +
      `Write ONLY spec.json. Tab types are list | dashboard | converter | tool | profile. Declare \`needs\`` +
      ` honestly — packages/gates/capabilities.mjs checks it against the code. Do not write any other file.`,
  },
  {
    id: "i18n", kind: "agent", phase: "author", needs: ["spec"], scope: "app", frozen: null,
    why: "en + uk, hand-written, no machine translation of UI copy. Partially frozen: authorless.mjs " +
      "carries the BASE dictionary every list app needs, so only app-specific strings are authored.",
    agent: "claude", verify: "validate",
    produces: (ctx) => [`apps/${ctx.app}/i18n/en.json`, `apps/${ctx.app}/i18n/uk.json`],
    brief: (ctx) => `Write apps/${ctx.app}/i18n/en.json and apps/${ctx.app}/i18n/uk.json for the microspec` +
      ` farm. Read apps/${ctx.app}/spec.json — every \`label\`, \`titleKey\` and string key it references must` +
      ` exist in BOTH files, with identical key sets (a parity gate fails otherwise).\n\nRules: no emoji` +
      ` (a gate rejects them). No hand-holding hint text. Ukrainian is authored, never machine-translated` +
      ` from the English. Include the runtime profile/install keys other apps carry.`,
  },
  {
    id: "view", kind: "agent", phase: "author", needs: ["spec"], scope: "app", frozen: null,
    why: "view.js or data.js. MUST run before scaffold — scaffold picks tool-mode vs data-mode by whether " +
      "view.js exists, and getting that order wrong yields a green preflight over an empty screen.",
    agent: "claude", verify: "noundef",
    produces: (ctx) => [`apps/${ctx.app}/view.js`],
    brief: (ctx) => `Write apps/${ctx.app}/view.js for the microspec farm. Read docs/AUTHORING.md and` +
      ` apps/${ctx.app}/spec.json first; export one function per tab \`view\` named in the spec.\n\n` +
      `Hard rules: math goes in the runtime, not here — systemic math in packages/runtime/, product-domain` +
      ` math in the product tree's rt/. Runtime imports are /_rt/*.js from an app file.` +
      ` No emoji, no content-less spinners (use /_rt/skeleton.js), no explanatory hint text. Seed a` +
      ` deterministic fixture under \`gate\` from /_rt/gate.js so the POPULATED screen renders with no network.` +
      ` Reuse the kit in /_rt/ui.js rather than hand-rolling sheets or controls.`,
  },
  {
    id: "authorless", kind: "script", phase: "author", needs: ["ideate"], scope: "app", frozen: "2026-07-05",
    why: "The frozen author. A recipe (source + field map) → a complete list-family app, no model. " +
      "This node is the existence proof that agent nodes can freeze.",
    run: (ctx) => ["deno", "run", "-A", at("packages/gen/authorless.mjs"), ctx.recipe ?? "recipes/<id>.json"],
  },
  {
    id: "scaffold", kind: "script", phase: "author", needs: ["view", "i18n"], scope: "app", frozen: "2026-06-18",
    why: "index.html + manifest.json + sw stub + icon.svg. Identical for every app, so it is a function.",
    run: (ctx) => ["deno", "run", "-A", at("packages/gen/scaffold.mjs"), `apps/${ctx.app}`],
  },
  {
    id: "demo", kind: "script", phase: "author", needs: [], scope: "farm", frozen: "2026-08-31",
    why: "The core carries NO apps (the split: the product owns them). Gate material is GENERATED — " +
      "authorless → scaffold → sw → readme seed apps/books when the tree has none; a tree with apps " +
      "(the product) is untouched, so every gate node can depend on this unconditionally.",
    run: () => ["deno", "run", "-A", at("tools/demo.mjs")],
  },
  {
    id: "realmlint", kind: "script", phase: "gate", needs: [], scope: "farm", frozen: "2026-08-31",
    why: "The core runs from a checkout AND from the JSR cache. Two patterns compile fine and break only " +
      "in the second realm (relative-import.meta fs; raw harness dynamic imports) — five publishes died " +
      "on them in one night, so the classes are banned statically, like relimports.",
    run: () => ["deno", "run", "-A", at("tools/realmlint.mjs")],
  },
  {
    id: "rtmap", kind: "script", phase: "gate", needs: [], scope: "farm", frozen: "2026-08-31",
    why: "The product's preflight import map, generated from its rt/ overlay (exact keys beat the prefix " +
      "key). Preflight mounts real views in Deno, and their /_rt/ imports must route per-file — a stale " +
      "map is a gate that tests the wrong runtime. A tree with no overlay generates nothing.",
    run: () => ["deno", "run", "-A", at("tools/rtmap.mjs"), "--check"],
  },

  // ── gate: the deterministic half. Every node here answers with a NAMED failure. ────────────────
  {
    id: "validate", kind: "script", phase: "gate", needs: ["spec", "demo"], scope: "farm", frozen: "2026-06-11",
    why: "ajv against packages/schema/spec.schema.json — the contract, machine-checked.",
    run: () => ["deno", "run", "-A", at("packages/schema/validate.mjs"), ...globApps("spec.json")],
  },
  {
    id: "noundef", kind: "script", phase: "gate", needs: ["scaffold", "demo"], scope: "farm", frozen: "2026-06-24",
    why: "Undefined identifiers a zero-build stack would only discover in the browser.",
    run: () => ["deno", "run", "-A", at("tools/noundef.mjs")],
  },
  {
    id: "preflight", kind: "script", phase: "gate", needs: ["scaffold", "demo", "rtmap"], scope: "farm", frozen: "2026-06-11",
    why: "The farm's own invariants (no emoji, no spinners, camera priming, i18n keys) — linkedom, no Chromium.",
    // a product carries a GENERATED map (rtmap) that routes its rt/ overlay per-file; the core's own map
    // is the framework tree's fallback.
    run: () => ["deno", "run", "-A",
      present("preflight.map.json") ? "--import-map=preflight.map.json" : `--import-map=${at("packages/gates/preflight.importmap.json")}`,
      present(".microspec/preflight.mjs") ? ".microspec/preflight.mjs" : at("packages/gates/preflight.mjs"),
      ...globApps()],
  },
  {
    id: "caps", kind: "script", phase: "gate", needs: ["spec", "view", "demo"], scope: "farm", frozen: "2026-08-08",
    why: "spec.json `needs` must match the capabilities the code actually reaches for. The field was inert " +
      "and had drifted for a whole category (six apps opened WebUSB, none declared it) — make it true " +
      "before making it functional.",
    run: () => ["deno", "run", "-A", at("packages/gates/capabilities.mjs"), "--check"],
  },
  {
    id: "relimports", kind: "script", phase: "gate", needs: [], scope: "farm", frozen: "2026-08-09",
    why: "Runtime modules must import each other relatively — an absolute /_rt/ 404s on the /microspec/ " +
      "subpath while working locally, so only a rule can catch it. The check existed ONLY in verify.yml, " +
      "so a violation cost a whole CI round; /_rt/hero.js shipped with one.",
    run: () => ["deno", "run", "-A", at("tools/relimports.mjs")],
  },
  {
    id: "unit", kind: "script", phase: "gate", needs: ["demo", "rtmap"], scope: "farm", frozen: "2026-06-11",
    why: "packages/runtime — where the systemic math lives. A barrel over tests/<module>_test.js; the " +
      "product tree adds its own barrel (rt/rt_test.js) over its domain modules.",
    // a consumer runs the core's suites through the LOCAL shim rtmap generates — `deno test` refuses a
    // remote URL as a test module, and silently so when a local file rides along (half a suite once
    // passed). rtmap (a dependency here) writes the shims even under --check, so a fresh CI checkout has
    // them by the time this node runs; the rt/ marker decides which tree this is.
    run: () => ["deno", "test", "-A",
      present("rt/rt_test.js") ? ".microspec/tests/unit_test.js" : at("packages/runtime/runtime_test.js"),
      ...(present("rt/rt_test.js") ? ["rt/rt_test.js"] : [])],
  },
  {
    id: "mcp", kind: "script", phase: "gate", needs: ["rtmap"], scope: "farm", frozen: "2026-07-20",
    why: "tools/mcp server contract.",
    run: () => ["deno", "test", "-A", present("rt/rt_test.js") ? ".microspec/tests/mcp_test.js" : at("tools/mcp/server_test.js")],
  },
  {
    id: "pipeline", kind: "script", phase: "gate", needs: ["rtmap"], scope: "farm", frozen: "2026-08-08",
    why: "8n8's own registry: the DAG is acyclic, every `needs` resolves, every script node has a run().",
    run: () => ["deno", "test", "-A", present("rt/rt_test.js") ? ".microspec/tests/pipeline_test.js" : at("tools/8n8/run_test.js")],
  },
  {
    id: "kit", kind: "script", phase: "gate", needs: ["scaffold"], scope: "farm", frozen: "2026-07-02",
    why: "The kit manifest matches what the runtime actually exports.",
    run: () => ["deno", "run", "-A", at("tools/kit-manifest.mjs"), "--check"],
  },
  {
    id: "shell", kind: "script", phase: "gate", needs: [], scope: "farm", frozen: "2026-07-28",
    why: "The Android action catalogue generates both sides; --check fails when they drift.",
    run: () => ["deno", "run", "-A", at("tools/shell-gen.mjs"), "--check"],
  },
  {
    id: "sw", kind: "script", phase: "gate", needs: ["scaffold", "demo"], scope: "farm", frozen: "2026-07-09",
    why: "Per-app offline precache, regenerated from the REAL import graph. Adopting a kit component is " +
      "enough to stale it, which is why this is a gate and not a habit.",
    run: () => ["deno", "run", "-A", at("deploy/sw.mjs"), "--check"],
  },
  {
    id: "readme", kind: "script", phase: "gate", needs: ["scaffold", "demo"], scope: "farm", frozen: "2026-08-26",
    why: "Each app's README is a one-screen card generated from its spec + i18n. Change the app's copy and " +
      "the page drifts, so the regeneration is a gate: --check fails when a README no longer matches its app.",
    run: () => ["deno", "run", "-A", at("deploy/readme.mjs"), "--check"],
  },
  {
    id: "counts", kind: "script", phase: "gate", needs: ["demo"], scope: "farm", frozen: "2026-07-09",
    why: "App-count claims in the docs, checked against the directory. Prose rots; this makes it fail.",
    run: () => ["deno", "run", "-A", at("deploy/counts.mjs"), "--check"],
  },

  // ── ship ──────────────────────────────────────────────────────────────────────────────────────
  {
    id: "manifest", kind: "script", phase: "ship", needs: ["scaffold"], scope: "farm", frozen: "2026-06-19",
    why: "The launcher list (apps/store/apps.json) — the app's identity OUTSIDE its own folder.",
    run: () => ["deno", "run", "-A", at("deploy/manifest.mjs")],
  },
  {
    id: "affected", kind: "script", phase: "ship", needs: [], scope: "farm", frozen: "2026-07-16",
    why: "Which apps a change actually reaches, from the real import graph — CI's scope, computed not guessed.",
    run: () => ["deno", "run", "-A", at("tools/affected.mjs"), "--all"],
  },
  {
    id: "push", kind: "script", phase: "ship", needs: ["validate", "preflight", "unit", "sw", "counts"],
    scope: "farm", frozen: "2026-06-11",
    why: "git push origin main. Gated on the local gates by the DAG itself, not by a promise.",
    run: () => ["git", "push", "origin", "main"],
  },
  {
    id: "ci", kind: "script", phase: "ship", needs: ["push"], scope: "farm", frozen: "2026-06-11",
    why: "The Chromium/axe/e2e gate — CI-only, this device may never run Chromium. Read the run-level " +
      "conclusion, never the streamed ticks.",
    run: () => ["gh", "run", "list", "--workflow=verify.yml", "--limit", "1", "--json",
      "databaseId,status,conclusion"],
  },
  {
    id: "shot", kind: "script", phase: "ship", needs: ["ci"], scope: "app", frozen: "2026-07-11",
    why: "Server-rendered PNGs of the POPULATED screen, both themes. Frozen as far as producing pixels goes.",
    run: (ctx) => ["deno", "run", "-A", "packages/gates/shoot.mjs", ctx.app, "--seed"],
  },
  {
    id: "taste", kind: "agent", phase: "ship", needs: ["shot"], scope: "app", frozen: null,
    why: "THE NODE THAT MUST NEVER FREEZE. A gate that agrees with a bad screenshot is set too low; the " +
      "eye is the test that catches what every green check missed.",
  },
];

const present = (p) => { try { Deno.statSync(p); return true; } catch { return false; } };

// Every spawned tool is addressed as a URL off THIS module — one mechanism for both realms: a file URL in
// the framework checkout, an https jsr URL when a consumer runs the registry via `jsr:@microspec/core/8n8`.
// (Never a node_modules PATH: code under node_modules executes in the npm realm, where jsr:/https imports
// are refused — the materialized tree is for SERVING files, not for running them.) The cwd stays the
// consumer's tree; tools read apps/, rt/ and the generated artifacts from there.
const at = (p) => new URL(`../../${p}`, import.meta.url).href;

// apps/*/… — expanded here rather than shelling out to a glob, so a node's argv is data, not a string
// a shell will re-interpret. (`deno task gates` passed `apps/*` through the shell; a node does not.)
// The framework tree may have NO apps/ at all before the demo node seeds it — that is an empty list, not a crash.
export function globApps(suffix = "") {
  const ids = [];
  let entries = [];
  try { entries = [...Deno.readDirSync("apps")]; } catch { return ids; }
  for (const e of entries) {
    if (!e.isDirectory) continue;
    try { Deno.statSync(`apps/${e.name}/spec.json`); } catch { continue; }
    ids.push(suffix ? `apps/${e.name}/${suffix}` : `apps/${e.name}`);
  }
  return ids.sort();
}

export const byId = (id) => NODES.find((n) => n.id === id);

// The measurement 8n8 exists to produce: how much of the pipeline no longer needs a model.
export function determinism(nodes = NODES) {
  const script = nodes.filter((n) => n.kind === "script").length;
  return { script, agent: nodes.length - script, total: nodes.length, pct: Math.round((script / nodes.length) * 100) };
}

// Topological order, and it REFUSES to guess: an unknown `needs` or a cycle is a registry bug, not a
// runtime hiccup, so it throws with the offending ids named.
export function topo(nodes = NODES) {
  const known = new Set(nodes.map((n) => n.id));
  for (const n of nodes) {
    for (const d of n.needs) if (!known.has(d)) throw new Error(`8n8: node "${n.id}" needs unknown node "${d}"`);
  }
  const out = [], state = new Map();
  const visit = (n, trail) => {
    if (state.get(n.id) === "done") return;
    if (state.get(n.id) === "open") throw new Error(`8n8: cycle — ${[...trail, n.id].join(" → ")}`);
    state.set(n.id, "open");
    for (const d of n.needs) visit(byId(d), [...trail, n.id]);
    state.set(n.id, "done");
    out.push(n);
  };
  for (const n of nodes) visit(n, []);
  return out;
}

// The named flows. A flow is a SET of target nodes; the runner pulls in their dependencies.
export const FLOWS = {
  // everything runnable on this device, no network, no Chromium — the pre-push floor
  gates: ["demo", "rtmap", "realmlint", "validate", "noundef", "relimports", "preflight", "unit", "mcp", "pipeline", "caps", "kit", "shell", "sw", "readme", "counts"],
  // The authoring flow, now genuinely executable: the briefed agent nodes spawn a headless CLI, each is
  // gated by its own deterministic node the moment it returns, and scaffold turns the result into a
  // runnable app. `ideate` is absent on purpose — wanting an app is the one input a pipeline cannot supply.
  author: ["research", "spec", "i18n", "view", "scaffold"],
  ship: ["push"],
  all: NODES.map((n) => n.id),
};
