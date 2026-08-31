// microspec — the UI kit manifest, GENERATED from packages/runtime/ui.js.
//
//   deno run -A tools/kit-manifest.mjs           # write tools/mcp/kit.json
//   deno run -A tools/kit-manifest.mjs --check   # gate: fail if the committed manifest is stale
//
// Why generate instead of hand-write. An agent authoring an app needs the kit's SIGNATURES (what does
// Segmented take? does Transport need `keep`?) and its DOCTRINE (when Island vs Panel, why a Sheet is not
// history-backed by itself). Both already exist in ui.js — the signature IS the destructuring pattern and
// the doctrine IS the section comment above each node. A second copy of either, written by hand into a doc
// or a prompt, is a copy that drifts silently: nothing fails when the component grows a prop and the doc
// does not. So the manifest is derived, and `--check` in the pre-push gate makes drift a hard failure.
//
// The parser is deliberately loud. It is a small hand-rolled scanner over ONE file we own, not a general
// JS parser, so its failure mode has to be a crash and never a plausible-looking partial result: a silently
// missed prop would produce a manifest that the --check gate then happily blesses forever. Every export
// must come out with a doc, and every function export must come out with a parsed parameter list.
import { pkgRoot } from "../packages/runtime/pkgroot.js";
const R = pkgRoot(import.meta.url, 1);
const SRC_LABEL = "packages/runtime/ui.js"; // what the manifest SAYS — stable across machines and realms
const SRC = new URL(SRC_LABEL, R);           // where it actually reads
const OUT = new URL("tools/mcp/kit.json", R);
const IMPORT = "/_rt/ui.js";

const fail = (msg) => { console.error(`✗ kit-manifest: ${msg}`); Deno.exit(1); };

// ── The scanner ───────────────────────────────────────────────────────────────────────────────────────
// Walks a parameter list from an opening paren to its match, tracking string/template/comment state so a
// comma inside "md" or inside a trailing // comment never splits a parameter.
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

// Split a destructuring body at top-level commas, keeping each entry's trailing // comment with it.
function splitTop(inner) {
  const out = [];
  let depth = 0, start = 0, i = 0;
  // The slice is kept RAW, never trimmed: whether an entry begins with a newline is the only evidence that
  // separates "comment trailing the previous param" from "comment block introducing this one", and trimming
  // it merged the two — the first line of Transport's `actions` block was filed under `className`.
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

// One destructured parameter → { name, default?, note?, prevNote? }.
//
// Comment attribution is the whole difficulty here, and getting it subtly wrong is worse than not doing it:
// splitTop cuts at the comma, so `locale = "en",   // SYS carries the transport strings` puts that comment
// at the HEAD of the next entry. Attaching it there shifted every note in Transport by one prop — a
// manifest that reads perfectly and documents the wrong thing. The rule that separates the two cases is
// physical, not semantic:
//   • a comment on the entry's FIRST line, with no code before it   → it trailed the PREVIOUS param's code
//   • a comment on its own line further down                        → it documents THIS param (Transport's
//                                                                      `actions` block is written this way)
//   • a comment after this entry's own code                         → it trails THIS param
function parseParam(entry) {
  let prevNote = "", note = "";
  let seenCode = false;
  const codeParts = [];
  entry.split("\n").forEach((l, idx) => {
    const c = l.indexOf("//");
    if (c < 0) { if (l.trim()) seenCode = true; codeParts.push(l); return; }
    // A // inside a string is not a comment. The kit has none, but assert rather than assume.
    const before = l.slice(0, c);
    if ((before.match(/"/g) || []).length % 2) { codeParts.push(l); return; }
    const body = l.slice(c + 2).trim();
    const bare = !before.trim();                                // nothing but whitespace before the //
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

// Fold each entry's prevNote back onto the parameter it actually trailed, then drop the carrier entries.
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

// ── Build ─────────────────────────────────────────────────────────────────────────────────────────────
const text = await Deno.readTextFile(SRC);
const lines = text.split("\n");
const lineStart = [];                                          // char offset of each line, for the scanner
{ let off = 0; for (const l of lines) { lineStart.push(off); off += l.length + 1; } }

const EXPORT = /^export\s+(function|const)\s+([A-Za-z_$][\w$]*)/;
const declared = lines.filter((l) => EXPORT.test(l)).length;

const exportsOut = [];
let pending = [];                                              // the most recent contiguous // run
let pendingEnd = -2;                                           // -2, not -1: line 0 must start a fresh run

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  if (/^\s*\/\//.test(line)) {
    if (pendingEnd !== i - 1) pending = [];                    // a new run starts; the old block is spent
    pending.push(line.replace(/^\s*\/\/ ?/, ""));
    pendingEnd = i;
    continue;
  }

  const m = line.match(EXPORT);
  if (!m) continue;
  const name = m[2];

  // The doc block. A section header ("── Island — the floating glass panel ──") is attributed to every
  // export inside that section, which is why SHEET_BOX and Sheet legitimately share one: they ARE one node.
  if (!pending || !pending.length) fail(`${name} (${SRC}:${i + 1}) has no documentation comment above it`);
  if (i - pendingEnd > 25) fail(`${name} (${SRC}:${i + 1}) is too far from its comment block — attribution would be a guess`);
  // Only a real section header ("── Island — the floating glass panel ──") becomes a headline. Row's
  // comment is ordinary prose, and slicing its first line off as a title produced a truncated sentence
  // presented as a summary — so an export without a header simply has no headline, and keeps its whole block.
  const doc = [...pending];
  const isHeader = /^─{2,}/.test(doc[0] || "");
  const headline = isHeader ? doc[0].replace(/^─+\s*/, "").replace(/\s*─+$/, "").trim() : "";
  const body = (isHeader ? doc.slice(1) : doc).join("\n").replace(/^─+$|─+$/gm, "").trim();

  // A string constant export (SHEET_BOX) — a value, not a callable.
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

  // The signature is DERIVED (a re-print of the destructuring pattern), never synthesised. An earlier draft
  // emitted a "usage" line built from the props that lack defaults — which for Transport listed seventeen
  // "required" props, when omitting them is exactly how the component is designed to be used (no onNext →
  // no skip button). A generated example that states a contract the code does not have is worse than none.
  const signature = `${name}({ ${props.map((p) => p.default !== undefined ? `${p.name} = ${p.default}` : p.name).join(", ")} })`;

  exportsOut.push({ name, kind: "component", line: i + 1, headline, doc: body, signature, props });
}

if (exportsOut.length !== declared) fail(`found ${declared} export statements but produced ${exportsOut.length} entries — the scanner dropped one`);

const manifest = {
  "//": `GENERATED by tools/kit-manifest.mjs from ${SRC_LABEL}. Do not edit by hand — run the generator.`,
  source: SRC_LABEL,
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
