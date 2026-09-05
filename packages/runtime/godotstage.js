/* @ts-self-types="./godotstage.d.ts" */
/**
 * # runtime/godotstage.js — the Godot engine as a stage under the page
 *
 * Inside the shell's `godot` flavour (the APK that links the Godot engine as a library, 2026-09-05) a page can
 * put a whole Godot project UNDER itself: the engine renders into the window behind a transparent WebView, the
 * page stays the UI. `GodotStage` is that arrangement as ONE element of the kit, the way `CamStage` is the
 * camera: mount it and the engine starts the project pack you name (from the page's own origin — the shell
 * refuses any other), hand it `params` and every change reaches the project as a `set` signal, forward the
 * gestures on the stage, save a frame, and read what the engine reports through `onState`. Unmount it and the
 * engine stops. Where there is no engine (every browser, the lighter shells) `available()` is false and the
 * element renders nothing — an app draws its web stage instead.
 *
 * ![GodotStage: the pack from the page's origin, the engine under a transparent WebView, set/input/save in, state out](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-godotstage.svg)
 *
 * ## Import
 * ```js
 * import { GodotStage, godotAvailable, godotSave } from "/_rt/godotstage.js";   // an app's page
 * import { godotAvailable } from "@microspec/core/runtime/godotstage.js";        // a product rt/ module or a test
 * ```
 *
 * ## What it exports
 * - {@link GodotStage} — the element. Props: `pack` (URL of the project's .pck on the page's origin), `params`
 *   (an object: every key whose value changed since the last render is sent as `godot.set`), `onState(frame)`
 *   (the engine's `godot.state` frames: `{state, fps, width, height, detail}`), `gestures` (default true: a tap
 *   and a pinch on the stage go to the project as `godot.input`), `className`, `children` (drawn OVER the
 *   engine, e.g. a scrim).
 * - {@link godotAvailable} — `() → boolean`: is there an engine to start here (the shell carries `godot.start`)?
 * - {@link godotSave} — `(name?) → Promise<{name, bytes}>`: the current frame as a PNG in Downloads.
 *
 * ## The contract
 * - While a GodotStage is mounted the document is marked `data-engine="godot"` and its ground is transparent
 *   (the runtime's own stylesheet rule), so the engine's picture shows through everything but the chrome.
 * - One engine per process (Godot's rule): a second GodotStage with another pack is refused by the shell.
 * - `params` are diffed by JSON, shallowly by key; send a new object to change a value.
 * - Under the gate `godotAvailable()` is false (no engine draws in Chromium — the eye needs the web stage's
 *   picture) unless the page is opened with `?mock=godot`, where the mocked bridge answers a running frame.
 *
 * ## Why
 * The stage is a capability of the shell, not of one app: the next app with a Godot project mounts the
 * same element and inherits the transparency, the origin lock, the gestures and the state stream.
 *
 * @module
 */
import { html } from "htm/preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { shell } from "./shell.js";
import { gate, MOCK } from "./gate.js";

const MARK = "engine";

/**
 * Is there an engine to start here — the shell around this page carries `godot.start`? Under the gate the facade
 * mocks every action, but no engine draws in Chromium: the stage would be an empty ground, and the gate is where
 * the eye judges the POPULATED screen. So the gate answers "no engine" and an app shows its web stage there —
 * unless the page was opened with `?mock=godot`, which is how an e2e exercises the engine tree on the mocked
 * bridge (the state mock is a running frame, so the tree reaches `ready`).
 */
export function godotAvailable() { return shell.has("godot.start") && (!gate || MOCK === "godot"); }

/**
 * The current frame as a PNG in Downloads (the shell writes it when the project has rendered it).
 * @param name the file name; the shell picks `portal-<time>.png` when absent
 * @returns `{ name, bytes }` — bytes is 0 until the project answers; the toast on the device says the rest
 */
export function godotSave(name) { return shell.call("godot.save", name ? { name } : {}); }

/**
 * The Godot engine under the page: starts the pack on mount, streams its state, forwards params and gestures,
 * stops on unmount.
 * @param props see the module note
 * @returns the stage element (empty where there is no engine)
 */
export function GodotStage({ pack, params = {}, onState, gestures = true, className = "", children }) {
  const [state, setState] = useState("idle");
  const sent = useRef({});            // the params the project has, by key → JSON
  const cb = useRef(onState); cb.current = onState;
  const live = godotAvailable();

  // the engine's life = the element's: start with the first params, stream the state, stop on the way out
  useEffect(() => {
    if (!live || !pack) return;
    document.documentElement.dataset[MARK] = "godot";
    let alive = true;
    const cancel = shell.subscribe("godot.state", {}, (f) => {
      if (!alive || !f || f.ack) return;
      if (f.state) setState(f.state);
      cb.current?.(f);
    }, (e) => { if (alive) { setState("failed"); cb.current?.({ state: "failed", detail: e?.detail || e?.code || String(e) }); } });
    sent.current = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, JSON.stringify(v)]));
    shell.call("godot.start", { pack, params }).then((r) => { if (alive && r?.state) setState(r.state); })
      .catch((e) => { if (alive) { setState("failed"); cb.current?.({ state: "failed", detail: e?.detail || e?.code || String(e) }); } });
    return () => {
      alive = false;
      cancel();
      shell.call("godot.stop", {}).catch(() => {});
      delete document.documentElement.dataset[MARK];
    };
  }, [live, pack]);

  // params: every key whose JSON changed goes over as one godot.set — the project keeps the rest
  useEffect(() => {
    if (!live || state === "idle" || state === "failed") return;
    for (const [k, v] of Object.entries(params)) {
      const j = JSON.stringify(v);
      if (sent.current[k] === j) continue;
      sent.current[k] = j;
      shell.call("godot.set", { key: k, value: v }).catch(() => {});
    }
  }, [live, state, params]);

  // gestures: a tap (focus) and a pinch (zoom) belong to the picture — the WebView owns every touch, so the
  // page relays them; a pinch sends one frame per animation frame, never one per event
  const pinch = useRef({ pts: new Map(), d0: 0, raf: 0, scale: 1 }).current;
  const send = (type, extra) => shell.call("godot.input", { type, ...extra }).catch(() => {});
  const onDown = (e) => {
    if (!gestures) return;
    pinch.pts.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), moved: false });
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (pinch.pts.size === 2) { const [a, b] = [...pinch.pts.values()]; pinch.d0 = Math.hypot(a.x - b.x, a.y - b.y) || 1; }
  };
  const onMove = (e) => {
    const p = pinch.pts.get(e.pointerId); if (!p) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) p.moved = true;
    p.cx = e.clientX; p.cy = e.clientY;
    if (pinch.pts.size !== 2) return;
    const [a, b] = [...pinch.pts.values()];
    pinch.scale = Math.hypot((a.cx ?? a.x) - (b.cx ?? b.x), (a.cy ?? a.y) - (b.cy ?? b.y)) / pinch.d0;
    if (!pinch.raf) pinch.raf = requestAnimationFrame(() => { pinch.raf = 0; send("pinch", { scale: pinch.scale }); });
  };
  const onUp = (e) => {
    const p = pinch.pts.get(e.pointerId); pinch.pts.delete(e.pointerId);
    if (!p) return;
    if (pinch.pts.size === 0 && p.moved) { send("end", {}); return; }
    if (p.moved || pinch.pts.size || performance.now() - p.t > 350) return;
    const r = e.currentTarget.getBoundingClientRect();
    send("tap", { x: (e.clientX - r.left) / (r.width || 1), y: (e.clientY - r.top) / (r.height || 1) });
  };

  if (!live) return null;
  return html`<div data-godot data-state=${state} class=${`absolute inset-0 ${className}`}>
    ${children}
    <div data-gestures class="absolute inset-0 touch-none" style="touch-action:none"
      onPointerDown=${onDown} onPointerMove=${onMove} onPointerUp=${onUp} onPointerCancel=${onUp}></div>
  </div>`;
}
