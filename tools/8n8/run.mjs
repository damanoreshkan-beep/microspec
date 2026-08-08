// 8n8 — the runner. Executes a flow's DAG: independent nodes concurrently, dependents after.
//
//   deno run -A tools/8n8/run.mjs gates              # the pre-push floor
//   deno run -A tools/8n8/run.mjs gates --json       # machine-readable result
//   deno run -A tools/8n8/run.mjs --list             # the registry + the determinism number
//   deno run -A tools/8n8/run.mjs gates --dry        # print the argv of every node, run nothing
//   deno run -A tools/8n8/run.mjs author --app=myapp # per-app nodes need an app id
//
// Why this exists rather than `cmd-a && cmd-b && cmd-c`:
//
//  1. `&&` stops at the FIRST red, so one round answers one boolean. This runs every node whose
//     dependencies are green and returns the WHOLE work list — the rule the farm keeps re-learning.
//  2. `&&` loses which command failed; a pipe into grep loses the exit code entirely (`gates | grep …`
//     returns grep's status, which is how a red farm got pushed). Here the exit code is the number of
//     failed nodes and every failure is printed with its node id, its argv, and its output IN FULL.
//  3. Independent nodes have no reason to be sequential.
//
// Output is never truncated. A diagnostic you cut is a diagnostic you will re-run.

import { NODES, FLOWS, byId, topo, determinism } from "./nodes.mjs";

const args = Deno.args;
const flagOf = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const has = (name) => args.includes(`--${name}`);
const flow = args.find((a) => !a.startsWith("--")) ?? "gates";
const ctx = { app: flagOf("app"), recipe: flagOf("recipe") };
const CONCURRENCY = Number(flagOf("jobs") ?? 4);   // proot on a phone: 4 is measured-comfortable, not a guess

const C = { dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", bold: "\x1b[1m", off: "\x1b[0m" };

if (has("list")) {
  const d = determinism();
  console.log(`${C.bold}8n8 registry${C.off} — ${d.script} script · ${d.agent} agent · ${d.pct}% deterministic\n`);
  let phase = null;
  for (const n of topo()) {
    if (n.phase !== phase) { phase = n.phase; console.log(`${C.bold}[${phase}]${C.off}`); }
    const mark = n.kind === "script" ? `${C.green}script${C.off}` : `${C.yellow}agent ${C.off}`;
    const froze = n.frozen ? `${C.dim}froze ${n.frozen}${C.off}` : `${C.dim}—${C.off}`;
    console.log(`  ${mark} ${n.id.padEnd(11)} ${n.scope.padEnd(5)} ${froze}`);
    console.log(`         ${C.dim}${n.why}${C.off}`);
    if (n.needs.length) console.log(`         ${C.dim}needs: ${n.needs.join(", ")}${C.off}`);
  }
  Deno.exit(0);
}

// Resolve the flow to its transitive closure, in topological order.
const targets = FLOWS[flow];
if (!targets) {
  console.error(`8n8: unknown flow "${flow}". Known: ${Object.keys(FLOWS).join(", ")}`);
  Deno.exit(2);
}
// A flow is a CLOSED set, not a transitive closure. `needs` records the pipeline's order — scaffold
// precedes preflight when you are AUTHORING an app — but the gates flow inspects a repo whose scaffold
// already happened and is committed. Pulling dependencies in would drag every gate back through the
// authoring nodes and demand an --app for a whole-farm check. So: the flow names what runs, and `needs`
// only orders it. A dependency outside the plan is treated as already satisfied, by definition.
const wanted = new Set(targets);
const plan = topo().filter((n) => wanted.has(n.id));

// An agent node is not a command. It is a hand-off — the runner reports it and treats it as satisfied
// for dependency purposes, because pretending otherwise would block every gate behind "ideate".
const runnable = plan.filter((n) => n.kind === "script");
const handoffs = plan.filter((n) => n.kind === "agent");

if (has("dry")) {
  for (const n of plan) {
    const argv = n.kind === "script" ? n.run(ctx).join(" ") : `${C.yellow}(agent — hand-off)${C.off}`;
    console.log(`${n.id.padEnd(11)} ${argv}`);
  }
  Deno.exit(0);
}

const needsApp = runnable.filter((n) => n.scope === "app");
if (needsApp.length && !ctx.app) {
  console.error(`8n8: flow "${flow}" contains per-app nodes (${needsApp.map((n) => n.id).join(", ")}) — pass --app=<id>`);
  Deno.exit(2);
}

const results = new Map();   // id → { ok, ms, code, out }
const started = Date.now();

// In-plan dependencies gate; out-of-plan ones are history, and agent deps are hand-offs, not blockers.
const inPlan = (d) => wanted.has(d) && byId(d).kind === "script";
const ready = (n) => n.needs.every((d) => !inPlan(d) || results.get(d)?.ok === true);
const blockedBy = (n) => n.needs.filter((d) => inPlan(d) && results.get(d)?.ok === false);

async function exec(n) {
  const argv = n.run(ctx);
  const t0 = Date.now();
  let code = 1, out = "";
  try {
    const p = await new Deno.Command(argv[0], { args: argv.slice(1), stdout: "piped", stderr: "piped" }).output();
    code = p.code;
    out = new TextDecoder().decode(p.stdout) + new TextDecoder().decode(p.stderr);
  } catch (e) {
    out = `8n8: could not spawn ${argv[0]} — ${e.message}`;
  }
  const r = { ok: code === 0, ms: Date.now() - t0, code, out, argv };
  results.set(n.id, r);
  const mark = r.ok ? `${C.green}ok  ${C.off}` : `${C.red}FAIL${C.off}`;
  console.log(`  ${mark} ${n.id.padEnd(11)} ${C.dim}${(r.ms / 1000).toFixed(1)}s${C.off}`);
  return r;
}

// Wave scheduling: everything whose dependencies are settled runs together, capped at CONCURRENCY.
// A node whose dependency FAILED is skipped and said so — never silently dropped.
const pending = new Set(runnable.map((n) => n.id));
const skipped = [];
console.log(`${C.bold}8n8 ${flow}${C.off} — ${runnable.length} script nodes` +
  (handoffs.length ? `, ${handoffs.length} agent hand-off${handoffs.length > 1 ? "s" : ""}` : ""));

while (pending.size) {
  const wave = [...pending].map(byId).filter(ready);
  const dead = [...pending].map(byId).filter((n) => blockedBy(n).length);
  for (const n of dead) {
    pending.delete(n.id);
    skipped.push({ id: n.id, because: blockedBy(n) });
  }
  if (!wave.length) {
    if (dead.length) continue;
    break;    // nothing ready, nothing dead → the remainder waits on agent work
  }
  for (let i = 0; i < wave.length; i += CONCURRENCY) {
    await Promise.all(wave.slice(i, i + CONCURRENCY).map((n) => { pending.delete(n.id); return exec(n); }));
  }
}

const failed = [...results.entries()].filter(([, r]) => !r.ok);

// The whole work list, in full. This is the payload the runner exists for.
for (const [id, r] of failed) {
  console.log(`\n${C.red}${C.bold}✗ ${id}${C.off}  ${C.dim}exit ${r.code} · ${r.argv.join(" ")}${C.off}`);
  console.log(r.out.trimEnd());
}
for (const s of skipped) {
  console.log(`\n${C.yellow}⊘ ${s.id}${C.off} ${C.dim}skipped — blocked by ${s.because.join(", ")}${C.off}`);
}
for (const n of handoffs) {
  console.log(`${C.yellow}◇ ${n.id}${C.off} ${C.dim}agent hand-off — ${n.why}${C.off}`);
}

const secs = ((Date.now() - started) / 1000).toFixed(1);
console.log(`\n${failed.length ? C.red : C.green}${C.bold}${failed.length ? `${failed.length} node(s) failed` : "all green"}${C.off}` +
  ` ${C.dim}· ${results.size} ran · ${skipped.length} skipped · ${secs}s${C.off}`);

if (has("json")) {
  console.log(JSON.stringify({
    flow, ok: failed.length === 0, seconds: Number(secs),
    nodes: [...results.entries()].map(([id, r]) => ({ id, ok: r.ok, code: r.code, ms: r.ms })),
    skipped, handoffs: handoffs.map((n) => n.id), determinism: determinism(),
  }, null, 1));
}

// A green run leaves a trace, so the push hook can enforce "gates green before EVERY push" mechanically
// instead of trusting a promise. A gate result is about a TREE, not about a moment.
//
// The stamp is the git tree hash of the full working tree — every tracked and untracked-but-not-ignored
// file, content-addressed. Built against a THROWAWAY index (GIT_INDEX_FILE), so the real index is never
// touched. That choice matters: `HEAD + git status --porcelain` would have been easier and wrong, because
// committing changes both while changing no file content, so every commit would have demanded another
// 24-second run before the push was allowed. A hook that costs a pointless minute is a hook that gets
// switched off, and a switched-off hook enforces nothing.
function treeHash(cwd = ".") {
  const env = { ...Deno.env.toObject(), GIT_INDEX_FILE: `${Deno.makeTempDirSync()}/idx` };
  const git = (...args) => new Deno.Command("git", { args, cwd, env, stdout: "piped", stderr: "null" }).outputSync();
  git("add", "-A", "--", ".");
  return new TextDecoder().decode(git("write-tree").stdout).trim();
}

if (!failed.length && flow === "gates") {
  try {
    await Deno.mkdir(".8n8", { recursive: true });
    await Deno.writeTextFile(".8n8/last-green.json", JSON.stringify({
      flow, at: new Date().toISOString(), seconds: Number(secs),
      tree: treeHash(), nodes: [...results.keys()].sort(),
    }, null, 1));
  } catch { /* a stamp is a convenience; never fail a green run over it */ }
}

// The exit code is the number of failed nodes — never a grep's status, never a truncated tail.
Deno.exit(failed.length ? 1 : 0);
