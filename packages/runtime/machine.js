/* @ts-self-types="./machine.d.ts" */
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
 *   how a machine that lays pictures (the comb's atlas) gets them to the shader; `tex2` likewise is the stage's
 *   MATERIAL texture URL (the comb's text atlas, mipmapped); `onState(state)` reports
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
import { html } from "htm/preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { gate } from "./gate.js";
import { GlStage } from "./glstage.js";

/** The ABI version this host speaks; a machine's `abi()` must answer it. */
export const ABI = 1;

const OUT_LEN = 48;
const HUD_LEN = 16;
const DT_MAX = 50;
const REQUIRED = ["memory", "abi", "init", "step", "touch", "set", "out_ptr", "hud_ptr", "buf_ptr", "buf_w", "buf_h", "buf_ch"];

/**
 * Instantiate a machine from its bytes, check the ABI and run `init` — the browser-free half of the host.
 * @param bytes the `.wasm` as a BufferSource
 * @param grid `{ w, h, seed }` — the cell grid the shader will show and the seed the machine starts from
 * @returns `{ exports, memory, hud, out, buf, grid }` — typed views over the machine's memory, rebuilt by `refresh()` when the memory grows
 */
export async function loadMachine(bytes, { w, h, seed = 0 } = {}) {
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const x = instance.exports;
  for (const n of REQUIRED) if (!(n in x)) throw new Error(`machine: no export "${n}"`);
  const v = x.abi() | 0;
  if (v !== ABI) throw new Error(`machine: abi ${v}, host speaks ${ABI}`);
  if (!(w > 0 && h > 0)) throw new Error("machine: grid must be positive");
  if ((x.init(w | 0, h | 0, seed | 0) | 0) !== 1) throw new Error(`machine: init refused ${w}×${h}`);
  const api = { exports: x, memory: x.memory, grid: { w: w | 0, h: h | 0 }, hud: null, out: null, buf: null, gen: 0, _buffer: null };
  /** Rebuild the typed views when the memory's buffer changed identity. */
  api.refresh = () => {
    if (api._buffer === x.memory.buffer) return api;
    const b = api._buffer = x.memory.buffer;
    const region = (name, ptr, len) => { if (ptr + len > b.byteLength) throw new Error(`machine: ${name} ${ptr}+${len} outside the ${b.byteLength}-byte memory`); return ptr; };
    api.out = new Float32Array(b, region("out block", x.out_ptr() >>> 0, OUT_LEN * 4), OUT_LEN);
    api.hud = new Int32Array(b, region("hud block", x.hud_ptr() >>> 0, HUD_LEN * 4), HUD_LEN);
    const bw = x.buf_w() | 0, bh = x.buf_h() | 0, ch = x.buf_ch() | 0;
    api.bufW = bw; api.bufH = bh; api.bufCh = ch === 4 ? 4 : 1;
    api.buf = new Uint8Array(b, region("byte region", x.buf_ptr() >>> 0, bw * bh * api.bufCh), bw * bh * api.bufCh);
    return api;
  };
  return api.refresh();
}

/**
 * The machine under the page: the binary stepping on the display clock, the shader showing its memory, every
 * touch routed into it.
 * @param props see the module note
 * @returns the stage canvas and the touch surface
 */
export function MachineStage({ wasm, shader, seed = 0, params, cells = 6, cam, tex2, dprMax, onReady, onHud, onState, hudHz = 4, zClass = "z-0" }) {
  const [state, setState] = useState(typeof WebAssembly === "undefined" ? "none" : "loading");
  const [err, setErr] = useState("");
  const [grid, setGrid] = useState("");
  const m = useRef({ api: null, dead: false, raf: 0, sent: [], onHud, onReady, onState }).current;
  m.onHud = onHud; m.onReady = onReady; m.onState = onState;
  useEffect(() => { m.onState?.(state); }, [state]);

  const chan = useRef(null);
  if (!chan.current) {
    const view = () => (m.api ? m.api.refresh() : null);
    chan.current = {
      live: () => { const a = view(); return a ? a.out[41] > 0.5 : true; },
      ink: () => { const a = view(); return a ? [a.out[0], a.out[1], a.out[2], a.out[3]] : [0.5, 0.5, 0, 0]; },
      vary: () => { const a = view(); return a ? [a.out[4], a.out[5], a.out[6], a.out[7]] : [0, 0, 0, 0]; },
      points: () => { const a = view(); if (!a) return []; const n = Math.max(0, Math.min(8, a.out[40] | 0)); return Array.from(a.out.subarray(8, 8 + n * 4)); },
      buf: () => { const a = view(); return a ? { data: a.buf, w: a.bufW, h: a.bufH, ch: a.bufCh, gen: a.gen } : null; },
    };
  }

  useEffect(() => {
    if (typeof WebAssembly === "undefined") return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(wasm);
        if (!res.ok) throw new Error(`wasm ${res.status}`);
        const bytes = await res.arrayBuffer();
        if (!alive) return;
        const w = Math.max(1, Math.ceil((globalThis.innerWidth || 384) / cells)), h = Math.max(1, Math.ceil((globalThis.innerHeight || 832) / cells));
        const api = await loadMachine(bytes, { w, h, seed: Math.floor((seed % 1 + 1) % 1 * 2147483647) });
        if (!alive) return;
        m.api = api;
        setGrid(`${w}×${h}`);
        setState("ready");
        m.onReady?.(api);
        let last = performance.now(), hudAt = last, tick = 0;
        const hudEvery = 1000 / Math.max(1, hudHz);
        const frame = (now) => {
          if (m.dead) return;
          m.raf = requestAnimationFrame(frame);
          if (document.hidden || (gate && (tick++ & 1))) { last = now; return; }
          const dt = Math.min(DT_MAX, Math.max(0, now - last)); last = now;
          try {
            const t1 = performance.now();
            if ((api.exports.step(dt, now) | 0) === 1) api.gen++;
            m.stepUs = (m.stepUs || 0) * 0.9 + (performance.now() - t1) * 1000 * 0.1;
          } catch (e) { m.dead = true; setState("failed"); setErr(String(e?.message ?? e).slice(0, 120)); return; }
          if (m.onHud && now - hudAt >= hudEvery) {
            hudAt = now; m.onHud(api.refresh().hud);
            const s = m.surface; if (s) { s.dataset.step = (m.stepUs || 0).toFixed(1); s.dataset.live = api.refresh().out[41] > 0.5 ? "1" : "0"; }
          }
        };
        m.raf = requestAnimationFrame(frame);
      } catch (e) {
        if (!alive) return;
        setState("failed"); setErr(String(e?.message ?? e).slice(0, 120));
        console.warn("machine: load failed —", e?.message ?? e);
      }
    })();
    return () => { alive = false; m.dead = true; cancelAnimationFrame(m.raf); m.api = null; };
  }, []);

  useEffect(() => {
    const api = m.api;
    if (!api || !Array.isArray(params)) return;
    params.forEach((v, i) => { const n = Number(v) || 0; if (m.sent[i] !== n) { m.sent[i] = n; try { api.exports.set(i, n); } catch { } } });
  }, [state, ...(Array.isArray(params) ? params : [])]);

  const at = (e) => [Math.min(1, Math.max(0, e.clientX / Math.max(1, globalThis.innerWidth || 1))), Math.min(1, Math.max(0, e.clientY / Math.max(1, globalThis.innerHeight || 1)))];
  const touch = (phase) => (e) => {
    const api = m.api;
    if (!api) return;
    if (phase === 0) { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { } }
    const [x, y] = at(e);
    try { api.exports.touch(e.pointerId | 0, phase, x, y); } catch { }
  };

  return html`<${GlStage} shader=${shader} seed=${seed} ink=${chan.current.ink} vary=${chan.current.vary} points=${chan.current.points} buf=${chan.current.buf} cam=${cam} tex2=${tex2} dprMax=${dprMax} live=${chan.current.live} zClass=${zClass} />
    <div ref=${(el) => { m.surface = el; }} data-machine=${state} data-abi=${ABI} data-grid=${grid} data-err=${err || null} aria-hidden="true"
      class=${`fixed inset-0 ${zClass} select-none`} style="touch-action:none;-webkit-tap-highlight-color:transparent"
      onPointerDown=${touch(0)} onPointerMove=${touch(1)} onPointerUp=${touch(2)} onPointerCancel=${touch(3)}></div>`;
}
