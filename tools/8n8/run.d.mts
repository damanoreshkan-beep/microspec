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
// GENERATED by tools/dts.mjs from tools/8n8/run.mjs — edit the JSDoc there, never this file.
export {};
