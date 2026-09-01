/* @ts-self-types="./demo.d.mts" */
/**
 * # demo — the gate material the core does not carry
 *
 * The core carries no apps: the split (2026-08-31) gave them to the product. So the app the gates and CI
 * verify is generated, not stored — `authorless` turns `recipes/books.json` into a complete list-family
 * app with zero model calls, `scaffold` gives it a shell, `sw` its precache stub, `readme` its page. A
 * tree that already has apps is left alone, which is the whole point: every gate node can depend on this
 * one unconditionally, in the framework checkout and in the product alike. A script with no exports.
 *
 * ![The demo node in the 8n8 pipeline — author lane, no dependencies, every gate node hanging off it](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/pipeline-demo.svg)
 *
 * ## Usage
 * ```sh
 * deno run -A jsr:@microspec/core/demo
 * ```
 * The framework tree runs it as `deno task demo`; `deno task gates` runs it as the 8n8 node `demo`, the
 * first node of the `gates` flow. `verify.yml` runs it as its own step before the gates ("Seed the demo
 * app — the core carries no apps, gate material is GENERATED").
 *
 * ## Flags and arguments
 * None — it reads the tree it is run in. Everything it decides comes from what exists under `apps/`.
 *
 * ## What it checks / produces
 * Three trees, three behaviours, decided by one probe: is there any `apps/<id>/spec.json`?
 * - No `apps/` at all, or no app with a spec (the appless framework checkout, a fresh CI runner): seeds
 *   `apps/books` — `packages/gen/authorless.mjs recipes/books.json` → `packages/gen/scaffold.mjs apps/books`
 *   → `deploy/sw.mjs` → `deploy/readme.mjs`, each as a child `deno run -A`, stdout and stderr inherited.
 *   Prints `demo: generated apps/books (authorless → scaffold → sw → readme)`.
 * - Apps present and `apps/store` absent (a framework checkout where the demo already exists): the seed is
 *   skipped, but `deploy/sw.mjs` is re-run so the demo's precache stub follows the runtime — a runtime
 *   change moves the demo's import closure, and a stale stub would fail the `sw` gate forever.
 * - Apps present and `apps/store` present (the product tree, which has the launcher): nothing is touched.
 *   Prints `demo: tree already has apps — nothing to seed`.
 *
 * Green means the tree now has at least one app whose spec, shell, service-worker manifest and README the
 * gate nodes can read.
 *
 * ## Exit codes
 * - 0 — the seed completed, the stub was refreshed, or there was nothing to seed.
 * - Otherwise the exit code of the first child that failed (authorless, scaffold, sw or readme), passed
 *   through unchanged — the child has already printed its own named failure.
 *
 * ## Where it sits
 * 8n8 node `demo` · phase author · script (frozen 2026-08-31) · scope farm · needs: nothing · needed by:
 * `validate`, `noundef`, `preflight`, `caps`, `unit`, `sw`, `readme`, `counts`.
 *
 * ## Why
 * The core carries no apps — the split gave them to the product. Gate material is generated:
 * authorless → scaffold → sw → readme seed `apps/books` when the tree has none; a tree with apps (the
 * product) is untouched, so every gate node can depend on this unconditionally.
 * @module
 */
// microspec — seed the framework tree's gate material. The core carries NO apps (the product owns them;
// the split, 2026-08-31), so the demo app the gates and CI verify is GENERATED, not stored: authorless
// (recipe → app, zero model calls) + scaffold (shell) + sw (precache stub) + readme (the app's page).
// A tree that already has apps — the product, or a checkout where the demo exists — is left untouched,
// which is why every gate node can depend on this unconditionally.
//   deno run -A tools/demo.mjs
const has = (p) => { try { Deno.statSync(p); return true; } catch { return false; } };
let present = false;
try {
  for (const e of Deno.readDirSync("apps")) if (e.isDirectory && has(`apps/${e.name}/spec.json`)) { present = true; break; }
} catch { /* no apps/ dir at all — the appless framework checkout */ }
if (present) {
  // The PRODUCT tree (it has the store launcher) is never touched. The FRAMEWORK tree's generated demo is
  // kept FRESH instead: a runtime change moves the demo's import closure, and a stale sw stub would fail
  // the sw gate forever (the seed itself is skipped — the app exists; only the derived stub is refreshed).
  if (!has("apps/store")) {
    const { code } = await new Deno.Command("deno", { args: ["run", "-A", "deploy/sw.mjs"], stdout: "inherit", stderr: "inherit" }).output();
    Deno.exit(code);
  }
  console.log("demo: tree already has apps — nothing to seed");
  Deno.exit(0);
}

const run = async (...args) => {
  const { code } = await new Deno.Command("deno", { args: ["run", "-A", ...args], stdout: "inherit", stderr: "inherit" }).output();
  if (code) Deno.exit(code);
};
await run("packages/gen/authorless.mjs", "recipes/books.json");
await run("packages/gen/scaffold.mjs", "apps/books");
await run("deploy/sw.mjs");
await run("deploy/readme.mjs");
console.log("demo: generated apps/books (authorless → scaffold → sw → readme)");
