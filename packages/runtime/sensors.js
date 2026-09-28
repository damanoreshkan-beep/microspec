/* @ts-self-types="./sensors.d.ts" */
/**
 * # runtime/sensors.js — the hardware capability layer: one shape per capability, no-ops where the hardware is not
 *
 * Every capability here exposes `supported` plus methods that no-op when unavailable, so a view can
 * feature-detect and degrade instead of throwing on the phone the gate never runs. Hardware needs a secure
 * context (https / localhost); the headless gate has none, so views must render without live readings —
 * structure and permission-state only, a reading seeded from a fixture. The layer owns only the hardware
 * lifecycle (permission, stream, release) and the physics no app should redo on its own: a compass heading
 * is TRUE north by default (the World Magnetic Model is applied inside `compass.start`, from a coarse
 * position watch), a wake lock re-acquires itself when the page comes back, a heading is projected from the
 * orientation matrix rather than read off alpha. The maths on pixels and samples stays with the app.
 *
 * ![The capability layer: haptic, geo, wakeLock, compass, tilt, camera and mic, each with supported plus methods that no-op](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-sensors.svg)
 *
 * ## Import
 * ```js
 * import { compass, wakeLock, mic } from "/_rt/sensors.js";                    // an app's page: the import map resolves /_rt/
 * import { heldHeadingDeg, hapticFor } from "@microspec/core/runtime/sensors.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * **Touch**
 * - {@link haptic} — `supported`, `buzz(pattern)`, `tick()` (8 ms), `bump()` (18 ms), `ok()` ([12, 40, 12]); a silent no-op where unsupported.
 * - {@link hapticFor} — `hapticFor(el) → "tick" | "bump" | the element's own data-haptic | null`: which haptic a tap deserves; pure, so it is unit-tested rather than felt.
 *
 * **Position and screen**
 * - {@link geo} — `supported`; `watch(onPos, onErr, opts) → stop fn` with every spec field (`lat, lng, accuracy, altitude, altitudeAccuracy, heading, speed, t`); `once(opts) → Promise<fix>` that rejects rather than hangs. `onErr("denied" | "unavailable" | "unsupported")`.
 * - {@link wakeLock} — `supported`; `acquire() → { supported, release() }`, a handle that re-acquires on visibilitychange until released.
 *
 * **Heading**
 * - {@link compass} — `supported`, `needsPermission`, `request() → Promise<boolean>`; `start(onHeading, { trueNorth = true, look = false }) → stop fn`. `onHeading(deg, { magnetic, declination, isTrue, geo })`, degrees clockwise from TRUE north.
 * - {@link lookHeadingDeg} — `(alpha, beta, gamma) → deg | null`: heading of the device −z axis (what the rear camera points at); null within ~9° of straight up or down.
 * - {@link screenHeadingDeg} — `(alpha, beta) → deg | null`: heading of the top edge of the screen from the spec's rotation matrix; null within ~9° of upright.
 * - {@link heldHeadingDeg} — `(alpha, beta, gamma, screenAngle = 0) → deg`: the hand-held compass reading at any pitch, screen-top while flat, camera axis while upright, smoothstep-crossfaded between; never null while β/γ are numbers.
 * - {@link tilt} — `supported`, `needsPermission`, `request()` (the same gesture-gated permission as compass); `start(onTilt) → stop fn`, `onTilt({ beta, gamma })` screen-orientation aware, no true-north, no geolocation.
 *
 * **Media**
 * - {@link camera} — `supported`; `async start(videoEl, onErr, { facingMode = "environment", constraints = null }) → stop fn` that stops every track and survives being called before the open resolves; `controls(videoEl)` → the running track's {@link camControls}.
 * - {@link camControls} — `(track) → { caps: { torch, zoom, focus }, torch(on), zoom(z), focusAt(x, y) }`, pure over `getCapabilities` / `applyConstraints`.
 * - {@link mic} — `supported`; `mime()` picks the first supported recorder type; `record({ seconds = 2, timeoutMs = 10000, bitsPerSecond = 128000, onStream, onErr }) → { done, stop(), cancel() }` where `done` resolves to `{ blob, mime, settings }` or null.
 * - {@link MIC_MIMES} — the recorder MIME types tried, in preference order.
 *
 * ## In practice
 * ```js
 * import { compass } from "/_rt/sensors.js";                                    // apps/compass/view.js
 *
 * // The heading arrives already true, and the position it needed came with it — sensors.js owns both.
 * const listen = () => compass.start((deg, m) => { setShown(deg); setDec(m.declination); setGeoState(m.geo); });
 * useEffect(() => {
 *   if (isGate || MOCK) return;                                   // the gate has no hardware: seeded reading
 *   if (!compass.supported) return;
 *   if (compass.needsPermission) { setNeedPerm(true); return; }  // iOS: needs a gesture, cannot auto-start
 *   stopRef.current = listen();
 *   return () => stopRef.current?.();
 * }, []);
 * const grant = async () => {
 *   if (await compass.request()) { setNeedPerm(false); stopRef.current = listen(); }
 * };
 * ```
 *
 * ## How it fits
 * Imports nothing at load; `compass.start` lazy-imports geomag.js (the ~2 KB World Magnetic Model) only once a
 * compass actually runs, so the apps that merely import `haptic` never pay for it. Inside the runtime,
 * index.js imports `haptic` and `hapticFor` for the one delegated `pointerdown` listener that gives every
 * tappable control its feedback, video.js imports `wakeLock`, dpad.js imports `haptic`; tests/sensors_test.js
 * covers the pure projections and `hapticFor`. 25 farm apps import it by name — compass, handpan, rave, sun,
 * swarm and hive for the heading; sigil, homin and grain for tilt; tide, v2m, drift, sonar and wall for the
 * wake lock; pipette, flux, qr and synesth for the camera; grain for the mic; air, ruler and weather for
 * geolocation; habits and sopilka for haptics. The smoothing and clamping for tilt lives in spectrum.js
 * `Parallax`; pixel and sample maths in colour.js and grain.js.
 *
 * ## Invariants and pitfalls
 * - A view must render with no live reading: the gate runs headless with no secure context, no canvas and no
 *   microphone. Seed the reading from a pixel buffer or a fixture, never from a capture.
 * - Never read a heading off raw alpha. Held upright the alpha and gamma axes coincide (gimbal lock) and the
 *   same orientation re-expresses with alpha jumped by hundreds of degrees — swarm's aim leapt 1° to −300°
 *   mid-turn. The projected vector is invariant under that re-expression; `heldHeadingDeg` is the default path
 *   for every dial, and only its screen-top term takes the screen-orientation correction.
 * - Smooth the magnetometer, then correct — never the reverse: an EMA over a corrected heading would drag a
 *   step change in declination through the needle for no physical reason.
 * - A heading is magnetic until a position fix arrives, and says so via `isTrue` / `geo` in the meta rather
 *   than passing itself off as true; outside the model's window the declination is null, not extrapolated.
 * - The wake lock is released by the BROWSER whenever the page is hidden and does not come back on its own —
 *   acquire once and the screen dies the first time the user checks a notification. The handle re-acquires.
 * - `geo.once` rejects rather than hangs, because a permission prompt the user ignores would otherwise leave
 *   the app on its skeleton forever; the unsupported branch of `watch` calls `onErr` synchronously, before it
 *   has returned the stop function.
 * - `getUserMedia` can neither resolve nor reject when the prompt is ignored, so `mic.record` races a timeout
 *   and stops a stream that arrives after it gave up — otherwise the OS mic indicator stays lit with nobody
 *   listening. Constraints are `ideal`, never `exact`: a processed sample beats an OverconstrainedError.
 * - `hapticFor` is silent for typing, for disabled controls (property OR attribute — preact sets `disabled` as a
 *   property) and for `data-haptic="off"`; `data-haptic="bump"` opts a destructive control up. Reads the `type`
 *   ATTRIBUTE, not the property, so an un-reflected `.type` cannot silence every checkbox in the farm.
 * @module
 */

const canVibrate = typeof navigator !== "undefined" && "vibrate" in navigator;

/** Short vibration feedback — `buzz(pattern)`, `tick`, `bump`, `ok`; a silent no-op where unsupported. */
export const haptic = {
  supported: canVibrate,
  buzz: (pattern) => { try { if (canVibrate) navigator.vibrate(pattern); } catch { } },
  tick: () => haptic.buzz(8),
  bump: () => haptic.buzz(18),
  ok: () => haptic.buzz([12, 40, 12]),
};

const TAPPABLE = 'button, a[href], summary, label[for], select, input, textarea, [role="button"], [role="tab"], [role="switch"], [role="option"], [data-tab], [data-loc], .btn, .tab';
const QUIET_INPUT = /^(text|search|email|url|tel|password|number)$/;
/**
 * Which haptic a tap on this element deserves, honouring data-haptic and the disabled state.
 * @param el the tapped element (the event target)
 * @returns "tick" | "bump" | the element's own data-haptic value, or null for none
 */
export function hapticFor(el) {
  const t = el?.closest?.(TAPPABLE);
  if (!t) return null;
  if (t.disabled === true || t.hasAttribute?.("disabled") || t.getAttribute?.("aria-disabled") === "true") return null;
  const want = t.getAttribute?.("data-haptic");
  if (want) return want === "off" ? null : want;
  const tag = (t.tagName || "").toLowerCase();
  const type = t.getAttribute?.("type") || t.type || "text";
  if (tag === "textarea" || (tag === "input" && QUIET_INPUT.test(type))) return null;
  if (t.classList?.contains("btn-error")) return "bump";
  return "tick";
}

/** Geolocation as a callback `watch` or a single promised fix via `once`; errors arrive as "denied" | "unavailable" | "unsupported". */
export const geo = {
  supported: typeof navigator !== "undefined" && "geolocation" in navigator,
  watch(onPos, onErr, opts) {
    if (!this.supported) { onErr?.("unsupported"); return () => {}; }
    const id = navigator.geolocation.watchPosition(
      (p) => onPos({
        lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy,
        altitude: p.coords.altitude, altitudeAccuracy: p.coords.altitudeAccuracy,
        heading: p.coords.heading, speed: p.coords.speed, t: p.timestamp,
      }),
      (e) => onErr?.(e.code === 1 ? "denied" : "unavailable"),
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 15000, ...opts },
    );
    return () => navigator.geolocation.clearWatch(id);
  },
  once(opts) {
    return new Promise((resolve, reject) => {
      let stop = null, done = false;
      const finish = (fn, v) => { if (done) return; done = true; stop?.(); fn(v); };
      stop = this.watch((fix) => finish(resolve, fix), (err) => finish(reject, new Error(err)), opts);
      if (done) stop?.();
    });
  },
};

/** Screen wake lock — `acquire()` returns a handle that re-acquires on visibilitychange until `release()`. */
export const wakeLock = {
  supported: typeof navigator !== "undefined" && "wakeLock" in navigator,
  acquire() {
    if (!this.supported) return { release: () => {}, supported: false };
    let sentinel = null, live = true;
    const take = async () => {
      if (!live || sentinel || document.visibilityState !== "visible") return;
      try { sentinel = await navigator.wakeLock.request("screen"); sentinel.addEventListener?.("release", () => { sentinel = null; }); }
      catch { sentinel = null; }
    };
    const onVis = () => { if (document.visibilityState === "visible") take(); };
    document.addEventListener("visibilitychange", onVis);
    take();
    return {
      supported: true,
      release() {
        live = false;
        document.removeEventListener("visibilitychange", onVis);
        try { sentinel?.release(); } catch { }
        sentinel = null;
      },
    };
  },
};

const LOCK = 0.15, FLAT = 0.5;

/**
 * Heading of the device −z axis (what the rear camera points at), degrees clockwise from north.
 * @param alpha device orientation alpha, degrees
 * @param beta device orientation beta, degrees
 * @param gamma device orientation gamma, degrees
 * @returns heading in [0, 360), or null within ~9° of straight up or down
 */
export function lookHeadingDeg(alpha, beta, gamma) {
  const r = Math.PI / 180, cA = Math.cos(alpha * r), sA = Math.sin(alpha * r);
  const sB = Math.sin(beta * r), cG = Math.cos(gamma * r), sG = Math.sin(gamma * r);
  const x = -cA * sG - sA * sB * cG;
  const y = -sA * sG + cA * sB * cG;
  if (Math.hypot(x, y) < LOCK) return null;
  return (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
}
/**
 * Heading of the top edge of the screen, degrees clockwise from north, taken from the spec's rotation matrix.
 * @param alpha device orientation alpha, degrees
 * @param beta device orientation beta, degrees
 * @returns heading in [0, 360), or null within ~9° of upright
 */
export function screenHeadingDeg(alpha, beta) {
  const r = Math.PI / 180, cB = Math.cos(beta * r);
  const x = -Math.sin(alpha * r) * cB;
  const y = Math.cos(alpha * r) * cB;
  if (Math.abs(cB) < LOCK) return null;
  return (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
}

/**
 * The heading a hand-held compass should show at any pitch: screen-top while flat, camera axis while upright, crossfaded between.
 * @param alpha device orientation alpha, degrees
 * @param beta device orientation beta, degrees
 * @param gamma device orientation gamma, degrees
 * @param screenAngle screen.orientation.angle, applied to the screen-top term only
 * @returns heading in [0, 360); never null while β/γ are numbers
 */
export function heldHeadingDeg(alpha, beta, gamma, screenAngle = 0) {
  const flat = screenHeadingDeg(alpha, beta);
  const look = lookHeadingDeg(alpha, beta, gamma);
  const ui = flat == null ? null : (flat + screenAngle) % 360;
  if (look == null) return ui;
  if (ui == null) return look;
  const k = Math.abs(Math.cos(beta * Math.PI / 180));
  if (k >= FLAT) return ui;
  const t = k <= LOCK ? 1 : (FLAT - k) / (FLAT - LOCK);
  const w = t * t * (3 - 2 * t);
  const d = ((look - ui + 540) % 360) - 180;
  return (ui + w * d + 360) % 360;
}

/** Compass heading in degrees clockwise from TRUE north — `request()` for the gesture-gated permission, `start(onHeading, opts)` → stop fn. */
export const compass = {
  supported: typeof window !== "undefined" && typeof DeviceOrientationEvent !== "undefined",
  needsPermission: typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function",
  async request() {
    if (this.needsPermission) { try { return (await DeviceOrientationEvent.requestPermission()) === "granted"; } catch { return false; } }
    return true;
  },
  start(onHeading, { trueNorth = true, look = false } = {}) {
    if (!this.supported) return () => {};
    let ema = null, dec = null, wmm = null, stopGeo = () => {};
    let geoState = geo.supported ? "pending" : "unsupported";

    if (trueNorth && geo.supported) {
      stopGeo = geo.watch(async (p) => {
        try {
          wmm = wmm || await import("./geomag.js");
          const y = wmm.decimalYear();
          dec = wmm.inRange(y) ? wmm.declination(p.lat, p.lng, (p.altitude || 0) / 1000, y) : null;
          geoState = "ok";
        } catch { dec = null; geoState = "ok"; }
      }, (e) => { dec = null; geoState = e === "denied" ? "denied" : "unavailable"; },
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 20000 });
    }

    const handler = (e) => {
      const ang = (screen.orientation && screen.orientation.angle) || 0;
      const tilt = typeof e.beta === "number" && typeof e.gamma === "number";
      let h = null;
      if (typeof e.webkitCompassHeading === "number") {
        h = look ? e.webkitCompassHeading : (e.webkitCompassHeading + ang) % 360;
      } else if (e.absolute && typeof e.alpha === "number") {
        if (look) h = tilt ? lookHeadingDeg(e.alpha, e.beta, e.gamma) : (360 - e.alpha) % 360;
        else h = tilt ? heldHeadingDeg(e.alpha, e.beta, e.gamma, ang) : (360 - e.alpha + ang) % 360;
      }
      if (h == null) return;
      if (ema == null) ema = h;
      else { const d = ((h - ema + 540) % 360) - 180; ema = (ema + 0.25 * d + 360) % 360; }
      onHeading(wmm ? wmm.trueFrom(ema, dec) : ema, { magnetic: ema, declination: dec, isTrue: dec != null, geo: geoState });
    };
    const evt = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
    window.addEventListener(evt, handler, true);
    return () => { stopGeo(); window.removeEventListener(evt, handler, true); };
  },
};

/** Raw device pitch/roll (β/γ, degrees) for parallax — `request()` shares the compass permission, `start(onTilt)` → stop fn. */
export const tilt = {
  supported: typeof window !== "undefined" && typeof DeviceOrientationEvent !== "undefined",
  needsPermission: typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function",
  async request() {
    if (this.needsPermission) { try { return (await DeviceOrientationEvent.requestPermission()) === "granted"; } catch { return false; } }
    return true;
  },
  start(onTilt) {
    if (!this.supported) return () => {};
    const handler = (e) => {
      let beta = typeof e.beta === "number" ? e.beta : null, gamma = typeof e.gamma === "number" ? e.gamma : null;
      const a = (screen.orientation && screen.orientation.angle) || 0;
      if (a === 90 || a === 270) { const b = beta; beta = gamma; gamma = b == null ? null : -b; }
      onTilt({ beta, gamma });
    };
    window.addEventListener("deviceorientation", handler, true);
    return () => window.removeEventListener("deviceorientation", handler, true);
  },
};

/** A live camera stream on a <video> — `start(videoEl, onErr, opts)` → stop fn that releases every track. */
export const camera = {
  supported: typeof navigator !== "undefined" && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
  async start(video, onErr, { facingMode = "environment", constraints = null } = {}) {
    if (!this.supported) { onErr?.("unsupported"); return () => {}; }
    let stream = null, stopped = false;
    const open = (bare) => navigator.mediaDevices.getUserMedia({ video: bare ? { facingMode } : { facingMode, ...(constraints || {}) }, audio: false });
    try {
      try { stream = await open(); }
      catch (e) {
        if (!e || !/NotReadableError|AbortError|OverconstrainedError/.test(e.name)) throw e;
        await new Promise((r) => setTimeout(r, RELEASE_MS));
        if (stopped) return () => {};
        stream = await open(true);
      }
      if (stopped) { stream.getTracks().forEach((tr) => tr.stop()); return () => {}; }
      if (video) { video.srcObject = stream; video.setAttribute?.("playsinline", ""); try { await video.play?.(); } catch { } }
    } catch (e) {
      onErr?.(e && e.name === "NotAllowedError" ? "denied" : "unavailable");
      return () => {};
    }
    return () => {
      stopped = true;
      try { stream?.getTracks().forEach((tr) => tr.stop()); } catch { }
      try { if (video && video.srcObject === stream) video.srcObject = null; } catch { }
    };
  },
  /**
   * Live controls over the running track of a `<video>` that `start` attached: the torch, a zoom, a focus point —
   * the three gestures every mirror wants. Nothing is guessed: `caps` says what the track declares.
   * @param video the element `start` attached the stream to
   * @returns see {@link camControls}
   */
  controls(video) { return camControls(video?.srcObject?.getVideoTracks?.()[0] || null); },
};
/** How long a stopped camera keeps its hardware on Android before the other one can open (measured ~300 ms). */
const RELEASE_MS = 350;

/**
 * Controls over one video track (pure over `getCapabilities` / `applyConstraints`, so a fake track tests it).
 * `caps.torch` — the LED exists; `caps.zoom` — `{ min, max, step, now }` or null; `caps.focus` — the track takes a
 * focus mode. `torch(on)`, `zoom(z)` (clamped to the range) and `focusAt(x, y)` (0..1 from the top-left; tries
 * single-shot at the point, then single-shot alone, then continuous) each resolve true when applied, false when the
 * track lacks it or refuses — a button that shows only on `caps` never has to handle a rejection.
 * @param track a `MediaStreamTrack` of kind video, or null
 * @returns `{ caps, torch, zoom, focusAt }`
 */
export function camControls(track) {
  const c = (() => { try { return track?.getCapabilities?.() || {}; } catch { return {}; } })();
  const s = (() => { try { return track?.getSettings?.() || {}; } catch { return {}; } })();
  const modes = Array.isArray(c.focusMode) ? c.focusMode : [];
  const zoom = c.zoom && typeof c.zoom.max === "number" && c.zoom.max > (c.zoom.min ?? 1)
    ? { min: c.zoom.min ?? 1, max: c.zoom.max, step: c.zoom.step || 0.1, now: s.zoom ?? c.zoom.min ?? 1 } : null;
  const caps = { torch: !!c.torch, zoom, focus: modes.includes("single-shot") || modes.includes("continuous") };
  const apply = async (adv) => { if (!track?.applyConstraints) return false; try { await track.applyConstraints({ advanced: [adv] }); return true; } catch { return false; } };
  return {
    caps,
    torch: (on) => caps.torch ? apply({ torch: !!on }) : Promise.resolve(false),
    zoom: (z) => zoom ? apply({ zoom: Math.min(zoom.max, Math.max(zoom.min, Number(z) || zoom.min)) }) : Promise.resolve(false),
    focusAt: async (x, y) => {
      if (!caps.focus) return false;
      const pt = { x: Math.min(1, Math.max(0, Number(x) || 0)), y: Math.min(1, Math.max(0, Number(y) || 0)) };
      if (modes.includes("single-shot")) {
        if (await apply({ focusMode: "single-shot", pointsOfInterest: [pt] })) return true;
        if (await apply({ focusMode: "single-shot" })) return true;
      }
      return modes.includes("continuous") ? apply({ focusMode: "continuous" }) : false;
    },
  };
}

/** Recorder MIME types to try, in preference order. */
export const MIC_MIMES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
const MIC_CONSTRAINTS = { audio: { channelCount: { ideal: 1 }, echoCancellation: { ideal: false }, noiseSuppression: { ideal: false }, autoGainControl: { ideal: false } }, video: false };
const micErr = (e) => {
  const n = e && e.name;
  if (n === "NotAllowedError" || n === "SecurityError") return "denied";
  if (n === "NotFoundError" || n === "NotReadableError" || n === "OverconstrainedError") return "unavailable";
  return "error";
};

/** A short microphone take — `mime()` picks a supported type, `record(opts)` → { done, stop, cancel }. */
export const mic = {
  supported: typeof navigator !== "undefined" && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && typeof MediaRecorder !== "undefined",
  mime() { try { return MIC_MIMES.find((m) => MediaRecorder.isTypeSupported?.(m)) || ""; } catch { return ""; } },
  /**
   * Record one take from the microphone.
   * @param {object} [opts]
   * @param [opts.seconds] take length (default 2)
   * @param [opts.timeoutMs] give up waiting for the stream after this long (default 10000)
   * @param [opts.bitsPerSecond] encoder bitrate (default 128000)
   * @param [opts.onStream] called with the live MediaStream once it is granted
   * @param [opts.onErr] called with a short reason string ("denied", "unavailable", "unsupported", "error")
   * @returns `{ done, stop, cancel }` — `done` resolves to `{ blob, mime, settings }` or null
   */
  record({ seconds = 2, timeoutMs = 10000, bitsPerSecond = 128000, onStream, onErr } = {}) {
    if (!this.supported) { onErr?.("unsupported"); return { done: Promise.resolve(null), stop() {}, cancel() {} }; }
    let stream = null, rec = null, take = 0, dead = false, settle = null;
    const done = new Promise((res) => { settle = res; });
    const finish = (v) => {
      if (dead) return;
      dead = true; clearTimeout(take);
      try { stream?.getTracks().forEach((tr) => tr.stop()); } catch { }
      stream = null; settle(v);
    };
    const fail = (kind) => { onErr?.(kind); finish(null); };
    const guard = setTimeout(() => fail("timeout"), timeoutMs);
    navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS).then((s) => {
      clearTimeout(guard);
      if (dead) { s.getTracks().forEach((tr) => tr.stop()); return; }
      stream = s; onStream?.(s);
      const mime = this.mime(), chunks = [];
      try { rec = new MediaRecorder(s, mime ? { mimeType: mime, audioBitsPerSecond: bitsPerSecond } : { audioBitsPerSecond: bitsPerSecond }); }
      catch { fail("error"); return; }
      const settings = () => { try { return s.getAudioTracks()[0]?.getSettings?.() || {}; } catch { return {}; } };
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onerror = () => fail("error");
      rec.onstop = () => finish(chunks.length ? { blob: new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" }), mime: rec.mimeType || mime, settings: settings() } : null);
      try { rec.start(); } catch { fail("error"); return; }
      take = setTimeout(() => { try { if (rec.state !== "inactive") rec.stop(); } catch { finish(null); } }, seconds * 1000);
    }).catch((e) => { clearTimeout(guard); fail(micErr(e)); });
    const halt = (keep) => {
      clearTimeout(guard);
      if (rec && keep) { try { if (rec.state !== "inactive") { rec.stop(); return; } } catch { } }
      try { if (rec && rec.state !== "inactive") rec.stop(); } catch { }
      finish(null);
    };
    return { done, stop: () => halt(true), cancel: () => halt(false) };
  },
};
