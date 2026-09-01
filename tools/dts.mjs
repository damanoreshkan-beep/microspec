// microspec — the package's type declarations, GENERATED. JSR cannot type a JavaScript entrypoint: every
// .js/.mjs export is a "slow type" until the file names a .d.ts through `/* @ts-self-types="…" */`, and
// only then does the registry show its docs and score its API (jsr.io/docs/about-slow-types). Writing 90
// declaration files by hand is a maintenance debt the next refactor defaults on, so they are emitted from
// the JavaScript itself — tsc's declaration emit reads the code AND its JSDoc — and the gate keeps them
// honest: a stale .d.ts is a red node, like a stale service-worker manifest.
//   deno run -A tools/dts.mjs            # (re)write <entry>.d.ts / <entry>.d.mts next to each entrypoint
//   deno run -A tools/dts.mjs --check    # fail if any is missing or stale
// Runs only in the core's own tree (deno.json name @microspec/core); a consumer tree has no entrypoints to
// type and the node is a no-op there, like rtmap in the framework.
const check = Deno.args.includes("--check");

const manifest = JSON.parse(await Deno.readTextFile("deno.json"));
if (manifest.name !== "@microspec/core") {
  if (check) console.log("  ✓ not the core — no declarations to generate");
  Deno.exit(0);
}
const entries = [...new Set(Object.values(manifest.exports))].map((p) => p.slice(2)).sort();

// The compiler arrives from npm, imported only past the guard above: a consumer never pays for it.
const ts = (await import("npm:typescript@5.6.3")).default;
const root = Deno.cwd();
const outFor = (src) => src.endsWith(".mjs") ? src.slice(0, -4) + ".d.mts" : src.slice(0, -3) + ".d.ts";

const emitted = {};
const host = ts.createCompilerHost({});
host.writeFile = (name, text) => { emitted[name] = text; };
const program = ts.createProgram(entries.map((e) => `${root}/${e}`), {
  allowJs: true, declaration: true, emitDeclarationOnly: true, skipLibCheck: true, noResolve: true,
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  // ES only, NO lib.dom: with the DOM lib in, tsc infers browser names (PermissionState, CSSStyleDeclaration)
  // into the declarations, and Deno's checker — which reads them through @ts-self-types — has no such
  // names in its default lib, so the unit gate went red on four of them. Without it, DOM values are `any`.
  lib: ["lib.es2022.d.ts"],
  rootDir: root, outDir: `${root}/.dts-out`,
}, host);
const result = program.emit();
if (result.emitSkipped) { console.error("dts: tsc skipped the emit"); Deno.exit(1); }

// tsc's declaration emit for a JavaScript binding pattern is self-contradictory: `({ a, b = 1 } = {})`
// becomes `({ a, b }?: { b?: number })` — every name WITHOUT an initializer is missing from the type it
// is destructured from, and Deno's checker rejects the file (TS2339) the moment anything imports it
// through @ts-self-types. Six exports hit it on the first run. The fix is mechanical, so it lives here:
// every binding element the type literal does not name is added as `name?: any`.
const f = ts.factory;
const completeBindings = (text, fileName) => {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const memberName = (m) => m.name && ts.isIdentifier(m.name) ? m.name.text : m.name?.text;
  const visit = (node, ctx) => {
    if (ts.isParameter(node) && ts.isObjectBindingPattern(node.name) && node.type && ts.isTypeLiteralNode(node.type)) {
      const have = new Set(node.type.members.map(memberName));
      const missing = node.name.elements
        .map((e) => e.propertyName ?? e.name).filter((n) => ts.isIdentifier(n) && !have.has(n.text))
        .map((n) => f.createPropertySignature(undefined, n.text, f.createToken(ts.SyntaxKind.QuestionToken), f.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)));
      if (missing.length) {
        node = f.updateParameterDeclaration(node, node.modifiers, node.dotDotDotToken, node.name, node.questionToken,
          f.updateTypeLiteralNode(node.type, f.createNodeArray([...node.type.members, ...missing])), node.initializer);
      }
    }
    return ts.visitEachChild(node, (n) => visit(n, ctx), ctx);
  };
  const out = ts.transform(sf, [(ctx) => (root) => visit(root, ctx)]);
  const printed = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(out.transformed[0]);
  out.dispose();
  return printed;
};

// The module doc is the ONE thing declaration emit drops: a /** … @module */ block belongs to the file, not
// to a declaration, so tsc does not carry it. It is copied in front of the declarations, where JSR reads it.
const moduleDoc = (src) => /^(?:#!.*\n)?\s*(?:\/\*[^*][\s\S]*?\*\/\s*)?(\/\*\*[\s\S]*?@module[\s\S]*?\*\/)/.exec(src)?.[1] ?? null;

let stale = 0, written = 0;
for (const entry of entries) {
  const src = await Deno.readTextFile(`${root}/${entry}`);
  const key = `${root}/.dts-out/${outFor(entry)}`;
  let body = emitted[key];
  if (body == null) { console.error(`  ✗ ${entry}: tsc emitted no declaration`); stale++; continue; }
  // tsc carries a CLI script's shebang into its declaration; behind the module doc it is no longer line 1
  // and Deno refuses the file ("Expected ident"). A declaration has nothing to execute — drop it.
  if (body.startsWith("#!")) body = body.slice(body.indexOf("\n") + 1);
  body = completeBindings(body, outFor(entry));
  const doc = moduleDoc(src);
  const text = `${doc ? doc + "\n" : ""}// GENERATED by tools/dts.mjs from ${entry} — edit the JSDoc there, never this file.\n${body}`;
  const out = `${root}/${outFor(entry)}`;
  let current = null;
  try { current = await Deno.readTextFile(out); } catch { /* missing */ }
  if (current === text) continue;
  if (check) { console.error(`  ✗ ${outFor(entry)} is ${current == null ? "missing" : "stale"} — run \`deno task dts\``); stale++; continue; }
  await Deno.writeTextFile(out, text);
  written++;
}
if (check) {
  if (stale) Deno.exit(1);
  // Fresh is not enough: `deno publish` type-checks the whole package through these files, and `deno test`
  // only checks the modules a test happens to import — six broken declarations reached the publish dry-run
  // with every gate green. So the gate checks what the registry will check.
  const out = await new Deno.Command("deno", { args: ["check", ...entries.map((e) => `${root}/${e}`)], stdout: "inherit", stderr: "inherit" }).output();
  if (!out.success) { console.error("  ✗ the declarations do not type-check — fix the JSDoc they were emitted from"); Deno.exit(1); }
  console.log(`  ✓ ${entries.length} declaration files current and type-checked`);
} else {
  console.log(`dts: ${entries.length} entrypoints, ${written} written`);
}
