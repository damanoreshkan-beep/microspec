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
if (present) { console.log("demo: tree already has apps — nothing to seed"); Deno.exit(0); }

const run = async (...args) => {
  const { code } = await new Deno.Command("deno", { args: ["run", "-A", ...args], stdout: "inherit", stderr: "inherit" }).output();
  if (code) Deno.exit(code);
};
await run("packages/gen/authorless.mjs", "recipes/books.json");
await run("packages/gen/scaffold.mjs", "apps/books");
await run("deploy/sw.mjs");
await run("deploy/readme.mjs");
console.log("demo: generated apps/books (authorless → scaffold → sw → readme)");
