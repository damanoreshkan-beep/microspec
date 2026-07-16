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
const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const check = Deno.args.includes("--check");

const catalog = JSON.parse(await Deno.readTextFile(`${ROOT}/apps/home/apps.json`));
const N = Array.isArray(catalog) ? catalog.length : Object.keys(catalog).length;

const readme = await Deno.readTextFile(`${ROOT}/README.md`);
// The "See it live" table names a few apps in full; "…plus N more" is the remainder, so it has to follow N.
const NAMED = (readme.match(/^\| \[\*\*/gm) || []).length;
const REST = N - NAMED;

// Each rule is [regex with the number as group 2, replacement number]. Anchored on surrounding words so a
// count can never be confused with the efficacy scores or any other digit on the page.
const RULES = [
  ["README.md", /(live-)(\d+)(%20apps)/g, N],
  ["README.md", /(\[)(\d+)( installable apps\])/g, N],
  ["README.md", /(The )(\d+)(-app farm)/g, N],
  ["README.md", /(all )(\d+)( apps on every push)/g, N],
  ["README.md", /(the reference farm: )(\d+)( apps)/g, N],
  ["README.md", /(…plus )(\d+)( more)/g, REST],
  ["docs/SHOW_HN.md", /(the proof: )(\d+)( apps live)/g, N],
];

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
    console.error(`\n  ✗ app-count claims are stale (farm has ${N} installable apps, ${NAMED} named + ${REST} more):\n`);
    for (const s of stale) console.error(`      ${s}`);
    console.error(`\n  fix: deno run -A deploy/counts.mjs\n`);
    Deno.exit(1);
  }
  console.log(`  ✓ app-count claims match the farm (${N} installable apps)`);
} else {
  for (const [file, text] of files) await Deno.writeTextFile(`${ROOT}/${file}`, text);
  console.log(stale.length ? `  ✓ updated ${stale.length} claim(s) → ${N} apps (${NAMED} named + ${REST} more)` : `  ✓ already correct (${N} apps)`);
}
