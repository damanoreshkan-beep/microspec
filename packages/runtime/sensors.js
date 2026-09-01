/* @ts-self-types="./sensors.d.ts" */
/**
 * Hardware capability layer — one uniform shape per capability (`supported` plus methods that no-op when
 * unavailable) so views can feature-detect and degrade. Exports `haptic` / `hapticFor`, `geo`, `wakeLock`,
 * `compass` with its pure heading projections (`lookHeadingDeg`, `screenHeadingDeg`, `heldHeadingDeg`),
 * `tilt`, `camera`, and `mic` / `MIC_MIMES`.
 * @module
 */

const canVibrate = typeof navigator !== "undefined" && "vibrate" in navigator;

/** Short vibration feedback — `buzz(pattern)`, `tick`, `bump`, `ok`; a silent no-op where unsupported. */
export const haptic = {
  supported: canVibrate,
  buzz: (pattern) => { try { if (canVibrate) navigator.vibrate(pattern); } catch {  } },
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
        try { sentinel?.release(); } catch {  }
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
  async start(video, onErr, { facingMode = "environment" } = {}) {
    if (!this.supported) { onErr?.("unsupported"); return () => {}; }
    let stream = null, stopped = false;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false });
      if (stopped) { stream.getTracks().forEach((tr) => tr.stop()); return () => {}; } 
      if (video) { video.srcObject = stream; video.setAttribute?.("playsinline", ""); try { await video.play?.(); } catch {  } }
    } catch (e) {
      onErr?.(e && e.name === "NotAllowedError" ? "denied" : "unavailable");
      return () => {};
    }
    return () => {
      stopped = true;
      try { stream?.getTracks().forEach((tr) => tr.stop()); } catch {  }
      try { if (video) video.srcObject = null; } catch {  }
    };
  },
};

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
      try { stream?.getTracks().forEach((tr) => tr.stop()); } catch {  }
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
      if (rec && keep) { try { if (rec.state !== "inactive") { rec.stop(); return; } } catch {  } }
      try { if (rec && rec.state !== "inactive") rec.stop(); } catch {  }
      finish(null);
    };
    return { done, stop: () => halt(true), cancel: () => halt(false) };
  },
};
