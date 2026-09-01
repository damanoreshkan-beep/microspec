/* @ts-self-types="./run.d.mts" */
/**
 * # 8n8 — the runner. A flow's DAG executed in waves, every red named in full.
 *
 * n8n has a human draw the graph and a machine run it; 8n8 is that inside out. The agent does the work,
 * and a run that proved itself freezes into a deterministic node of the registry in nodes.mjs. This is
 * the CLI that executes a flow of that registry: independent nodes concurrently, dependents after,
 * a node whose dependency failed skipped and said so, every failure printed with its node id, its argv
 * and its output untruncated. It replaces `cmd-a && cmd-b && cmd-c`, which stops at the FIRST red and
 * answers one boolean per round, and `gates | grep …`, which returns grep's status — the way a red farm
 * once got pushed. A green `gates` run stamps `.8n8/last-green.json` with the working tree's content hash,
 * so "gates before push" is a fact a hook can check, not a promise. It exports nothing.
 *
 * ![The push node and the gates it waits on, drawn from the registry](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/pipeline-push.svg)
 *
 * ## Usage
 * ```sh
 * deno run -A jsr:@microspec/core/8n8 gates                    # the pre-push floor
 * deno run -A jsr:@microspec/core/8n8 gates --json             # machine-readable result
 * deno run -A jsr:@microspec/core/8n8 --list                   # the registry + the determinism number
 * deno run -A jsr:@microspec/core/8n8 gates --dry              # print every node's argv, run nothing
 * deno run -A jsr:@microspec/core/8n8 author --app=myapp       # per-app nodes need an app id
 * deno run -A jsr:@microspec/core/8n8 spec --app=myapp         # ONE node — redo a single stage
 * deno run -A jsr:@microspec/core/8n8 author --app=x --no-agents
 * deno run -A jsr:@microspec/core/8n8 author --app=x --max-agents=2
 * ```
 * In the framework tree `deno task gates` is `run.mjs gates` and `deno task 8n8` is the bare runner. The
 * cwd stays the tree the command runs in; every spawned tool is addressed as a URL off nodes.mjs, so
 * the same registry runs from a checkout and from the JSR cache.
 *
 * ## Flags and arguments
 * | argument | meaning |
 * | --- | --- |
 * | `<flow>` or `<node id>` | positional; a flow name (`gates`, `author`, `ship`, `all`) or ONE node id. Default `gates`. |
 * | `--list` | print every node in topological order by phase (script or agent, scope, freeze date, why, needs) and the determinism share; exit 0 |
 * | `--dry` | print the plan: each node's argv, an agent node's CLI and the head of its brief, a hand-off as such; exit 0 |
 * | `--json` | append a JSON object after the summary: flow, ok, seconds, per-node code and ms, skipped, handoffs, determinism |
 * | `--app=<id>` | the app id for `scope: "app"` nodes; required when the plan contains any |
 * | `--recipe=<path>` | the recipe handed to the authorless node |
 * | `--jobs=N` | wave concurrency cap; default 4 (measured comfortable under proot on a phone) |
 * | `--no-agents` | run deterministic nodes only; briefed agent nodes become announced hand-offs |
 * | `--max-agents=N` | agent budget per run; default 6. Past it an agent node is SKIP, exit 2, not run |
 *
 * A flow is a closed set, not a transitive closure: `needs` only orders what the flow names, and a
 * dependency outside the plan counts as already satisfied. Agent dependencies are hand-offs, never blockers.
 *
 * ## What it checks / produces
 * - One line per node as it settles: `ok` or `FAIL`, the id, seconds, and the agent CLI for agent nodes.
 * - `✗ <id>  exit <code> · <argv>` followed by the node's stdout+stderr in full. Output is never cut; a
 *   diagnostic you truncate is a diagnostic you re-run.
 * - `⊘ <id> skipped — blocked by <ids>`: a dependency in the plan went red; the node did not run.
 * - `◇ <id> agent hand-off — <why>`: a node with no brief (`ideate`, `taste`) that needs a person.
 * - An agent node that exits 0 but leaves every file in its `produces` list untouched fails with code 3
 *   (`the agent exited 0 but did not write: …`); one that wrote is judged at once by its `verify` node
 *   (spec → validate, view → noundef) and fails if that node rejects the output.
 * - Summary: `all green` or `N node(s) failed · ran · skipped · seconds`.
 * - Green `gates` writes `.8n8/last-green.json`: flow, timestamp, seconds, the git tree hash of the full
 *   working tree (tracked and untracked-not-ignored, built against a throwaway index so the real index is
 *   never touched), and the node ids that ran. A stamp failure never reds a green run.
 *
 * ## Exit codes
 * - `0` — every node in the plan is green; also `--list` and `--dry`.
 * - `1` — one or more nodes failed (the count is in the summary line).
 * - `2` — unknown flow or node id, or the plan has per-app nodes and no `--app` was given.
 *
 * ## Where it sits
 * Not a node — it is what runs the nodes. `deno task gates` in the framework tree, and
 * `jsr:@microspec/core/8n8 gates` in a consumer, is this runner on the `gates` flow, the floor a push
 * must clear; the `push` node itself needs validate,
 * preflight, unit, sw and counts green, and `ci` needs push. The `pipeline` gate tests the registry it
 * executes: acyclic, every `needs` resolves, every script node has a run().
 *
 * ![The whole registry: author, gate and ship lanes](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/hero.svg)
 *
 * ## Why
 * The registry is not documentation, it is the measurement: the share of the pipeline that no longer
 * needs a model, and the job of every cycle is to move that number up. The runner is what makes a flow
 * real — independent nodes have no reason to be sequential, a chain that stops at the first red hides
 * the next four, and an exit code that is a grep's status enforces nothing. Every node here answers with
 * a named failure, and the whole work list comes back in one round.
 * @module
 */
// 8n8 — the runner. Executes a flow's DAG: independent nodes concurrently, dependents after.
//
//   deno run -A tools/8n8/run.mjs gates              # the pre-push floor
//   deno run -A tools/8n8/run.mjs gates --json       # machine-readable result
//   deno run -A tools/8n8/run.mjs --list             # the registry + the determinism number
//   deno run -A tools/8n8/run.mjs gates --dry        # print the argv of every node, run nothing
//   deno run -A tools/8n8/run.mjs author --app=myapp # per-app nodes need an app id
//   deno run -A tools/8n8/run.mjs spec --app=myapp   # ONE node — how you test or redo a single stage
//   deno run -A tools/8n8/run.mjs author --app=x --no-agents      # deterministic nodes only
//   deno run -A tools/8n8/run.mjs author --app=x --max-agents=2   # cap the spend (default 6)
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
// A flow name, or a single node id — running one stage is how you test a stage, and it is how you redo the
// one that failed without paying for the four that already worked.
const targets = FLOWS[flow] ?? (byId(flow) ? [flow] : null);
if (!targets) {
  console.error(`8n8: unknown flow or node "${flow}". Flows: ${Object.keys(FLOWS).join(", ")}`);
  Deno.exit(2);
}
// A flow is a CLOSED set, not a transitive closure. `needs` records the pipeline's order — scaffold
// precedes preflight when you are AUTHORING an app — but the gates flow inspects a repo whose scaffold
// already happened and is committed. Pulling dependencies in would drag every gate back through the
// authoring nodes and demand an --app for a whole-farm check. So: the flow names what runs, and `needs`
// only orders it. A dependency outside the plan is treated as already satisfied, by definition.
const wanted = new Set(targets);
const plan = topo().filter((n) => wanted.has(n.id));

// An agent node with a `brief` is EXECUTABLE — it spawns a headless CLI. One without a brief is a genuine
// hand-off the runner only announces (`ideate` needs a person to want something; `taste` needs an eye).
// Both were hand-offs until this; treating the briefed ones as work is what makes `author` a real flow.
const noAgents = has("no-agents");
const executable = (n) => n.kind === "script" || (typeof n.brief === "function" && !noAgents);
const runnable = plan.filter(executable);
const handoffs = plan.filter((n) => !executable(n));
// A budget, because an agent node costs real money and a runaway loop costs a lot of it.
const MAX_AGENTS = Number(flagOf("max-agents") ?? 6);
let agentsRun = 0;

if (has("dry")) {
  for (const n of plan) {
    const argv = n.kind === "script" ? n.run(ctx).join(" ")
      : typeof n.brief === "function" ? `${C.yellow}(${n.agent ?? "claude"})${C.off} ${n.brief(ctx).slice(0, 80).replace(/\s+/g, " ")}…`
      : `${C.yellow}(hand-off — no brief, needs a person)${C.off}`;
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

// The headless CLIs. Reading goes to codex, authoring to claude (rules/research.md draws that line), and
// both are subprocesses rather than an API client so this needs no key and works the same in CI.
const agentArgv = (n) => n.agent === "codex"
  ? ["codex", "exec", "--sandbox", "danger-full-access", n.brief(ctx)]
  : ["claude", "-p", n.brief(ctx), "--output-format", "text"];

const mtimes = (paths) => paths.map((p) => { try { return Deno.statSync(p).mtime?.getTime() ?? 0; } catch { return 0; } });

async function execAgent(n) {
  if (agentsRun >= MAX_AGENTS) {
    const r = { ok: false, ms: 0, code: 2, argv: ["(agent)", n.id],
      out: `8n8: agent budget exhausted (${MAX_AGENTS}). Raise it with --max-agents=N if that is intended.` };
    results.set(n.id, r);
    console.log(`  ${C.red}SKIP${C.off} ${n.id.padEnd(11)} ${C.dim}over budget${C.off}`);
    return r;
  }
  agentsRun++;
  const want = (n.produces?.(ctx) ?? []);
  const before = mtimes(want);
  const argv = agentArgv(n);
  const t0 = Date.now();
  let code = 1, out = "";
  try {
    const p = await new Deno.Command(argv[0], { args: argv.slice(1), stdout: "piped", stderr: "piped" }).output();
    code = p.code;
    out = new TextDecoder().decode(p.stdout) + new TextDecoder().decode(p.stderr);
  } catch (e) {
    out = `8n8: could not spawn ${argv[0]} — ${e.message}`;
  }
  // The check that makes this a pipeline stage rather than a suggestion: an agent that exits 0 having
  // written nothing has NOT done its job, and without this it would report green and the next node would
  // gate an unchanged tree.
  if (code === 0 && want.length) {
    const after = mtimes(want);
    const untouched = want.filter((_, i) => after[i] === 0 || after[i] === before[i]);
    if (untouched.length) {
      code = 3;
      out += `\n\n8n8: the agent exited 0 but did not write: ${untouched.join(", ")}`;
    }
  }
  const r = { ok: code === 0, ms: Date.now() - t0, code, out, argv: [`(${n.agent ?? "claude"})`, n.id] };
  results.set(n.id, r);
  console.log(`  ${r.ok ? C.green + "ok  " : C.red + "FAIL"}${C.off} ${n.id.padEnd(11)} ${C.dim}${(r.ms / 1000).toFixed(1)}s · ${n.agent ?? "claude"}${C.off}`);

  // Its own gate, immediately — spec→validate, view→noundef. Verifying later means debugging a pile.
  if (r.ok && n.verify && byId(n.verify)) {
    const v = byId(n.verify);
    const vr = await exec(v, `${n.id}→`);
    if (!vr.ok) { r.ok = false; r.out += `\n\n8n8: ${n.id} produced output that ${n.verify} rejected.`; results.set(n.id, r); }
  }
  return r;
}

async function exec(n, prefix = "") {
  if (n.kind === "agent") return execAgent(n);
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
  console.log(`  ${mark} ${(prefix + n.id).padEnd(11)} ${C.dim}${(r.ms / 1000).toFixed(1)}s${C.off}`);
  return r;
}

// Wave scheduling: everything whose dependencies are settled runs together, capped at CONCURRENCY.
// A node whose dependency FAILED is skipped and said so — never silently dropped.
const pending = new Set(runnable.map((n) => n.id));
const skipped = [];
const nScript = runnable.filter((n) => n.kind === "script").length, nAgent = runnable.length - nScript;
console.log(`${C.bold}8n8 ${flow}${C.off} — ${nScript} script` + (nAgent ? `, ${nAgent} agent` : "") + ` node(s)` +
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
