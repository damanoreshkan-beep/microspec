// microspec — the REALM lint. The core executes from three realms (a file checkout, the JSR https cache,
// and — never intentionally — node_modules), and two patterns compile fine yet break the moment the module
// leaves disk. Five publishes in one night died on them, so the rule is a gate, not a review note:
//
//   1. fs THROUGH A RELATIVE import.meta — `readTextFile(new URL("../x", import.meta.url))` reads https
//      in the JSR realm (and the registry strips comments, so even a "working" read lies to a scanner).
//      Package-internal reads go through pkgRoot() (packages/runtime/pkgroot.js).
//   2. a RAW dynamic import in a gate harness — a remote importer may neither import file:// nor use the
//      import map; harness dynamic imports go through dynImport()/__msImport (the consumer shim plants a
//      local importer).
//
//   deno run -A tools/realmlint.mjs
const bad = [];
const scanDirs = ["packages/gates", "packages/gen", "packages/schema", "packages/runtime/tests", "tools", "deploy"];
// art tools run only in a checkout by design; frame is publish-excluded outright
const exempt = (p) => /tools\/art\//.test(p) || /pkgroot\.js$/.test(p) || /realmlint\.mjs$/.test(p);

const walk = function* (dir) {
  let entries = [];
  try { entries = [...Deno.readDirSync(dir)]; } catch { return; }
  for (const e of entries) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory) yield* walk(p);
    else if (/\.(mjs|js)$/.test(e.name)) yield p;
  }
};

for (const dir of scanDirs) {
  for (const p of walk(dir)) {
    if (exempt(p)) continue;
    const src = Deno.readTextFileSync(p);
    src.split("\n").forEach((line, i) => {
      if (/read(?:TextFile|File|Dir)(?:Sync)?\(\s*new URL\(\s*["']\.\.?\//.test(line)) {
        bad.push(`${p}:${i + 1}: fs through a relative import.meta URL — use pkgRoot(): ${line.trim().slice(0, 120)}`);
      }
      if (/^packages\/gates\//.test(p) && /await import\(/.test(line) && !/dynImport|__msImport/.test(line)) {
        bad.push(`${p}:${i + 1}: raw dynamic import in a gate harness — route it through dynImport/__msImport: ${line.trim().slice(0, 120)}`);
      }
    });
  }
}

if (bad.length) {
  console.error("realm lint — patterns that break outside a file checkout:\n");
  for (const b of bad) console.error("  " + b);
  Deno.exit(1);
}
console.log("  ✓ realm-safe: no relative-import.meta fs, no raw harness dynamic imports");
