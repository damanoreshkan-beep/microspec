/* @ts-self-types="./wat.d.mts" */
/**
 * # wat — assemble every machine's `.wat` into its `.wasm`, and prove the committed binary is the text
 *
 * A machine app (`runtime/machine.js`) ships a binary. The binary is GENERATED from the WAT beside it — the
 * text is what the agent writes and the reviewer reads; the bytes are what the browser runs — and like the
 * service-worker stubs, a committed artifact that can drift from its source is a gate, not a habit. This tool
 * walks every `apps/<id>/<name>.wat` (or the one app named), assembles each with `wabt` (the WebAssembly reference toolkit,
 * running as a package inside Deno — no native toolchain, the same output on every machine) and writes
 * `<name>.wasm` next to it; `--check` compares instead of writing and reds on any difference.
 *
 * ![wat: text in, bytes out, --check as the gate](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/pipeline-wat.svg)
 *
 * ## Usage
 * ```sh
 * deno run -A jsr:@microspec/core/wat                 # every apps/<id>/*.wat → .wasm
 * deno run -A jsr:@microspec/core/wat apps/rozriad    # one app
 * deno run -A jsr:@microspec/core/wat --check         # the 8n8 node: red if any .wasm is stale or missing
 * ```
 *
 * ## Flags
 * | Flag | Effect |
 * |---|---|
 * | `--check` | Assemble in memory and compare with the committed `.wasm`; write nothing; exit 1 on a gap. |
 * | `--apps <dir>` | The apps directory (default `apps` under the cwd). |
 *
 * ## What it exports
 * - {@link assemble} — `(wat: string, name?) → Promise<Uint8Array>`: the assembler as a function, for a test
 *   that builds a fixture machine, or a tool that needs bytes without a file.
 *
 * ## Features enabled
 * `bulk_memory`, `simd`, `sign_extension`, `mutable_globals`, `multi_value`, `nontrapping_float_to_int` —
 * the WebAssembly 2.0 set every current browser and Deno ship. A machine that needs more names it here first.
 *
 * ## Named failures
 * - `wat: <file>:<line>:<col>: error …` — wabt's own message; the file does not assemble, nothing is written.
 * - `wat: stale apps/<id>/<name>.wasm — run: deno run -A .microspec/core.mjs wat` — under `--check`.
 *
 * ## Exit codes
 * 0 assembled / everything matches · 1 a stale or missing binary under `--check`, or an assembly error.
 *
 * ## Where it sits
 * The 8n8 node `wat` (phase gate, scope farm); the product's `deno task wat`. The build copies `.wasm` into
 * `dist/`, `sw` precaches it with the app's shaders.
 *
 * @module
 */
import wabtInit from "wabt";

const FEATURES = { bulk_memory: true, simd: true, sign_extension: true, mutable_globals: true, multi_value: true, sat_float_to_int: true };
let wabt = null;

/**
 * Assemble WAT text into WebAssembly bytes (deterministic: the same text gives the same bytes).
 * @param wat the module in text form
 * @param name a file name for error messages
 * @returns the binary
 */
export async function assemble(wat, name = "module.wat") {
  wabt ??= await wabtInit();
  const mod = wabt.parseWat(name, wat, FEATURES);
  try {
    mod.resolveNames();
    mod.validate(FEATURES);
    return mod.toBinary({ log: false, write_debug_names: false }).buffer;
  } finally { mod.destroy(); }
}

const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

if (import.meta.main) {
  const args = [...Deno.args];
  const check = args.includes("--check");
  const ai = args.indexOf("--apps");
  const APPS = ai >= 0 ? args[ai + 1] : "apps";
  const only = args.filter((a, i) => !a.startsWith("--") && i !== ai + 1).map((a) => a.replace(/\/$/, "").split("/").pop());
  const files = [];
  try {
    for (const d of Deno.readDirSync(APPS)) {
      if (!d.isDirectory || (only.length && !only.includes(d.name))) continue;
      for (const f of Deno.readDirSync(`${APPS}/${d.name}`)) if (f.isFile && f.name.endsWith(".wat")) files.push(`${APPS}/${d.name}/${f.name}`);
    }
  } catch { }
  let bad = 0, written = 0, ok = 0;
  for (const path of files.sort()) {
    const out = path.slice(0, -4) + ".wasm";
    let bytes;
    try { bytes = await assemble(await Deno.readTextFile(path), path); } catch (e) { console.error(`wat: ${String(e?.message ?? e).trim()}`); bad++; continue; }
    let cur = null;
    try { cur = await Deno.readFile(out); } catch { }
    if (cur && same(cur, bytes)) { ok++; continue; }
    if (check) { console.error(`wat: stale ${out} — run: deno run -A .microspec/core.mjs wat`); bad++; continue; }
    await Deno.writeFile(out, bytes); written++;
    console.log(`  ✓ ${out} (${bytes.length} bytes)`);
  }
  console.log(`wat: ${files.length} module(s) — ${written} written, ${ok} unchanged${bad ? `, ${bad} failed` : ""}`);
  if (bad) Deno.exit(1);
}
