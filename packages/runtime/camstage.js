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
 *   and draws one ring); `pinch` / `tap` — either gesture on its own, each defaulting to `gestures`, because
 *   they are not always wanted together (a scanner wants the pinch and not the ring, which inside an
 *   aperture reads as "code caught"); with both off the gesture layer takes no pointers at all; `show` (default false — the stage DISPLAYS the stream itself, cover-fit and never
 *   mirrored, for an app that reads the picture instead of drawing it); `picClassName` — classes for the
 *   shown picture itself (a dimmed backdrop is `opacity-*` here, NOT on `className`, which would dim the
 *   app's own layers with it); `onEnable` — the person's tap on Enable, forwarded so an app can prime its
 *   OTHER gesture-gated permission on the same gesture; `privacy` / `privacyIcon` — an honest override of
 *   the priming screen's built-in privacy line (camprime.js) for an app where "never uploaded" is untrue;
 *   `primeFull` (default false — the priming screen fills the stage; true pins it to `.ms-stage`, for an app
 *   whose stage is a small box that would clip the Enable button); `constraints` — extra video constraints
 *   for the ask (a photo app: `{ width: { ideal: 1920 } }`), read when the stream opens;
 *   `className` for the stage element; `children` — the app's surface.
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
 * - **Under the gate with no `still` the stage stands aside**: no stream, no priming screen, `onVideo` never
 *   fires — the app's own seeded fixture is what the shot shows (`ready` is reported true so the verbs are
 *   live). An app that has a mock picture passes it as `still` and gets the real path instead; an app whose
 *   gate value is a deterministic seed (a decoded link, a palette) keeps that seed and passes nothing.
 * - A flip (a new `facing`) stops the stream, then opens the other camera; the kit's retry after the hardware
 *   lets go (sensors.js, core ≥ 1.2.32) is inside `camera.start`.
 * - The tap does two things at once, on purpose: it focuses the track at the point under the finger and
 *   toggles the fullscreen of the stage (owner: "кліком по полотну включити на весь екран і кліком вимкнути").
 *   The browser leaving fullscreen on its own (Back, ESC, the system gesture) is mirrored into `onState`.
 * - The pinch sends ONE constraint per frame, never per event — the track's `applyConstraints` is slow.
 * - The wake lock is held while the stream runs and released with it.
 * - **The app's children lie UNDER the priming screen** (it is `z-30`) and OVER the picture; the gesture
 *   layer sits between them at `z-[1]`, so a layer of the app's own that must be seen or tapped while the
 *   stream runs carries `relative z-[2]`.
 * - **`primeFull` dies inside a `filter` or a `transform`.** `.ms-stage` is `position: fixed`, and an
 *   ancestor carrying either becomes the containing block for everything fixed below it — so a stage wrapped
 *   in a filtered "look" layer silently pins the priming screen back to the small box it was escaping, and
 *   the Enable button can be clipped again with every gate green (cam, 2026-09-07: the wrapper's style is
 *   null until a frame exists, which is why it works and why that `ready` is load-bearing).
 * - **The privacy line must be true.** The built-in one says the frames are processed on the device; an app
 *   that uploads what it captures passes its own `privacy` + `privacyIcon` — the priming screen is where
 *   the person decides, so a claim that is false there is the one lie the kit must not tell.
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
import { gate } from "./gate.js";

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
export function CamStage({ loc, reason, onSettings, onEnable, privacy, privacyIcon, primeFull = false, facing = "environment", torch = false, constraints = null, still = null, onVideo, onState, fullscreen = true, gestures = true, pinch = gestures, tap = gestures, show = false, picClassName = "", className = "", children }) {
  const L = LBL[loc] || LBL.en;
  const standby = gate && !still;                    // the gate with no picture: the app seeds its own, the stage stands aside
  const [enabled, setEnabled] = useState(!!still || standby);   // the camera opens only after the tap on Enable; a still plays at once
  const [err, setErr] = useState(null);
  const [focus, setFocus] = useState(null);           // the ring of the last tap { x, y, k }
  const [full, setFull] = useState(false);
  const videoRef = useRef(), imgRef = useRef(), stageRef = useRef();
  const ctl = useRef(null), capsRef = useRef(null), readyRef = useRef(standby);
  const cb = useRef({ onVideo, onState }); cb.current = { onVideo, onState };
  const cons = useRef(constraints); cons.current = constraints;   // read when the stream opens, never a dep: an object literal would reopen the camera every render
  const emit = () => cb.current.onState?.({ ready: readyRef.current, caps: capsRef.current, fullscreen: full, err });
  useEffect(emit, [full, err]);
  useEffect(() => { if (standby) emit(); }, []);      // the seeded stage is ready from its first frame

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
    if (still || standby || !enabled) return;
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
    camera.start(v, (e) => { if (alive) setErr(e); }, { facingMode: facing, constraints: cons.current }).then((s) => { if (alive) stop = s; else s(); });
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
  // ring and toggles the fullscreen. The two are separable because they are not always wanted together —
  // a scanner wants the far-away code brought closer, but a focus ring inside its aperture reads as
  // "code caught" and lies to the person (qr, 2026-09-07).
  const pg = useRef({ pts: new Map(), d0: 0, z0: 1, z: 1, raf: 0 }).current;
  useEffect(() => { pg.z = 1; }, [facing]);
  useEffect(() => { if (!focus) return; const id = setTimeout(() => setFocus(null), 950); return () => clearTimeout(id); }, [focus]);
  const onDown = (e) => {
    if ((!pinch && !tap) || !readyRef.current) return;
    pg.pts.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), moved: false });
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (pg.pts.size === 2) { const [a, b] = [...pg.pts.values()]; pg.d0 = Math.hypot(a.x - b.x, a.y - b.y) || 1; pg.z0 = pg.z; }
  };
  const onMove = (e) => {
    const p = pg.pts.get(e.pointerId); if (!p) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) p.moved = true;
    p.cx = e.clientX; p.cy = e.clientY;
    const zc = capsRef.current?.zoom;
    if (!pinch || pg.pts.size !== 2 || !zc) return;
    const [a, b] = [...pg.pts.values()];
    const d = Math.hypot((a.cx ?? a.x) - (b.cx ?? b.x), (a.cy ?? a.y) - (b.cy ?? b.y));
    pg.z = Math.min(zc.max, Math.max(zc.min, pg.z0 * d / pg.d0));
    if (!pg.raf) pg.raf = requestAnimationFrame(() => { pg.raf = 0; ctl.current?.zoom(pg.z); });   // one constraint per frame, never per event
  };
  const onUp = (e) => {
    const p = pg.pts.get(e.pointerId); pg.pts.delete(e.pointerId);
    if (!tap || !p || p.moved || pg.pts.size || performance.now() - p.t > 350) return;
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
  // shown, the picture IS the stage: cover-fit and NEVER mirrored (a mirrored live feed makes people seasick);
  // hidden, it is a 1px source the app draws from
  const HIDDEN = "absolute w-px h-px opacity-0 pointer-events-none", SHOWN = `absolute inset-0 w-full h-full object-cover ${picClassName}`;
  const pic = show ? SHOWN : HIDDEN;
  return html`<div ref=${stageRef} data-camstage data-live=${on ? "1" : null} data-ready=${readyRef.current ? "1" : null} data-fullscreen=${full ? "1" : null} data-facing=${facing} class=${`absolute inset-0 ${full ? "bg-black" : ""} ${className}`}>
    <style>${CSS}</style>
    <video ref=${videoRef} autoplay muted playsinline aria-hidden="true" class=${still ? HIDDEN : pic}></video>
    ${still ? html`<img ref=${imgRef} src=${still} alt="" aria-hidden="true" decoding="async" class=${pic} />` : null}
    ${children}
    ${/* with neither gesture the layer stops taking pointers at all — it used to sit inert but still
         intercepting, and an app's own layers had to climb over it */""}
    <div data-gestures role=${tap && fullscreen ? "button" : null} aria-label=${tap && fullscreen ? (full ? L.exit : L.stage) : null}
      class=${`absolute inset-0 z-[1] touch-none ${pinch || tap ? "" : "pointer-events-none"}`} style="touch-action:none"
      onPointerDown=${onDown} onPointerMove=${onMove} onPointerUp=${onUp} onPointerCancel=${onUp}>
      ${focus ? html`<div key=${focus.k} data-focus aria-hidden="true" class="cs-focus" style=${`left:${focus.x}px;top:${focus.y}px`}></div>` : null}
    </div>
    ${on ? null : (() => {
      // the priming screen fills the stage; where the stage is a small box of the screen (a viewfinder well)
      // the app asks for `primeFull` and it is pinned to .ms-stage instead — the chrome contract, watch rail
      // included — because a clipped Enable button is a camera that cannot be turned on at all
      const prime = html`<${CameraPrime} loc=${loc} reason=${reason} privacy=${privacy} privacyIcon=${privacyIcon}
        onEnable=${() => { setErr(null); setEnabled(true); onEnable?.(); }} onSettings=${onSettings}
        denied=${err === "denied"} unavailable=${err === "unavailable" || err === "unsupported"} />`;
      return primeFull ? html`<div class="ms-stage z-30">${prime}</div>` : prime;
    })()}
  </div>`;
}
