const check = Deno.args.includes("--check");

const manifest = JSON.parse(await Deno.readTextFile("deno.json"));
if (manifest.name !== "@microspec/core") {
  if (check) console.log("  ✓ not the core — no declarations to generate");
  Deno.exit(0);
}
const entries = [...new Set(Object.values(manifest.exports))].map((p) => p.slice(2)).sort();

const ts = (await import("npm:typescript@5.6.3")).default;
const root = Deno.cwd();
const outFor = (src) => src.endsWith(".mjs") ? src.slice(0, -4) + ".d.mts" : src.slice(0, -3) + ".d.ts";

const emitted = {};
const host = ts.createCompilerHost({});
host.writeFile = (name, text) => { emitted[name] = text; };
const program = ts.createProgram(entries.map((e) => `${root}/${e}`), {
  allowJs: true, declaration: true, emitDeclarationOnly: true, skipLibCheck: true, noResolve: true,
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  lib: ["lib.es2022.d.ts"],
  rootDir: root, outDir: `${root}/.dts-out`,
}, host);
const result = program.emit();
if (result.emitSkipped) { console.error("dts: tsc skipped the emit"); Deno.exit(1); }

const f = ts.factory;
const K = ts.SyntaxKind;
const anyType = () => f.createKeywordTypeNode(K.AnyKeyword);
const hasExport = (n) => !!n.modifiers?.some((m) => m.kind === K.ExportKeyword);

const attachDoc = (node, jsdoc) => {
  if (!jsdoc) return node;
  return ts.addSyntheticLeadingComment(node, K.MultiLineCommentTrivia, jsdoc.slice(2, -2), true);
};
const leadingJsDoc = (text, node) => {
  const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];
  for (let i = ranges.length - 1; i >= 0; i--) {
    const c = text.slice(ranges[i].pos, ranges[i].end);
    if (c.startsWith("/**")) return c;
  }
  return null;
};
const sourceDoc = (src, name) => new RegExp(`(\\/\\*\\*(?:(?!\\*\\/)[\\s\\S])*\\*\\/)\\s*\\n\\s*export\\s+(?:async\\s+)?(?:function\\*?|const|let|var|class)\\s+${name}\\b`).exec(src)?.[1] ?? null;
const declName = (s) => ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s) ? s.name?.text
  : ts.isVariableStatement(s) && ts.isIdentifier(s.declarationList.declarations[0]?.name) ? s.declarationList.declarations[0].name.text : null;

const namespaceToLiteral = (text, block) => {
  const locals = new Map();     
  const exported = new Map();   
  for (const s of block.statements) {
    if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations) if (ts.isIdentifier(d.name)) {
        locals.set(d.name.text, { type: d.type ?? anyType(), doc: leadingJsDoc(text, s) });
        if (hasExport(s)) exported.set(d.name.text, d.name.text);
      }
    } else if (ts.isFunctionDeclaration(s) && s.name) {
      locals.set(s.name.text, { fn: s, doc: leadingJsDoc(text, s) });
      if (hasExport(s)) exported.set(s.name.text, s.name.text);
    } else if (ts.isModuleDeclaration(s) && s.body && ts.isModuleBlock(s.body)) {
      locals.set(s.name.text, { type: namespaceToLiteral(text, s.body), doc: leadingJsDoc(text, s) });
      if (hasExport(s)) exported.set(s.name.text, s.name.text);
    } else if (ts.isExportDeclaration(s) && s.exportClause && ts.isNamedExports(s.exportClause)) {
      for (const el of s.exportClause.elements) exported.set(el.name.text, (el.propertyName ?? el.name).text);
    }
  }
  const members = [];
  for (const [name, local] of exported) {
    const l = locals.get(local);
    if (!l) continue;
    const m = l.fn
      ? f.createMethodSignature(undefined, name, undefined, l.fn.typeParameters, l.fn.parameters, l.fn.type ?? anyType())
      : f.createPropertySignature(undefined, name, undefined, l.type);
    members.push(attachDoc(m, l.doc));
  }
  return f.createTypeLiteralNode(members);
};

const rewrite = (text, fileName, src) => {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const memberName = (m) => m.name && ts.isIdentifier(m.name) ? m.name.text : m.name?.text;
  const visit = (node, ctx) => {
    if (ts.isModuleDeclaration(node) && hasExport(node) && node.body && ts.isModuleBlock(node.body) && ts.isIdentifier(node.name)) {
      const decl = f.createVariableStatement([f.createToken(K.ExportKeyword)],
        f.createVariableDeclarationList([f.createVariableDeclaration(node.name.text, undefined, namespaceToLiteral(text, node.body))], ts.NodeFlags.Const));
      return attachDoc(decl, sourceDoc(src, node.name.text));
    }
    if (node.parent && ts.isSourceFile(node.parent) && hasExport(node) && declName(node) && !leadingJsDoc(text, node)) {
      const doc = sourceDoc(src, declName(node));
      if (doc) return attachDoc(ts.visitEachChild(node, (n) => visit(n, ctx), ctx), doc);
    }
    if (ts.isParameter(node) && ts.isObjectBindingPattern(node.name) && node.type && ts.isTypeLiteralNode(node.type)) {
      const have = new Set(node.type.members.map(memberName));
      const missing = node.name.elements
        .map((e) => e.propertyName ?? e.name).filter((n) => ts.isIdentifier(n) && !have.has(n.text))
        .map((n) => f.createPropertySignature(undefined, n.text, f.createToken(K.QuestionToken), anyType()));
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

const moduleDoc = (src) => /^(?:#!.*\n)?\s*(?:\/\*[^*][\s\S]*?\*\/\s*)?(\/\*\*[\s\S]*?@module[\s\S]*?\*\/)/.exec(src)?.[1] ?? null;

let stale = 0, written = 0;
for (const entry of entries) {
  const src = await Deno.readTextFile(`${root}/${entry}`);
  const key = `${root}/.dts-out/${outFor(entry)}`;
  let body = emitted[key];
  if (body == null) { console.error(`  ✗ ${entry}: tsc emitted no declaration`); stale++; continue; }
  if (body.startsWith("#!")) body = body.slice(body.indexOf("\n") + 1);
  const isModule = /^\s*export\b/m.test(body);
  body = isModule ? rewrite(body, outFor(entry), src) : "export {};\n";
  const doc = moduleDoc(src);
  const text = `${doc ? doc + "\n" : ""}// GENERATED by tools/dts.mjs from ${entry} — edit the JSDoc there, never this file.\n${body}`;
  const out = `${root}/${outFor(entry)}`;
  let current = null;
  try { current = await Deno.readTextFile(out); } catch {  }
  if (current === text) continue;
  if (check) { console.error(`  ✗ ${outFor(entry)} is ${current == null ? "missing" : "stale"} — run \`deno task dts\``); stale++; continue; }
  await Deno.writeTextFile(out, text);
  written++;
}
if (check) {
  if (stale) Deno.exit(1);
  const out = await new Deno.Command("deno", { args: ["check", ...entries.map((e) => `${root}/${e}`)], stdout: "inherit", stderr: "inherit" }).output();
  if (!out.success) { console.error("  ✗ the declarations do not type-check — fix the JSDoc they were emitted from"); Deno.exit(1); }
  // @ts-self-types; a namespace's members are symbols too). The score read 67% while every export in
  const doc = await new Deno.Command("deno", { args: ["doc", "--json", ...entries.map((e) => `${root}/${e}`)], stdout: "piped", stderr: "piped" }).output();
  if (!doc.success) { console.error(`  ✗ deno doc failed: ${new TextDecoder().decode(doc.stderr).split("\n")[0]}`); Deno.exit(1); }
  const own = new Set(entries.flatMap((e) => [`file://${root}/${e}`, `file://${root}/${outFor(e)}`]));
  const gaps = [];
  let total = 0;
  const walk = (symbols, file, prefix) => {
    for (const s of symbols) {
      total++;
      if (!s.declarations.some((d) => d.jsDoc && (d.jsDoc.doc || d.jsDoc.tags?.length))) gaps.push(`${file}: ${prefix}${s.name}`);
      for (const d of s.declarations) if (d.kind === "namespace" && d.def?.elements) walk(d.def.elements, file, `${prefix}${s.name}.`);
    }
  };
  for (const [file, m] of Object.entries(JSON.parse(new TextDecoder().decode(doc.stdout)).nodes)) {
    if (own.has(file)) walk(m.symbols ?? [], file.slice(`file://${root}/`.length), "");
  }
  if (gaps.length) { console.error(`  ✗ ${gaps.length} exported symbol(s) without a JSDoc:\n    ${gaps.join("\n    ")}`); Deno.exit(1); }
  console.log(`  ✓ ${entries.length} declaration files current, type-checked, ${total}/${total} symbols documented`);
} else {
  console.log(`dts: ${entries.length} entrypoints, ${written} written`);
}
