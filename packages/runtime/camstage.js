/* @ts-self-types="./camstage.d.ts" */
/**
 * # runtime/camstage.js — the camera in a canvas, once, for every mirror app
 *
 * Every camera app of the farm used to open the stream itself: the priming screen, `camera.start` with its
 * retry, the wake lock, the flip, the pinch that zooms the track, the tap that focuses it and draws a ring,
 * the fullscreen of the stage subtree — a hundred lines copied from podoba into portal into the next one
 * (owner, 2026-09-05: "здається у нас кожна апка реалізовує ядро камери і це не ок"). `CamStage` is that
 * hundred lines as ONE element of the kit. It owns the hidden `<video>` and the whole lifecycle, and hands the
 * playing element OUT through `onVideo` — the app draws it wherever it draws (a GlStage's `cam`, a pixi
 * texture, a 2D canvas). Its children are the app's drawing surface, rendered INSIDE the stage element so a
 * fullscreen of the stage shows the picture alone (the top layer draws one subtree; the chrome outside it is
 * gone — vydyvo's show recipe).
 *
 * ![CamStage: priming, the stream, the gesture layer, the fullscreen subtree](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-camstage.svg)
 *
 * ## Import
 * ```js
 * import { CamStage } from "/_rt/camstage.js";                     // an app's page: the import map resolves /_rt/
 * import { CamStage, camPoint } from "@microspec/core/runtime/camstage.js";   // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link CamStage} — the element. Props:
 *   `loc`, `reason`, `onSettings` (the priming screen's, see camprime.js); `facing` ("environment" | "user",
 *   controlled — flip by changing it); `torch` (boolean, controlled; ignored when the track has no LED);
 *   `still` (a URL — in the gate, where headless has no hardware, an `<img>` of it plays the camera's part);
 *   `onVideo(el | null, { facing, mirror })` — the playing `<video>` (or the still's `<img>`), once per stream,
 *   `null` when it stops; `onState({ ready, caps, fullscreen, err })` — what the track declares (`caps` of
 *   {@link camControls}: torch · zoom · focus), whether the stage is fullscreen, the priming error;
 *   `fullscreen` (default true — a tap on the stage toggles the fullscreen of the stage subtree);
 *   `gestures` (default true — a pinch zooms within what the track declares, a tap focuses under the finger
 *   and draws one ring); `className` for the stage element; `children` — the app's surface.
 * - {@link camPoint} — `(u, v, vw, vh, mirror) → { x, y }`: a viewport point (0..1) to the sensor point it
 *   shows under a cover fit — the maths a tap-to-focus needs, pure.
 *
 * ## In practice
 * ```js
 * import { CamStage } from "/_rt/camstage.js";   // apps/portal/view.js
 *
 * // The stage owns the camera; the app owns the drawing. `facing` is the app's state — the flip button sets it.
 * <${CamStage} loc=${loc} reason=${T(t, "primeReason")} onSettings=${() => S.screen.set("perms")}
 *     facing=${facing} torch=${torch} still=${gate ? mockURL : null}
 *     onVideo=${(el, { mirror }) => el ? mount(P.Texture.from(el), mirror) : unmount()}
 *     onState=${(s) => { setCaps(s.caps); setFull(s.fullscreen); }}>
 *   <canvas ref=${canvasRef} class="fixed inset-0 z-0 w-full h-full pointer-events-none"></canvas>
 * <//>
 * ```
 *
 * ## The contract
 * - The camera never opens cold: the priming screen is rendered until the person taps Enable (in the gate it
 *   is skipped and the still plays). `onVideo` fires on the `playing` event — the first frame exists.
 * - A flip (a new `facing`) stops the stream, then opens the other camera; the kit's retry after the hardware
 *   lets go (sensors.js, core ≥ 1.2.32) is inside `camera.start`.
 * - The tap does two things at once, on purpose: it focuses the track at the point under the finger and
 *   toggles the fullscreen of the stage (owner: "кліком по полотну включити на весь екран і кліком вимкнути").
 *   The browser leaving fullscreen on its own (Back, ESC, the system gesture) is mirrored into `onState`.
 * - The pinch sends ONE constraint per frame, never per event — the track's `applyConstraints` is slow.
 * - The wake lock is held while the stream runs and released with it.
 *
 * ## Why
 * A camera app is its picture and its verbs; the stream is plumbing, and plumbing copied is plumbing that
 * drifts — the flip bug of 2026-09-05 was fixed in the kit and then again in an app that had its own copy.
 * One element, one lifecycle, one set of gestures, every mirror the same to the hand.
 *
 * @module
 */
import { html } from "htm/preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { camera, wakeLock } from "./sensors.js";
import { CameraPrime } from "./camprime.js";

const LBL = {
  uk: { stage: "Полотно камери: тап — на весь екран, щипок — зум", exit: "Вийти з повного екрана" },
  en: { stage: "Camera stage: tap for fullscreen, pinch to zoom", exit: "Exit fullscreen" },
};
const CSS = `.cs-focus{position:absolute;width:3.5rem;height:3.5rem;margin:-1.75rem 0 0 -1.75rem;border:2px solid var(--app-accent,#F2B84B);border-radius:9999px;pointer-events:none;animation:csFocus .95s ease-out forwards}
@keyframes csFocus{0%{transform:scale(1.4);opacity:0}25%{opacity:1}100%{transform:scale(1);opacity:0}}
@media (prefers-reduced-motion:reduce){.cs-focus{animation:none;opacity:.8}}`;
const fsSupported = typeof document !== "undefined" && !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

/**
 * A viewport point to the sensor point it shows: the cover fit of a `vw × vh` picture over the viewport, in JS,
 * so a tap focuses on what is under the finger and not on the sensor's own corner.
 * @param u 0..1 across the viewport
 * @param v 0..1 down the viewport
 * @param vw the picture's width (px)
 * @param vh the picture's height (px)
 * @param mirror the picture is shown mirrored (the front camera)
 * @param asp the viewport's aspect (width / height; defaults to the window's)
 * @returns `{ x, y }` in 0..1 of the sensor
 */
export function camPoint(u, v, vw, vh, mirror, asp) {
  const a = asp || (globalThis.innerWidth || 1) / (globalThis.innerHeight || 1), ca = vw / (vh || 1);
  let x = u - 0.5, y = v - 0.5;
  if (ca > a) x *= a / ca; else y *= ca / a;
  x += 0.5; y += 0.5;
  return { x: Math.min(1, Math.max(0, mirror ? 1 - x : x)), y: Math.min(1, Math.max(0, y)) };
}

/**
 * The camera stage: the priming screen, the stream's lifecycle, the gestures and the fullscreen of the stage
 * subtree, once — the app draws the `<video>` it is handed.
 * @param props see the module note
 * @returns the stage element with the app's surface inside it
 */
export function CamStage({ loc, reason, onSettings, facing = "environment", torch = false, still = null, onVideo, onState, fullscreen = true, gestures = true, className = "", children }) {
  const L = LBL[loc] || LBL.en;
  const [enabled, setEnabled] = useState(!!still);   // the camera opens only after the tap on Enable; a still plays at once
  const [err, setErr] = useState(null);
  const [focus, setFocus] = useState(null);           // the ring of the last tap { x, y, k }
  const [full, setFull] = useState(false);
  const videoRef = useRef(), imgRef = useRef(), stageRef = useRef();
  const ctl = useRef(null), capsRef = useRef(null), readyRef = useRef(false);
  const cb = useRef({ onVideo, onState }); cb.current = { onVideo, onState };
  const emit = () => cb.current.onState?.({ ready: readyRef.current, caps: capsRef.current, fullscreen: full, err });
  useEffect(emit, [full, err]);

  // the still (the gate's camera): the image plays the stream's part the moment it decodes
  useEffect(() => {
    if (!still) return;
    const img = imgRef.current; if (!img) return;
    let alive = true;
    const go = () => { if (!alive) return; readyRef.current = true; emit(); cb.current.onVideo?.(img, { facing, mirror: false }); };
    if (img.complete && img.naturalWidth > 0) go(); else img.addEventListener("load", go, { once: true });
    return () => { alive = false; readyRef.current = false; cb.current.onVideo?.(null, { facing, mirror: false }); };
  }, [still]);

  // the stream: the kit's lifecycle, reopened on flip, every track stopped on the way out; the controls are
  // read from the running track once it plays — nothing is guessed, `caps` says what exists
  useEffect(() => {
    if (still || !enabled) return;
    if (!camera.supported) { setErr("unsupported"); return; }
    let alive = true, stop = () => {};
    readyRef.current = false; capsRef.current = null; ctl.current = null; emit();
    const wl = wakeLock.acquire();
    const v = videoRef.current;
    const onPlaying = () => {
      if (!alive) return;
      ctl.current = camera.controls(v); capsRef.current = ctl.current.caps; readyRef.current = true; emit();
      cb.current.onVideo?.(v, { facing, mirror: facing === "user" });
    };
    v?.addEventListener("playing", onPlaying);
    camera.start(v, (e) => { if (alive) setErr(e); }, { facingMode: facing }).then((s) => { if (alive) stop = s; else s(); });
    return () => {
      alive = false; v?.removeEventListener("playing", onPlaying); stop(); wl?.release?.();
      readyRef.current = false; capsRef.current = null; ctl.current = null;
      cb.current.onVideo?.(null, { facing, mirror: facing === "user" });
    };
  }, [enabled, facing, still]);

  // the torch follows the prop, only when the track has one
  useEffect(() => { if (readyRef.current && capsRef.current?.torch) ctl.current?.torch(torch); }, [torch]);

  // fullscreen of the stage subtree, mirrored from the document so state and display never disagree
  useEffect(() => {
    if (!fsSupported) return;
    const onChange = () => setFull(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFull = () => {
    const el = stageRef.current; if (!fsSupported || !el) return;
    if (document.fullscreenElement === el) { try { document.exitFullscreen?.(); } catch { /* */ } return; }
    try { const r = el.requestFullscreen?.({ navigationUI: "hide" }) || el.webkitRequestFullscreen?.(); r?.catch?.(() => {}); } catch { /* denied: nothing changes */ }
  };

  // gestures: a pinch zooms the track within what it declares; a tap focuses under the finger, draws one
  // ring and toggles the fullscreen
  const pinch = useRef({ pts: new Map(), d0: 0, z0: 1, z: 1, raf: 0 }).current;
  useEffect(() => { pinch.z = 1; }, [facing]);
  useEffect(() => { if (!focus) return; const id = setTimeout(() => setFocus(null), 950); return () => clearTimeout(id); }, [focus]);
  const onDown = (e) => {
    if (!gestures || !readyRef.current) return;
    pinch.pts.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), moved: false });
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (pinch.pts.size === 2) { const [a, b] = [...pinch.pts.values()]; pinch.d0 = Math.hypot(a.x - b.x, a.y - b.y) || 1; pinch.z0 = pinch.z; }
  };
  const onMove = (e) => {
    const p = pinch.pts.get(e.pointerId); if (!p) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) p.moved = true;
    p.cx = e.clientX; p.cy = e.clientY;
    const zc = capsRef.current?.zoom;
    if (pinch.pts.size !== 2 || !zc) return;
    const [a, b] = [...pinch.pts.values()];
    const d = Math.hypot((a.cx ?? a.x) - (b.cx ?? b.x), (a.cy ?? a.y) - (b.cy ?? b.y));
    pinch.z = Math.min(zc.max, Math.max(zc.min, pinch.z0 * d / pinch.d0));
    if (!pinch.raf) pinch.raf = requestAnimationFrame(() => { pinch.raf = 0; ctl.current?.zoom(pinch.z); });   // one constraint per frame, never per event
  };
  const onUp = (e) => {
    const p = pinch.pts.get(e.pointerId); pinch.pts.delete(e.pointerId);
    if (!p || p.moved || pinch.pts.size || performance.now() - p.t > 350) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (capsRef.current?.focus) {
      const v = videoRef.current;
      // viewport-relative: the stage IS the viewport's cover fit, whatever box the gesture layer occupies
      const pt = camPoint(e.clientX / (globalThis.innerWidth || 1), e.clientY / (globalThis.innerHeight || 1), v?.videoWidth || 3, v?.videoHeight || 4, facing === "user");
      ctl.current?.focusAt(pt.x, pt.y);
    }
    setFocus({ x: e.clientX - r.left, y: e.clientY - r.top, k: Date.now() });
    if (fullscreen) toggleFull();
  };

  const on = enabled && !err;
  return html`<div ref=${stageRef} data-camstage data-live=${on ? "1" : null} data-ready=${readyRef.current ? "1" : null} data-fullscreen=${full ? "1" : null} data-facing=${facing} class=${`absolute inset-0 ${full ? "bg-black" : ""} ${className}`}>
    <style>${CSS}</style>
    <video ref=${videoRef} autoplay muted playsinline aria-hidden="true" class="absolute w-px h-px opacity-0 pointer-events-none"></video>
    ${still ? html`<img ref=${imgRef} src=${still} alt="" aria-hidden="true" decoding="async" class="absolute w-px h-px opacity-0 pointer-events-none" />` : null}
    ${children}
    <div data-gestures role=${fullscreen ? "button" : null} aria-label=${fullscreen ? (full ? L.exit : L.stage) : null} class="absolute inset-0 z-[1] touch-none" style="touch-action:none"
      onPointerDown=${onDown} onPointerMove=${onMove} onPointerUp=${onUp} onPointerCancel=${onUp}>
      ${focus ? html`<div key=${focus.k} data-focus aria-hidden="true" class="cs-focus" style=${`left:${focus.x}px;top:${focus.y}px`}></div>` : null}
    </div>
    ${on ? null : html`<${CameraPrime} loc=${loc} reason=${reason} onEnable=${() => { setErr(null); setEnabled(true); }} onSettings=${onSettings} denied=${err === "denied"} unavailable=${err === "unavailable" || err === "unsupported"} />`}
  </div>`;
}
