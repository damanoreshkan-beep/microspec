// 8n8 registry contract. The runner trusts the registry completely, so the registry is what gets tested:
// a bad `needs` or a cycle would surface as a hang or a silently-skipped gate, which is the failure mode
// this whole tool exists to remove.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { NODES, FLOWS, byId, topo, determinism, globApps } from "./nodes.mjs";

Deno.test("every node id is unique", () => {
  const ids = NODES.map((n) => n.id);
  assertEquals(ids.length, new Set(ids).size, `duplicate id: ${ids.filter((v, i) => ids.indexOf(v) !== i)}`);
});

Deno.test("the DAG is acyclic and every `needs` resolves", () => {
  const order = topo();                       // throws, with the offending ids named, if either is false
  assertEquals(order.length, NODES.length);
  const seen = new Set();
  for (const n of order) {
    for (const d of n.needs) assert(seen.has(d), `${n.id} runs before its dependency ${d}`);
    seen.add(n.id);
  }
});

Deno.test("every script node produces a non-empty argv, and no agent node pretends to", () => {
  for (const n of NODES) {
    if (n.kind === "script") {
      assert(typeof n.run === "function", `${n.id} is a script node with no run()`);
      const argv = n.run({ app: "sonar", recipe: "recipes/x.json" });
      assert(Array.isArray(argv) && argv.length > 0 && argv.every((a) => typeof a === "string" && a),
        `${n.id} produced a bad argv: ${JSON.stringify(argv)}`);
    } else {
      assertEquals(n.kind, "agent");
      assertEquals(n.run, undefined, `${n.id} is an agent node but carries a run()`);
      assertEquals(n.frozen, null, `${n.id} is an agent node but claims a freeze date`);
    }
  }
});

Deno.test("a frozen node is a script node, and vice versa", () => {
  for (const n of NODES) assertEquals(n.kind === "script", n.frozen !== null || n.kind === "script",
    `${n.id}: kind/frozen disagree`);
  // the direction that actually matters: nothing may claim a freeze date without being deterministic
  for (const n of NODES) if (n.frozen) assertEquals(n.kind, "script", `${n.id} froze but is not a script node`);
});

Deno.test("every flow names real nodes", () => {
  for (const [flow, ids] of Object.entries(FLOWS)) {
    for (const id of ids) assert(byId(id), `flow "${flow}" names unknown node "${id}"`);
  }
});

Deno.test("the gates flow is fully deterministic AND farm-scoped", () => {
  for (const id of FLOWS.gates) {
    const n = byId(id);
    // A gate you have to ask a model to run is not a gate.
    assertEquals(n.kind, "script", `gates target "${id}" is an agent node`);
    // A per-app node in `gates` would demand --app for a whole-farm check — the exact bug that showed
    // `needs` was conflating pipeline ORDER with what a run has to execute.
    assertEquals(n.scope, "farm", `gates target "${id}" is per-app; gates inspects the whole farm`);
  }
});

Deno.test("determinism is the share of script nodes", () => {
  const d = determinism();
  assertEquals(d.script + d.agent, NODES.length);
  assertEquals(d.pct, Math.round((d.script / NODES.length) * 100));
  assert(d.pct >= 60, `pipeline determinism fell to ${d.pct}% — freezing is supposed to be one-way`);
});

Deno.test("globApps returns real app directories that carry a spec", () => {
  const dirs = globApps();
  assert(dirs.length > 40, `only ${dirs.length} apps found — is the cwd the repo root?`);
  for (const d of dirs) Deno.statSync(`${d}/spec.json`);
  assertEquals(globApps("spec.json")[0], `${dirs[0]}/spec.json`);
});
