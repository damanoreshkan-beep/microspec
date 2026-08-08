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
  },
  {
    id: "spec", kind: "agent", phase: "author", needs: ["research"], scope: "app", frozen: null,
    why: "spec.json — the tab contract. Freezable per FAMILY, not in general: authorless.mjs already " +
      "emits it deterministically for the list family from a recipe.",
  },
  {
    id: "i18n", kind: "agent", phase: "author", needs: ["spec"], scope: "app", frozen: null,
    why: "en + uk, hand-written, no machine translation of UI copy. Partially frozen: authorless.mjs " +
      "carries the BASE dictionary every list app needs, so only app-specific strings are authored.",
  },
  {
    id: "view", kind: "agent", phase: "author", needs: ["spec"], scope: "app", frozen: null,
    why: "view.js or data.js. MUST run before scaffold — scaffold picks tool-mode vs data-mode by whether " +
      "view.js exists, and getting that order wrong yields a green preflight over an empty screen.",
  },
  {
    id: "authorless", kind: "script", phase: "author", needs: ["ideate"], scope: "app", frozen: "2026-07-05",
    why: "The frozen author. A recipe (source + field map) → a complete list-family app, no model. " +
      "This node is the existence proof that agent nodes can freeze.",
    run: (ctx) => ["deno", "run", "-A", "packages/gen/authorless.mjs", ctx.recipe ?? "recipes/<id>.json"],
  },
  {
    id: "scaffold", kind: "script", phase: "author", needs: ["view", "i18n"], scope: "app", frozen: "2026-06-18",
    why: "index.html + manifest.json + sw stub + icon.svg. Identical for every app, so it is a function.",
    run: (ctx) => ["deno", "run", "-A", "packages/gen/scaffold.mjs", `apps/${ctx.app}`],
  },

  // ── gate: the deterministic half. Every node here answers with a NAMED failure. ────────────────
  {
    id: "validate", kind: "script", phase: "gate", needs: ["spec"], scope: "farm", frozen: "2026-06-11",
    why: "ajv against packages/schema/spec.schema.json — the contract, machine-checked.",
    run: () => ["deno", "run", "-A", "packages/schema/validate.mjs", ...globApps("spec.json")],
  },
  {
    id: "noundef", kind: "script", phase: "gate", needs: ["scaffold"], scope: "farm", frozen: "2026-06-24",
    why: "Undefined identifiers a zero-build stack would only discover in the browser.",
    run: () => ["deno", "run", "-A", "tools/noundef.mjs"],
  },
  {
    id: "preflight", kind: "script", phase: "gate", needs: ["scaffold"], scope: "farm", frozen: "2026-06-11",
    why: "The farm's own invariants (no emoji, no spinners, camera priming, i18n keys) — linkedom, no Chromium.",
    run: () => ["deno", "run", "-A", "--import-map=packages/gates/preflight.importmap.json",
      "packages/gates/preflight.mjs", ...globApps()],
  },
  {
    id: "unit", kind: "script", phase: "gate", needs: [], scope: "farm", frozen: "2026-06-11",
    why: "packages/runtime — where the math is supposed to live. A barrel over tests/<module>_test.js.",
    run: () => ["deno", "test", "-A", "packages/runtime/runtime_test.js"],
  },
  {
    id: "mcp", kind: "script", phase: "gate", needs: [], scope: "farm", frozen: "2026-07-20",
    why: "tools/mcp server contract.",
    run: () => ["deno", "test", "-A", "tools/mcp/server_test.js"],
  },
  {
    id: "pipeline", kind: "script", phase: "gate", needs: [], scope: "farm", frozen: "2026-08-08",
    why: "8n8's own registry: the DAG is acyclic, every `needs` resolves, every script node has a run().",
    run: () => ["deno", "test", "-A", "tools/8n8/run_test.js"],
  },
  {
    id: "kit", kind: "script", phase: "gate", needs: ["scaffold"], scope: "farm", frozen: "2026-07-02",
    why: "The kit manifest matches what the runtime actually exports.",
    run: () => ["deno", "run", "-A", "tools/kit-manifest.mjs", "--check"],
  },
  {
    id: "shell", kind: "script", phase: "gate", needs: [], scope: "farm", frozen: "2026-07-28",
    why: "The Android action catalogue generates both sides; --check fails when they drift.",
    run: () => ["deno", "run", "-A", "tools/shell-gen.mjs", "--check"],
  },
  {
    id: "sw", kind: "script", phase: "gate", needs: ["scaffold"], scope: "farm", frozen: "2026-07-09",
    why: "Per-app offline precache, regenerated from the REAL import graph. Adopting a kit component is " +
      "enough to stale it, which is why this is a gate and not a habit.",
    run: () => ["deno", "run", "-A", "deploy/sw.mjs", "--check"],
  },
  {
    id: "counts", kind: "script", phase: "gate", needs: [], scope: "farm", frozen: "2026-07-09",
    why: "App-count claims in the docs, checked against the directory. Prose rots; this makes it fail.",
    run: () => ["deno", "run", "-A", "deploy/counts.mjs", "--check"],
  },

  // ── ship ──────────────────────────────────────────────────────────────────────────────────────
  {
    id: "manifest", kind: "script", phase: "ship", needs: ["scaffold"], scope: "farm", frozen: "2026-06-19",
    why: "The launcher list (apps/store/apps.json) — the app's identity OUTSIDE its own folder.",
    run: () => ["deno", "run", "-A", "deploy/manifest.mjs"],
  },
  {
    id: "affected", kind: "script", phase: "ship", needs: [], scope: "farm", frozen: "2026-07-16",
    why: "Which apps a change actually reaches, from the real import graph — CI's scope, computed not guessed.",
    run: () => ["deno", "run", "-A", "tools/affected.mjs", "--all"],
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

// apps/*/… — expanded here rather than shelling out to a glob, so a node's argv is data, not a string
// a shell will re-interpret. (`deno task gates` passed `apps/*` through the shell; a node does not.)
export function globApps(suffix = "") {
  const ids = [];
  for (const e of Deno.readDirSync("apps")) {
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
  gates: ["validate", "noundef", "preflight", "unit", "mcp", "pipeline", "kit", "shell", "sw", "counts"],
  author: ["scaffold"],
  ship: ["push"],
  all: NODES.map((n) => n.id),
};
