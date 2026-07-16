const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const check = Deno.args.includes("--check");

const catalog = JSON.parse(await Deno.readTextFile(`${ROOT}/apps/home/apps.json`));
const N = Array.isArray(catalog) ? catalog.length : Object.keys(catalog).length;

const readme = await Deno.readTextFile(`${ROOT}/README.md`);
const NAMED = (readme.match(/^\| \[\*\*/gm) || []).length;
const REST = N - NAMED;

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
