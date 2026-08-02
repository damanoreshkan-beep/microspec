const SRC = "packages/runtime/ui.js";
const OUT = "tools/mcp/kit.json";
const IMPORT = "/_rt/ui.js";

const fail = (msg) => { console.error(`✗ kit-manifest: ${msg}`); Deno.exit(1); };

function readParens(text, open) {
  let depth = 0, i = open;
  while (i < text.length) {
    const c = text[i], next = text[i + 1];
    if (c === "/" && next === "/") { while (i < text.length && text[i] !== "\n") i++; continue; }
    if (c === "/" && next === "*") { i = text.indexOf("*/", i + 2); if (i < 0) fail("unterminated block comment"); i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c; i++;
      while (i < text.length && text[i] !== quote) { if (text[i] === "\\") i++; i++; }
      i++; continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") { depth--; if (depth === 0) return { inner: text.slice(open + 1, i), end: i }; }
    i++;
  }
  fail("unterminated parameter list");
}

function splitTop(inner) {
  const out = [];
  let depth = 0, start = 0, i = 0;
  const push = (end) => { const s = inner.slice(start, end); if (s.trim()) out.push(s); };
  while (i < inner.length) {
    const c = inner[i], next = inner[i + 1];
    if (c === "/" && next === "/") { while (i < inner.length && inner[i] !== "\n") i++; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c; i++;
      while (i < inner.length && inner[i] !== quote) { if (inner[i] === "\\") i++; i++; }
      i++; continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) { push(i); start = i + 1; }
    i++;
  }
  push(inner.length);
  return out;
}

function parseParam(entry) {
  let prevNote = "", note = "";
  let seenCode = false;
  const codeParts = [];
  entry.split("\n").forEach((l, idx) => {
    const c = l.indexOf("//");
    if (c < 0) { if (l.trim()) seenCode = true; codeParts.push(l); return; }
    const before = l.slice(0, c);
    if ((before.match(/"/g) || []).length % 2) { codeParts.push(l); return; }
    const body = l.slice(c + 2).trim();
    const bare = !before.trim();                                
    if (bare && !seenCode && idx === 0) prevNote = `${prevNote} ${body}`.trim();
    else note = `${note} ${body}`.trim();
    if (before.trim()) seenCode = true;
    codeParts.push(before);
  });
  const code = codeParts.join(" ").replace(/\s+/g, " ").trim();
  const notes = { note: note || undefined, prevNote: prevNote || undefined };
  if (!code) return notes.note || notes.prevNote ? { name: null, ...notes } : null;
  if (code.startsWith("...")) return { name: code, ...notes };
  const eq = code.indexOf("=");
  const name = (eq < 0 ? code : code.slice(0, eq)).trim();
  const def = eq < 0 ? undefined : code.slice(eq + 1).trim();
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) fail(`unparsable parameter: ${JSON.stringify(code)}`);
  return { name, default: def, ...notes };
}

function attachNotes(entries) {
  const out = [];
  for (const e of entries) {
    if (e.prevNote) {
      const prev = out[out.length - 1];
      if (!prev) fail(`a trailing comment has no parameter to attach to: ${JSON.stringify(e.prevNote)}`);
      prev.note = `${prev.note ? prev.note + " " : ""}${e.prevNote}`;
    }
    delete e.prevNote;
    if (e.name === null) { if (e.note) fail(`orphaned comment with no parameter: ${JSON.stringify(e.note)}`); continue; }
    if (e.note === undefined) delete e.note;
    if (e.default === undefined) delete e.default;
    out.push(e);
  }
  return out;
}

const text = await Deno.readTextFile(SRC);
const lines = text.split("\n");
const lineStart = [];                                          
{ let off = 0; for (const l of lines) { lineStart.push(off); off += l.length + 1; } }

const EXPORT = /^export\s+(function|const)\s+([A-Za-z_$][\w$]*)/;
const declared = lines.filter((l) => EXPORT.test(l)).length;

const exportsOut = [];
let pending = [];                                              
let pendingEnd = -2;                                           

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  if (/^\s*\/\//.test(line)) {
    if (pendingEnd !== i - 1) pending = [];                    
    pending.push(line.replace(/^\s*\/\/ ?/, ""));
    pendingEnd = i;
    continue;
  }

  const m = line.match(EXPORT);
  if (!m) continue;
  const name = m[2];

  if (!pending || !pending.length) fail(`${name} (${SRC}:${i + 1}) has no documentation comment above it`);
  if (i - pendingEnd > 25) fail(`${name} (${SRC}:${i + 1}) is too far from its comment block — attribution would be a guess`);
  const doc = [...pending];
  const isHeader = /^─{2,}/.test(doc[0] || "");
  const headline = isHeader ? doc[0].replace(/^─+\s*/, "").replace(/\s*─+$/, "").trim() : "";
  const body = (isHeader ? doc.slice(1) : doc).join("\n").replace(/^─+$|─+$/gm, "").trim();

  const constVal = line.match(/^export const [A-Za-z_$][\w$]*\s*=\s*(".*")\s*;?\s*$/);
  if (constVal) {
    exportsOut.push({ name, kind: "constant", line: i + 1, headline, doc: body, value: JSON.parse(constVal[1]) });
    continue;
  }

  const open = text.indexOf("(", lineStart[i]);
  if (open < 0) fail(`${name} (${SRC}:${i + 1}) is neither a string constant nor callable — the parser has no rule for it`);
  const { inner } = readParens(text, open);
  const trimmed = inner.trim();
  if (!trimmed.startsWith("{")) fail(`${name} (${SRC}:${i + 1}) does not take a destructured props object — the kit's contract is one props object per node`);

  const props = attachNotes(splitTop(trimmed.slice(1, trimmed.lastIndexOf("}"))).map(parseParam).filter(Boolean));
  if (!props.length) fail(`${name} (${SRC}:${i + 1}) parsed to zero props — the scanner is wrong, not the component`);

  const signature = `${name}({ ${props.map((p) => p.default !== undefined ? `${p.name} = ${p.default}` : p.name).join(", ")} })`;

  exportsOut.push({ name, kind: "component", line: i + 1, headline, doc: body, signature, props });
}

if (exportsOut.length !== declared) fail(`found ${declared} export statements but produced ${exportsOut.length} entries — the scanner dropped one`);

const manifest = {
  "//": `GENERATED by tools/kit-manifest.mjs from ${SRC}. Do not edit by hand — run the generator.`,
  source: SRC,
  import: IMPORT,
  count: exportsOut.length,
  exports: exportsOut,
};
const json = JSON.stringify(manifest, null, 2) + "\n";

if (Deno.args.includes("--check")) {
  let current = "";
  try { current = await Deno.readTextFile(OUT); } catch { fail(`${OUT} is missing — run: deno run -A tools/kit-manifest.mjs`); }
  if (current !== json) {
    const a = JSON.parse(current), b = manifest;
    const names = (m) => new Set((m.exports || []).map((e) => e.name));
    const added = [...names(b)].filter((n) => !names(a).has(n));
    const gone = [...names(a)].filter((n) => !names(b).has(n));
    console.error(`✗ ${OUT} is stale against ${SRC}`);
    if (added.length) console.error(`  exports added:   ${added.join(", ")}`);
    if (gone.length) console.error(`  exports removed: ${gone.join(", ")}`);
    if (!added.length && !gone.length) console.error(`  a signature or doc changed (same ${b.count} exports)`);
    console.error(`  fix: deno run -A tools/kit-manifest.mjs`);
    Deno.exit(1);
  }
  console.log(`✓ ${OUT} matches ${SRC} (${manifest.count} exports)`);
  Deno.exit(0);
}

await Deno.mkdir("tools/mcp", { recursive: true });
await Deno.writeTextFile(OUT, json);
console.log(`✓ ${OUT} — ${manifest.count} exports: ${exportsOut.map((e) => e.name).join(", ")}`);
