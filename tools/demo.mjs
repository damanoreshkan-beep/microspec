const has = (p) => { try { Deno.statSync(p); return true; } catch { return false; } };
let present = false;
try {
  for (const e of Deno.readDirSync("apps")) if (e.isDirectory && has(`apps/${e.name}/spec.json`)) { present = true; break; }
} catch {  }
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
