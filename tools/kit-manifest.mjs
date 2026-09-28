/* @ts-self-types="./kit-manifest.d.mts" */
/**
 * # kit — the UI kit manifest, derived from ui.js so an agent's view of the kit cannot drift
 *
 * A deliberately loud hand-rolled scanner over packages/runtime/ui.js. For every export it derives the
 * signature (a re-print of the destructuring pattern, never a synthesised example) and the doctrine (the
 * comment block above it; a `──` section header becomes the headline) into tools/mcp/kit.json. An agent
 * authoring an app needs both — what does Segmented take, when Island rather than Panel — and both already
 * exist in ui.js. A second copy written by hand into a doc or a prompt drifts silently: nothing fails when
 * a component grows a prop and the doc does not. So the copy is generated, and `--check` in the pre-push
 * gate makes drift a hard failure. The scanner is not a JS parser; it reads one file the farm owns, and its
 * failure mode is a crash, never a plausible partial manifest that the gate would then bless forever.
 *
 * ![The kit node in the 8n8 pipeline](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/pipeline-kit.svg)
 *
 * ## Usage
 * ```sh
 * deno run -A jsr:@microspec/core/kit            # write tools/mcp/kit.json
 * deno run -A jsr:@microspec/core/kit --check    # gate: fail if the committed manifest is stale
 * ```
 * `deno task kit` writes the manifest; `deno task gates` runs `--check` as the 8n8 node `kit`.
 *
 * ## Flags and arguments
 * | Flag | Effect |
 * | --- | --- |
 * | `--check` | Compare the generated JSON byte-for-byte with the committed tools/mcp/kit.json and write nothing. |
 *
 * Without the flag it writes. Source and output are both resolved off the package root (pkgroot.js), so
 * the same ui.js is read from a checkout and from the JSR cache, and the manifest labels its source as
 * `packages/runtime/ui.js` whichever realm produced it.
 *
 * ## What it checks / produces
 * - Writes tools/mcp/kit.json: a GENERATED banner, `source`, `import` (`/_rt/ui.js`), `count`, and one
 *   entry per export — `component` entries carry `line`, `headline`, `doc`, the derived `signature` and
 *   `props` (name, default, note); a string `constant` (SHEET_BOX) carries its `value`.
 * - Comment attribution is physical, not semantic: a comment on an entry's first line trailed the previous
 *   prop; one on its own line further down documents this prop; one after the code trails this prop.
 * - Every failure is named and prefixed `kit-manifest:`: an export with no documentation comment above it;
 *   an export more than 25 lines from its comment block (attribution would be a guess); an export that is
 *   neither a string constant nor callable; a callable that does not take one destructured props object;
 *   an export that parsed to zero props (the scanner is wrong, not the component); an unparsable parameter;
 *   an orphaned or unattached comment; an unterminated parameter list; and a final count check — N export
 *   statements but fewer entries means the scanner dropped one.
 * - `--check` reds when the manifest is missing (it names the generator to run) or stale, and says how:
 *   the exports added, the exports removed, or "a signature or doc changed" when the export set is equal.
 * - Green: `--check` reports that the manifest matches ui.js with its export count; a write lists the
 *   export names it emitted.
 *
 * ## Exit codes
 * - 0 — the manifest was written, or `--check` found it identical to the generated JSON.
 * - 1 — any scanner failure above (both modes), or a missing or stale manifest under `--check`.
 *
 * ## Where it sits
 * gate · script (frozen 2026-07-02) · needs: scaffold · needed by: no node lists it; the `gates` flow
 * targets it directly, and verify.yml runs the same `--check` as its own step ("agents read the manifest,
 * so a stale one is a wrong signature").
 *
 * ## Why
 * The kit manifest matches what the runtime actually exports. Touching the kit without `deno task kit`
 * leaves every agent reading a signature that no longer exists — the same shape as the `sw` gate, one
 * level up.
 * @module
 */
import { pkgRoot } from "../packages/runtime/pkgroot.js";
const R = pkgRoot(import.meta.url, 1);
const SRC_LABEL = "packages/runtime/ui.js";
const SRC = new URL(SRC_LABEL, R);
const OUT = new URL("tools/mcp/kit.json", R);
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
