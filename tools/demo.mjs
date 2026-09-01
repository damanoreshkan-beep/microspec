/* @ts-self-types="./demo.d.mts" */
/**
 * Seeds the framework tree's gate material: the core carries no apps, so the demo app the gates and CI
 * verify is generated on demand (authorless → scaffold → sw → readme) and a tree that already has apps is
 * left untouched. A script with no exports; every gate node can depend on it unconditionally.
 * @module
 */
const has = (p) => { try { Deno.statSync(p); return true; } catch { return false; } };
let present = false;
try {
  for (const e of Deno.readDirSync("apps")) if (e.isDirectory && has(`apps/${e.name}/spec.json`)) { present = true; break; }
} catch {  }
if (present) {
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
