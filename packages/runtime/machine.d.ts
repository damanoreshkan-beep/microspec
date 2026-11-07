/**
 * # runtime/machine.js — a WebAssembly binary as the whole of an app, under a GPU stage
 *
 * "від js лише тонка прослойка, вся складність на рівні бінарніка" — the logic of
 * an app is a binary the agent writes in WAT, the pixels are a fragment shader, and JavaScript is the glue that
 * neither of them can be. This module IS that glue, once, for every such app: it fetches the app's `.wasm`,
 * checks it against ONE ABI, keeps it stepping at the display's rate, routes every touch into its linear
 * memory, hands its output block to {@link GlStage} as the uniform channels, and shows a region of its memory
 * to the shader as raw bytes. An app made this way is `spec.json` + `<id>.wat` + `<id>.frag` + i18n, and a
 * view of a few lines that formats what the machine reports.
 *
 * ![The machine: wasm memory → out block as uniforms, a byte region as the buf texture, touches in, HUD words out](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-machine.svg)
 *
 * ## Import
 * ```js
 * import { MachineStage, ABI } from "/_rt/machine.js";                    // an app's page
 * import { loadMachine, ABI } from "@microspec/core/runtime/machine.js";  // a Deno test or a product rt/ module
 * ```
 *
 * ## The ABI (version 1) — what a machine's `.wat` exports
 * | export | signature | meaning |
 * |---|---|---|
 * | `memory` | Memory | every byte of state lives here; the host never allocates for the machine |
 * | `abi` | `() → i32` | must answer {@link ABI} (1); anything else is refused before `init` |
 * | `init` | `(w: i32, h: i32, seed: i32) → i32` | the grid the shader will show, in CELLS; 1 = ready, 0 = refused |
 * | `step` | `(dt_ms: f32, t_ms: f32) → i32` | advance by `dt`; 1 = the byte region changed (re-upload), 0 = not |
 * | `touch` | `(id: i32, phase: i32, x: f32, y: f32)` | a pointer: phase 0 down · 1 move · 2 up · 3 cancel; x, y in VIEWPORT fractions |
 * | `set` | `(i: i32, v: f32)` | a parameter the view chose (`params[i]`), sent only when it changed |
 * | `out_ptr` | `() → i32` | 48 f32: `[0..3] ink · [4..7] vary · [8..39] points (8 × xyzw) · [40] pointCount` — the stage's channels |
 * | `hud_ptr` | `() → i32` | 16 i32 the machine writes for the view to show (addresses, words, counters) |
 * | `buf_ptr` `buf_w` `buf_h` `buf_ch` | `() → i32` | the byte region the shader reads as `buf` (`w × h × ch`, ch 1 or 4), row 0 = top |
 *
 * ## What it exports
 * - {@link MachineStage} — the element: `{ wasm, shader, seed, params, cells = 6, cam, onReady, onHud, onState, hudHz = 4, zClass = "z-0" }`.
 *   `cam` is passed through to the stage as its PICTURE channel (a canvas, a bitmap, or a function returning one) —
 *   how a machine that lays pictures (the comb's atlas) gets them to the shader; `onState(state)` reports
 *   `loading → ready | failed | none` so the view can fall back to DOM where the machine cannot run.
 *   Renders the {@link GlStage} for `shader` fed from the machine's out block and byte region, plus a
 *   transparent `fixed inset-0` touch surface (`data-machine`, `touch-action: none`) that forwards every pointer
 *   to `touch`. `cells` is the CSS px per grid cell → `init(ceil(innerWidth / cells), ceil(innerHeight / cells), seed)`.
 *   `params` is an array of numbers; an index whose value changed is sent with `set`. `onHud(hud: Int32Array)`
 *   fires `hudHz` times a second with a live view of the HUD block; `onReady(api)` once, with
 *   `{ exports, memory, hud, out, buf }` for anything the view wants to read itself.
 * - {@link loadMachine} — `(bytes: BufferSource, { w, h, seed }) → api`: instantiate, check the ABI, `init`; the
 *   part of the host that runs anywhere `WebAssembly` does (Deno tests included). Throws a named error on a
 *   missing export, a wrong `abi()`, or an `init` that refused.
 * - {@link ABI} — the version this host speaks, 1.
 *
 * ## The contract
 * - The surface reports `data-machine`: `loading` → `ready` | `failed` (then `data-err` carries the reason, 120 chars)
 *   | `none` where there is no `WebAssembly` (preflight's Deno has it; a browser without it is not a target).
 *   `data-abi` is the version, `data-grid` is `w×h`.
 * - Stepping is on `requestAnimationFrame`, `dt` clamped to 50 ms (a tab that slept does not fast-forward a
 *   thousand steps on wake); under the gate every other frame is skipped, the way GlStage halves itself. A
 *   hidden tab steps nothing.
 * - Views of the memory (`hud`, `out`, `buf`) are rebuilt when `memory.buffer` changes identity (growth) — a
 *   machine that grows its memory does not break the host, it only costs a view.
 * - The touch surface is UNDER in-flow content (`z-0`): an island or a sheet over it takes the finger first, a
 *   `pointer-events: none` HUD lets it through. The surface captures the pointer on down, so a drag that leaves
 *   the window still ends with `up`.
 * - Nothing here fetches with `instantiateStreaming`: the bytes go through `arrayBuffer()`, so a server that
 *   labels `.wasm` as octet-stream (the gate's file handler, a static host) still works.
 *
 * ## Why
 * A machine app has no JS worth reviewing: the state is in a binary nobody patches by hand, the gate proves the
 * binary matches its text (`wat --check`), the shader is read by the eye. Every new machine inherits the loop,
 * the touch routing, the memory views and the failure reporting from here.
 *
 * @module
 */
/**
 * Instantiate a machine from its bytes, check the ABI and run `init` — the browser-free half of the host.
 * @param bytes the `.wasm` as a BufferSource
 * @param grid `{ w, h, seed }` — the cell grid the shader will show and the seed the machine starts from
 * @returns `{ exports, memory, hud, out, buf, grid }` — typed views over the machine's memory, rebuilt by `refresh()` when the memory grows
 */
export function loadMachine(bytes: any, { w, h, seed }?: {
    seed?: number;
    w?: any;
    h?: any;
}): Promise<any>;
/**
 * The machine under the page: the binary stepping on the display clock, the shader showing its memory, every
 * touch routed into it.
 * @param props see the module note
 * @returns the stage canvas and the touch surface
 */
export function MachineStage({ wasm, shader, seed, params, cells, cam, onReady, onHud, onState, hudHz, zClass }: {
    wasm: any;
    shader: any;
    seed?: number;
    params: any;
    cells?: number;
    cam: any;
    onReady: any;
    onHud: any;
    onState: any;
    hudHz?: number;
    zClass?: string;
}): any;
/** The ABI version this host speaks; a machine's `abi()` must answer it. */
export const ABI: 1;
