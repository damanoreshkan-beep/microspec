/* @ts-self-types="./counts.d.mts" */
/**
 * # counts — the app count measured once, written everywhere it is claimed
 *
 * The farm's app count, derived from the store catalog and written into every place that states it —
 * the README badge, the CTA link, the prose, the Show HN draft — so a hand-typed number can never drift.
 * A script, not a library: it exports nothing. Without a flag it rewrites the claims from the source of
 * truth; `--check` turns it into the gate that fails on a stale claim instead of fixing it. A README that
 * overstates the farm is the same class of defect as an app that overstates its a11y: a claim nobody
 * measured. So it gets a gate like everything else here.
 *
 * ![The counts node in the 8n8 pipeline](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/pipeline-counts.svg)
 *
 * ## Usage
 * ```sh
 * deno run -A jsr:@microspec/core/counts            # rewrite the claims from the source of truth
 * deno run -A jsr:@microspec/core/counts --check    # fail instead of writing (CI)
 * ```
 * `deno task gates` runs it as the 8n8 node `counts`, with `--check`; verify.yml runs the same step before
 * the build check.
 *
 * ## Flags and arguments
 * | flag | effect |
 * | --- | --- |
 * | `--check` | report stale claims and exit 1; write nothing |
 *
 * Two files in the tree it is run in shape the rest:
 * - apps/store/apps.json — the catalog, what a user can actually install. Its length (array or keys) is N.
 *   Absent, as in the appless core, N is the number of apps/<id>/ directories carrying a spec.json.
 * - counts.rules.json, optional — `[{ "file", "pattern", "flags" }]`, the pattern with the number as its
 *   second group. A product tree claims the count in its own words, so its rules REPLACE the built-ins.
 *
 * ## What it checks and writes
 * The built-in rules are the public framework repo's own claims — five in README.md (the `live-N%20apps`
 * badge, `farm — N installable apps]`, `The N-app farm`, `and all N apps were written`,
 * `the reference farm: N apps`) and one in docs/SHOW_HN.md (`the proof: N apps live`). Each is anchored
 * on its surrounding words so a count is never confused with an efficacy score or any other digit.
 * - a rule whose number differs from N is stale: `README.md: "The 25-app farm" → should be 28`.
 * - a rule that matches nothing is stale too: `pattern … matched nothing — the claim was reworded, fix
 *   this rule`. Rewording a claim means updating its rule; the gate refuses to let the two part.
 * - with `--check` the report ends `✗ app-count claims are stale (farm has N installable apps)` and
 *   `fix: deno run -A deploy/counts.mjs`; green is `✓ app-count claims match the farm (N installable apps)`.
 * - without it every ruled file is rewritten in place: `✓ updated k claim(s) → N apps`, or
 *   `✓ already correct (N apps)`.
 *
 * ## Exit codes
 * - 0 — every claim equals N, or the claims were rewritten to N.
 * - 1 — `--check` and at least one claim is stale or a rule no longer matches; also when a ruled file
 *   cannot be read (an uncaught error).
 *
 * ## Where it sits
 * gate · script · needs: demo · needed by: push — one of the five nodes the DAG itself gates the push on
 * (validate, preflight, unit, sw, counts), and a target of the `gates` flow. cwd, not import.meta: the
 * catalog, the rules file and the README all belong to the consumer's tree.
 *
 * ## Why
 * App-count claims in the docs, checked against the directory. Prose rots; this makes it fail. The number
 * was claimed in six hand-typed places and read "25" in one file, "26" in another and 28 in the build log,
 * all at the same time.
 * @module
 */
// counts — the farm's app count, derived once and written everywhere it is claimed.
//
//   deno run -A deploy/counts.mjs            # rewrite the claims from the source of truth
//   deno run -A deploy/counts.mjs --check    # fail instead of writing (CI)
//
// Why this exists: the number is claimed in a badge, a CTA link, three prose lines, a repo-layout table and
// the Show HN draft — six places, hand-typed. It drifted to "25" in one file, "26" in another and 28 in the
// build log, all at the same time. A README that overstates the farm is the same class of defect as an app
// that overstates its a11y: a claim nobody measured. So it gets a gate like everything else here.
//
// Source of truth: apps/home/apps.json — the store catalog, i.e. what a user can actually install. NOT the
// number of directories under apps/: that counts `home` itself, which is the storefront, not an app in it.
// cwd, NOT import.meta: this tool ships inside the @microspec/core package, and everything it touches —
// the catalog, counts.rules.json, the README — belongs to the CONSUMER's tree it runs from.
const ROOT = Deno.cwd();
const check = Deno.args.includes("--check");

// The store catalog is the PRODUCT's source of truth; the appless framework tree (a generated demo, no
// launcher) counts app dirs directly — its rules file is empty, so the number carries no claims there.
const catalog = await Deno.readTextFile(`${ROOT}/apps/store/apps.json`).then(JSON.parse).catch(() => null);
const N = catalog
  ? (Array.isArray(catalog) ? catalog.length : Object.keys(catalog).length)
  : (() => { try { return [...Deno.readDirSync(`${ROOT}/apps`)].filter((e) => { try { Deno.statSync(`${ROOT}/apps/${e.name}/spec.json`); return true; } catch { return false; } }).length; } catch { return 0; } })();

// Each rule is [file, regex with the number as group 2, replacement number]. Anchored on surrounding words
// so a count can never be confused with the efficacy scores or any other digit on the page. Every hardcoded
// app-count claim across the README + Show HN draft gets a rule; reword a claim and you update its rule here.
// A PRODUCT tree (the dreamstudio split, 2026-08-31) claims the count in its own words: an optional
// `counts.rules.json` at ROOT — [{ "file": "README.md", "pattern": "(prefix )(\\d+)( suffix)" }] — replaces
// the built-in rules entirely; the built-ins stay the public framework repo's own claims.
const defaultRules = [
  ["README.md", /(live-)(\d+)(%20apps)/g, N],
  ["README.md", /(farm — )(\d+)( installable apps\])/g, N],
  ["README.md", /(The )(\d+)(-app farm)/g, N],
  ["README.md", /(and all )(\d+)( apps were written)/g, N],
  ["README.md", /(the reference farm: )(\d+)( apps)/g, N],
  ["docs/SHOW_HN.md", /(the proof: )(\d+)( apps live)/g, N],
];
const RULES = await Deno.readTextFile(`${ROOT}/counts.rules.json`)
  .then((s) => JSON.parse(s).map((r) => [r.file, new RegExp(r.pattern, r.flags || "g"), N]))
  .catch(() => defaultRules);

const files = new Map();
const stale = [];
for (const [file, re, want] of RULES) {
  if (!files.has(file)) files.set(file, await Deno.readTextFile(`${ROOT}/${file}`));
  let hits = 0;
  const next = files.get(file).replace(re, (m, a, got, b) => {
    hits++;
    if (Number(got) !== want) stale.push(`${file}: "${a}${got}${b}" → should be ${want}`);
    return `${a}${want}${b}`;
  });
  if (!hits) stale.push(`${file}: pattern ${re.source} matched nothing — the claim was reworded, fix this rule`);
  files.set(file, next);
}

if (check) {
  if (stale.length) {
    console.error(`\n  ✗ app-count claims are stale (farm has ${N} installable apps):\n`);
    for (const s of stale) console.error(`      ${s}`);
    console.error(`\n  fix: deno run -A deploy/counts.mjs\n`);
    Deno.exit(1);
  }
  console.log(`  ✓ app-count claims match the farm (${N} installable apps)`);
} else {
  for (const [file, text] of files) await Deno.writeTextFile(`${ROOT}/${file}`, text);
  console.log(stale.length ? `  ✓ updated ${stale.length} claim(s) → ${N} apps` : `  ✓ already correct (${N} apps)`);
}
