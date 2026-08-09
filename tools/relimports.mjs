
const bad = [];
for await (const f of Deno.readDir("packages/runtime")) {
  if (!f.isFile || !f.name.endsWith(".js") || f.name.endsWith("_test.js")) continue;
  const src = await Deno.readTextFile(`packages/runtime/${f.name}`);
  src.split("\n").forEach((line, i) => {
    if (/from\s+["']\/_rt\//.test(line)) bad.push(`packages/runtime/${f.name}:${i + 1}: ${line.trim()}`);
  });
}

if (bad.length) {
  console.error(`runtime modules must use relative imports (./x.js), not /_rt/ — absolute 404s under /microspec/\n`);
  for (const b of bad) console.error("  " + b);
  Deno.exit(1);
}
console.log(`  ✓ runtime imports are relative (${"packages/runtime"} scanned)`);
