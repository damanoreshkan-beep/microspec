// Runtime modules must import each OTHER relatively.
//
// The farm is served from https://…github.io/microspec/, a SUBPATH. An absolute "/_rt/x.js" resolves to
// the domain root and 404s there, while working perfectly on a local server rooted at "/" — which is why
// this can only be caught by a rule, never by opening the page here.
//
// Apps are the opposite: they legitimately import "/_rt/…" and the build rewrites those to "../_rt/…".
// The rule therefore applies to packages/runtime/*.js ONLY, and *_test.js is exempt because fixtures
// embed such strings as data.
//
// This lived only in verify.yml, so a violation cost a full CI round to discover — packages/runtime/hero.js
// shipped with one. Same checks, run before the push.
//   deno run -A tools/relimports.mjs

const bad = [];
// the product's rt/ modules serve from the same /_rt/ URL space, so the same rule holds there (symlinked
// core files report !isFile and skip — they are scanned at home in packages/runtime)
const dirs = ["packages/runtime"];
try { Deno.statSync("rt/index.js"); dirs.push("rt"); } catch { /* the framework tree has no rt/ */ }
for (const dir of dirs) {
  for await (const f of Deno.readDir(dir)) {
    if (!f.isFile || !f.name.endsWith(".js") || f.name.endsWith("_test.js")) continue;
    const src = await Deno.readTextFile(`${dir}/${f.name}`);
    src.split("\n").forEach((line, i) => {
      if (/from\s+["']\/_rt\//.test(line)) bad.push(`${dir}/${f.name}:${i + 1}: ${line.trim()}`);
    });
  }
}

if (bad.length) {
  console.error(`runtime modules must use relative imports (./x.js), not /_rt/ — absolute 404s under /microspec/\n`);
  for (const b of bad) console.error("  " + b);
  Deno.exit(1);
}
console.log(`  ✓ runtime imports are relative (${dirs.join(" + ")} scanned)`);
