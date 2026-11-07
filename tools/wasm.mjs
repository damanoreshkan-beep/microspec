/* @ts-self-types="./wasm.d.mts" */
/**
 * # wasm — prove every machine binary in the tree is valid, speaks the ABI and runs
 *
 * A machine app (`runtime/machine.js`) ships a `.wasm` and nothing else:
 * the binary is written as BYTES by the agent, with no source a person reads beside it ("щоб ти прям писав
 * бінарний код … без коду який я розумію"). A binary with no text to compare against needs its own proof, and
 * this is it: for every `apps/<id>/<name>.wasm` the module must validate, instantiate with no imports, export
 * the ABI (`runtime/machine.js` `loadMachine` is the judge — the same check the browser makes), answer
 * `abi() = 1`, accept `init(8, 8, 1)`, keep its out/HUD/byte-region pointers inside its memory, and survive
 * a short run: `touch` down · four `step`s · `touch` up · `set(0, 1)` · four more steps, every `step`
 * answering 0 or 1. A trap, a refused init, a pointer past memory or a missing export is red, with the file
 * and the reason. Nothing is written.
 *
 * ![wasm: bytes in, a run on the ABI, red on the first trap](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/pipeline-wasm.svg)
 *
 * ## Usage
 * ```sh
 * deno run -A jsr:@microspec/core/wasm                 # every apps/<id>/*.wasm
 * deno run -A jsr:@microspec/core/wasm apps/rozriad    # one app
 * ```
 *
 * ## Flags
 * | Flag | Effect |
 * |---|---|
 * | `--apps <dir>` | The apps directory (default `apps` under the cwd). |
 *
 * ## What it exports
 * - {@link proveMachine} — `(bytes) → Promise<string[]>`: the problems found with one binary (empty = sound), for a
 *   test or a tool that holds bytes without a file.
 *
 * ## Named failures
 * - `wasm: apps/<id>/<name>.wasm — <reason>` — one line per problem; the exit code says the rest.
 *
 * ## Exit codes
 * 0 every binary sound · 1 at least one problem.
 *
 * ## Where it sits
 * The 8n8 node `wasm` (phase gate, scope farm) next to `wat` (which only has work when a `.wat` is committed);
 * the product's `deno task wasm`.
 *
 * @module
 */
import { ABI, loadMachine } from "../packages/runtime/machine.js";

/**
 * Run the ABI proof over one machine binary.
 * @param bytes the `.wasm`
 * @returns the problems found, empty when the binary is sound
 */
export async function proveMachine(bytes) {
  const out = [];
  if (!WebAssembly.validate(bytes)) return ["does not validate as WebAssembly"];
  let api;
  try { api = await loadMachine(bytes, { w: 8, h: 8, seed: 1 }); } catch (e) { return [String(e?.message ?? e)]; }
  const x = api.exports, size = api.memory.buffer.byteLength;
  const inside = (name, ptr, len) => { if (!(ptr >= 0 && ptr + len <= size)) out.push(`${name} ${ptr}+${len} is outside the ${size}-byte memory`); };
  inside("out block", x.out_ptr() >>> 0, 48 * 4);
  inside("hud block", x.hud_ptr() >>> 0, 16 * 4);
  inside("byte region", x.buf_ptr() >>> 0, (x.buf_w() | 0) * (x.buf_h() | 0) * (x.buf_ch() === 4 ? 4 : 1));
  if (x.abi() !== ABI) out.push(`abi() answers ${x.abi()}, the host speaks ${ABI}`);
  if (!([1, 4].includes(x.buf_ch() | 0))) out.push(`buf_ch() must be 1 or 4, is ${x.buf_ch()}`);
  const step = (t) => { const d = x.step(16, t) | 0; if (d !== 0 && d !== 1) out.push(`step answered ${d}, not 0 or 1`); };
  try {
    x.touch(1, 0, 0.5, 0.5);
    for (let i = 0; i < 4; i++) step(16 * (i + 1));
    x.touch(1, 2, 0.6, 0.4);
    x.set(0, 1);
    for (let i = 4; i < 8; i++) step(16 * (i + 1));
    x.touch(2, 3, 0, 0);
  } catch (e) { out.push(`trapped during the run: ${String(e?.message ?? e)}`); }
  return out;
}

if (import.meta.main) {
  const args = [...Deno.args];
  const ai = args.indexOf("--apps");
  const APPS = ai >= 0 ? args[ai + 1] : "apps";
  const only = args.filter((a, i) => !a.startsWith("--") && i !== ai + 1).map((a) => a.replace(/\/$/, "").split("/").pop());
  const files = [];
  try {
    for (const d of Deno.readDirSync(APPS)) {
      if (!d.isDirectory || (only.length && !only.includes(d.name))) continue;
      for (const f of Deno.readDirSync(`${APPS}/${d.name}`)) if (f.isFile && f.name.endsWith(".wasm")) files.push(`${APPS}/${d.name}/${f.name}`);
    }
  } catch { }
  let bad = 0;
  for (const path of files.sort()) {
    const problems = await proveMachine(await Deno.readFile(path));
    for (const p of problems) console.error(`wasm: ${path} — ${p}`);
    if (problems.length) bad++; else console.log(`  ✓ ${path}`);
  }
  console.log(`wasm: ${files.length} machine(s)${bad ? `, ${bad} unsound` : " sound"}`);
  if (bad) Deno.exit(1);
}
