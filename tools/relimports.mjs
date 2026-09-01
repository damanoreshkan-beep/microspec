/* @ts-self-types="./relimports.d.mts" */
/**
 * Pre-push rule: runtime modules (packages/runtime and the consumer's rt/ overlay) must import each other
 * relatively, never via an absolute "/_rt/…" — that resolves to the domain root and 404s under the
 * GitHub Pages subpath while working locally. Scans the files and exits 1 on a violation. A CLI script — it
 * exports nothing.
 * @module
 */

const bad = [];
const dirs = [];
try { Deno.statSync("packages/runtime/index.js"); dirs.push("packages/runtime"); } catch {  }
try { if (Deno.statSync("rt").isDirectory) dirs.push("rt"); } catch {  }
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
