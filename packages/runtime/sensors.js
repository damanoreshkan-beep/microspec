// microspec runtime — hardware capability layer. Uniform shape per capability so tool views can
// feature-detect and degrade: each exposes `supported` + methods that no-op when unavailable.
// Hardware needs a secure context (https/localhost); the headless gate has none, so views must
// render without live readings (structure/permission-state only).

const canVibrate = typeof navigator !== "undefined" && "vibrate" in navigator;

// haptic — short vibration feedback (buzz/tick/bump). Silent no-op where unsupported.
export const haptic = {
  supported: canVibrate,
  buzz: (pattern) => { try { if (canVibrate) navigator.vibrate(pattern); } catch { /* denied */ } },
  tick: () => haptic.buzz(8),
  bump: () => haptic.buzz(18),
  ok: () => haptic.buzz([12, 40, 12]),
};

// Which haptic a tap on this element deserves — or none. Pure, so it is unit-tested rather than felt.
//
// Touch feedback is not a per-app flourish: an app where the dock buzzes and the buttons don't feels
// broken in a way nobody can name, and asking every view to remember haptic.tick() guarantees exactly
// that. So the runtime delegates one listener (index.js) and this decides. An app writes nothing.
//
//   data-haptic="off"  — opt out (an element that fires its own, or must stay silent)
//   data-haptic="bump" — opt up (destructive: clear, delete, reset)
//
// Typing is deliberately silent: a buzz per keystroke is a phone with a fault, not a tactile UI. Disabled
// controls are silent too — feedback for an action that will not happen is a lie you can feel.
const TAPPABLE = 'button, a[href], summary, label[for], select, input, textarea, [role="button"], [role="tab"], [role="switch"], [role="option"], [data-tab], [data-loc], .btn, .tab';
const QUIET_INPUT = /^(text|search|email|url|tel|password|number)$/;
export function hapticFor(el) {
  const t = el?.closest?.(TAPPABLE);
  if (!t) return null;
  // Both forms: preact sets `disabled` as a PROPERTY when the DOM has one, so the attribute can be absent
  // while the control is genuinely disabled — checking either alone misses half the cases.
  if (t.disabled === true || t.hasAttribute?.("disabled") || t.getAttribute?.("aria-disabled") === "true") return null;
  const want = t.getAttribute?.("data-haptic");
  if (want) return want === "off" ? null : want;
  const tag = (t.tagName || "").toLowerCase();
  // The ATTRIBUTE, not the property: an <input> with no type attribute really is a text field, but a
  // `.type` that failed to reflect would silence every checkbox and radio in the farm.
  const type = t.getAttribute?.("type") || t.type || "text";
  if (tag === "textarea" || (tag === "input" && QUIET_INPUT.test(type))) return null;
  if (t.classList?.contains("btn-error")) return "bump";
  return "tick";
}

// geo — geolocation as a callback watch. onErr("denied"|"unavailable"|"unsupported").
// opts override the PositionOptions — e.g. { enableHighAccuracy: true, maximumAge: 1000 } for a precise ruler.
//
// onPos gets every field the spec defines — {lat,lng,accuracy,altitude,altitudeAccuracy,heading,speed,t} —
// and that is the whole of it: there is no satellite count, no fix type, no HDOP and no raw GNSS anywhere
// in the web platform, so a view can never show them. `accuracy` is a 95% confidence radius in metres,
// which is what makes it arithmetic rather than a vibe (see /_rt/geofix.js).
// altitude/heading/speed are nullable by spec (heading is null whenever you are standing still) — we used
// to drop them on the floor here, which quietly made every consumer's `pos.altitude` undefined forever.
// `t` is the fix time, needed by anything that averages a series of fixes.
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
  // ONE fix, as a promise — for an adapter's load(), which runs once and has nowhere to put a subscription.
  // Rejects rather than hanging: a permission prompt the user ignores would otherwise leave the app on its
  // skeleton forever, and "no fix yet" is a state every caller here already has a fallback for.
  once(opts) {
    return new Promise((resolve, reject) => {
      let stop = null, done = false;
      // `stop?.()` and the trailing call are both load-bearing: the unsupported branch of watch() invokes
      // onErr SYNCHRONOUSLY, before it has returned the unsubscribe function, so a bare stop() there is a
      // TypeError on exactly the devices this is meant to degrade gracefully on.
      const finish = (fn, v) => { if (done) return; done = true; stop?.(); fn(v); };
      stop = this.watch((fix) => finish(resolve, fix), (err) => finish(reject, new Error(err)), opts);
      if (done) stop?.();
    });
  },
};

// wakeLock — keep the screen awake. `acquire()` → a handle with release(); no-op where unsupported.
//
// The OS blanks the screen on an idle timer, and "idle" means "no touches" — watching a film is idle by
// that definition. Every video app on the web needs this and it is not automatic: a <video> playing does
// NOT hold the screen on in a PWA.
//
// The sharp edge: the lock is released by the BROWSER whenever the page is hidden, and it does not come
// back on its own. Acquire once and the screen dies the first time the user checks a notification and
// returns — which looks exactly like "it works, sometimes". So the handle re-acquires on visibilitychange
// and stays alive until you release it.
export const wakeLock = {
  supported: typeof navigator !== "undefined" && "wakeLock" in navigator,
  acquire() {
    if (!this.supported) return { release: () => {}, supported: false };
    let sentinel = null, live = true;
    const take = async () => {
      if (!live || sentinel || document.visibilityState !== "visible") return;
      try { sentinel = await navigator.wakeLock.request("screen"); sentinel.addEventListener?.("release", () => { sentinel = null; }); }
      catch { sentinel = null; }                                   // denied / low battery — the film still plays
    };
    const onVis = () => { if (document.visibilityState === "visible") take(); };
    document.addEventListener("visibilitychange", onVis);
    take();
    return {
      supported: true,
      release() {
        live = false;
        document.removeEventListener("visibilitychange", onVis);
        try { sentinel?.release(); } catch { /* already gone */ }
        sentinel = null;
      },
    };
  },
};

// compass — which way you are facing, in degrees clockwise from TRUE north (0..360).
//
// True, not magnetic. The magnetometer points at the magnetic pole, which is not north and is not a fixed
// offset from it: the error is a function of where you stand and it drifts every year (~7-8° in Kyiv, past
// 20° in parts of Alaska). Anything that mixes a magnetic heading with a real-world bearing — a sun
// azimuth, a course, a map — is wrong by that angle. So the correction belongs to the capability, not to
// each app: `start` watches position alongside the magnetometer and applies the World Magnetic Model
// (./geomag.js) itself. An app that just wants a heading gets a true one by default and cannot forget to.
//
// Without a position there IS no declination — the model is a function of location — so a heading is
// magnetic until a fix arrives, and says so via meta rather than quietly passing itself off as true.
//
// iOS webkitCompassHeading (gesture-gated permission); Android deviceorientationabsolute, where the
// heading is PROJECTED from the orientation matrix, never read off α — see heldHeadingDeg.
// Screen-orientation corrected, circular-EMA smoothed.
//   start(onHeading, opts?) → stop fn. onHeading(deg, { magnetic, declination, isTrue }).
//   opts.trueNorth: false keeps it magnetic and starts no geolocation watch.
//   opts.look: true reads the BACK CAMERA's heading (viewfinder/AR apps) — see lookHeadingDeg.

// lookHeadingDeg — heading of the device −z axis (out the back of the screen), i.e. what the rear
// camera points at: R = Rz(α)·Rx(β)·Ry(γ) applied to (0,0,−1), per the W3C orientation-event
// worked example (§A.1). Raw alpha is only a heading while the phone lies flat-ish: held upright
// (β→90°) the α and γ axes coincide (gimbal lock) and the SAME orientation re-expresses with α
// jumped by hundreds of degrees — swarm's aim leapt 1°→−300° mid-turn on the reference device.
// The projected vector is invariant under that re-expression (unit-tested). Returns null within
// ~9° of straight up/down, where a camera heading does not exist — the caller holds the last one.
// An axis whose horizontal projection is shorter than LOCK has no heading left to report (~9° of
// straight up or down). Between FLAT and LOCK the screen-top axis is LOSING one: both numbers are
// horizontal lengths, so they read as pitch — FLAT is 60° off flat, LOCK ~81°.
const LOCK = 0.15, FLAT = 0.5;

export function lookHeadingDeg(alpha, beta, gamma) {
  const r = Math.PI / 180, cA = Math.cos(alpha * r), sA = Math.sin(alpha * r);
  const sB = Math.sin(beta * r), cG = Math.cos(gamma * r), sG = Math.sin(gamma * r);
  const x = -cA * sG - sA * sB * cG;                                   // east
  const y = -sA * sG + cA * sB * cG;                                   // north
  if (Math.hypot(x, y) < LOCK) return null;
  return (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
}
// screenHeadingDeg — heading of the device +y axis: the TOP EDGE OF THE SCREEN, which is what a dial,
// a rose or a needle actually means by "ahead". Taken from the spec's own rotation matrix instead of
// from α: R·ŷ = (−sinα·cosβ, cosα·cosβ, sinβ) (W3C orientation-event, the Z-X'-Y'' matrix), so east and
// north are BOTH scaled by cosβ — the horizontal length of that axis as the phone pitches up.
//
// Two things fall out of keeping that length instead of dividing it away, and the old `(360 − α)` had
// neither. It reduces to exactly (360 − α) while the phone is flat, so nothing changes in the grip these
// apps were written for. And |cosβ| IS the confidence: it goes to zero as the phone comes upright, which
// is where α stops being a heading at all — the same Euler axis it shares with γ (gimbal lock), so the
// sensor re-expresses one physical orientation with α hundreds of degrees away and γ absorbing it. That
// is the leap the owner sees (20° → −300°) and no amount of smoothing downstream can undo it, because
// the number arriving is not noisy, it is a different valid description of the same direction.
// Face-down (cosβ < 0) the top edge genuinely points behind you and this flips; (360 − α) never did.
export function screenHeadingDeg(alpha, beta) {
  const r = Math.PI / 180, cB = Math.cos(beta * r);
  const x = -Math.sin(alpha * r) * cB;                                 // east
  const y = Math.cos(alpha * r) * cB;                                  // north
  if (Math.abs(cB) < LOCK) return null;                                // within ~9° of upright: no heading
  return (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
}

// heldHeadingDeg — the heading a HAND-HELD compass should show, in the UI's frame, at any pitch. The
// default path for every dial in the farm.
//
// The screen-top axis answers while the phone is flat; the camera axis (lookHeadingDeg) answers while it
// is upright — and they are the same real-world direction, "away from the person holding it", so raising
// the phone is a handoff, not a switch of meaning. They cannot fail together: |h_y|² + |h_z|² =
// 1 + sin²γ·cos²β ≥ 1, so one of the two always keeps a horizontal length ≥ 0.707 and this never returns
// null. A compass that freezes when you lift it reads as broken exactly like one that jumps.
//
// The crossfade is not cosmetic. α's noise is amplified by 1/cosβ as the axes converge, so the band where
// the reading is merely GETTING bad is the band where weight has already moved to the camera — by 81° the
// screen-top term is gone. Only the screen-top term takes the screen-orientation correction: the camera
// does not turn when the UI does.
export function heldHeadingDeg(alpha, beta, gamma, screenAngle = 0) {
  const flat = screenHeadingDeg(alpha, beta);
  const look = lookHeadingDeg(alpha, beta, gamma);
  const ui = flat == null ? null : (flat + screenAngle) % 360;
  if (look == null) return ui;
  if (ui == null) return look;
  const k = Math.abs(Math.cos(beta * Math.PI / 180));
  if (k >= FLAT) return ui;
  const t = k <= LOCK ? 1 : (FLAT - k) / (FLAT - LOCK);
  const w = t * t * (3 - 2 * t);                                       // smoothstep: no kink at either end
  const d = ((look - ui + 540) % 360) - 180;                           // shortest way round
  return (ui + w * d + 360) % 360;
}

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
    // Why there is no declination, not just that there isn't one. A consumer showing "no position" when the
    // real reason is a denied permission — or a missing magnetometer — is telling the user something false,
    // and it would need its own second geolocation watch just to guess at it.
    let geoState = geo.supported ? "pending" : "unsupported";   // pending | ok | denied | unavailable | unsupported

    if (trueNorth && geo.supported) {
      // The model is ~2 KB of Gauss coefficients: imported only once a compass actually runs, so the apps
      // that merely import `haptic` from here never pay for it. Position is coarse on purpose — declination
      // varies by well under a degree over tens of km, so a cached city-level fix is plenty and there is no
      // reason to spin the GPS for it.
      stopGeo = geo.watch(async (p) => {
        try {
          wmm = wmm || await import("./geomag.js");
          const y = wmm.decimalYear();
          // Outside the model's window an extrapolated declination is a guess wearing a decimal point.
          dec = wmm.inRange(y) ? wmm.declination(p.lat, p.lng, (p.altitude || 0) / 1000, y) : null;
          geoState = "ok";
        } catch { dec = null; geoState = "ok"; }                                   // positioned, but model unreachable
      }, (e) => { dec = null; geoState = e === "denied" ? "denied" : "unavailable"; },
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 20000 });
    }

    const handler = (e) => {
      const ang = (screen.orientation && screen.orientation.angle) || 0;
      // Every projected path needs the tilt. Some low-end Android reports β/γ null, and there is nothing
      // to project from then — fall back to raw α, which is what this whole capability used to be.
      const tilt = typeof e.beta === "number" && typeof e.gamma === "number";
      let h = null;
      if (typeof e.webkitCompassHeading === "number") {
        // iOS hands back a heading, not Euler angles, and its behaviour upright cannot be checked from
        // here — left exactly as it was rather than "fixed" against a device nobody has run this on.
        h = look ? e.webkitCompassHeading : (e.webkitCompassHeading + ang) % 360;       // from north, clockwise
      } else if (e.absolute && typeof e.alpha === "number") {                           // Android: absolute
        if (look) h = tilt ? lookHeadingDeg(e.alpha, e.beta, e.gamma) : (360 - e.alpha) % 360;
        // The correction is applied INSIDE heldHeadingDeg — only its screen-top term earns it.
        else h = tilt ? heldHeadingDeg(e.alpha, e.beta, e.gamma, ang) : (360 - e.alpha + ang) % 360;
      }
      if (h == null) return;                                                            // look: near-vertical, hold last
      if (ema == null) ema = h;
      else { const d = ((h - ema + 540) % 360) - 180; ema = (ema + 0.25 * d + 360) % 360; } // circular EMA
      // Smooth the magnetometer, then correct — never the reverse: the EMA would drag a step change in
      // declination through the heading and swing the needle for no physical reason.
      onHeading(wmm ? wmm.trueFrom(ema, dec) : ema, { magnetic: ema, declination: dec, isTrue: dec != null, geo: geoState });
    };
    const evt = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
    window.addEventListener(evt, handler, true);
    return () => { stopGeo(); window.removeEventListener(evt, handler, true); };
  },
};

// tilt — raw device pitch/roll (β/γ, degrees) for parallax/immersion. Shares the SAME gesture-gated
// permission as `compass` (both ride DeviceOrientationEvent), so an app that already primed the compass need
// not ask twice — call either `request()`. Unlike compass this wants no true-north correction and no
// geolocation: it is relative motion, not a bearing. Screen-orientation aware so β/γ mean the same thing in
// portrait and landscape. The SMOOTHING + clamping lives in /_rt/spectrum.js `Parallax` (pure, unit-tested)
// — this only owns the hardware stream. Null β/γ on some low-end Android is normal: the consumer degrades.
//   start(onTilt) → stop fn.  onTilt({ beta, gamma }) — beta ≈ front/back pitch, gamma ≈ left/right roll.
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
      const a = (screen.orientation && screen.orientation.angle) || 0;                 // portrait/landscape swap
      if (a === 90 || a === 270) { const b = beta; beta = gamma; gamma = b == null ? null : -b; }
      onTilt({ beta, gamma });
    };
    window.addEventListener("deviceorientation", handler, true);
    return () => window.removeEventListener("deviceorientation", handler, true);
  },
};

// camera — a live video stream attached to a <video>, for apps that READ pixels (colour picker, scanner).
// Thin on purpose: it owns only the hardware lifecycle (permission → stream → release). Sampling the frame
// (canvas → getImageData) and the maths on those pixels belong to the app + /_rt/colour.js — the headless
// gate has no canvas, so a view must seed its reading from a pixel buffer, never from a live capture.
//
//   start(videoEl, onErr?, opts?) → stop fn.  onErr("denied" | "unavailable" | "unsupported").
//   opts.facingMode: "environment" (default, rear) | "user" (selfie).
// The stop fn releases the camera (stops every track) AND survives being called before the async open
// resolves — an unmount mid-permission must not leak a hot camera the moment the user grants it.
export const camera = {
  supported: typeof navigator !== "undefined" && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
  async start(video, onErr, { facingMode = "environment" } = {}) {
    if (!this.supported) { onErr?.("unsupported"); return () => {}; }
    let stream = null, stopped = false;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false });
      if (stopped) { stream.getTracks().forEach((tr) => tr.stop()); return () => {}; } // unmounted mid-open
      if (video) { video.srcObject = stream; video.setAttribute?.("playsinline", ""); try { await video.play?.(); } catch { /* autoplay quirk */ } }
    } catch (e) {
      onErr?.(e && e.name === "NotAllowedError" ? "denied" : "unavailable");
      return () => {};
    }
    return () => {
      stopped = true;
      try { stream?.getTracks().forEach((tr) => tr.stop()); } catch { /* already gone */ }
      try { if (video) video.srcObject = null; } catch { /* detached */ }
    };
  },
};

// mic — a SHORT take of the room, for apps that turn sound into material. Like `camera` it owns only the
// hardware lifecycle: prompt → stream → recorder → every track stopped. The maths on the samples belongs to
// the app + /_rt/grain.js, and the headless gate has no microphone, so a view seeds its sample instead.
//
// The shape is dictated by one documented fact: getUserMedia's promise can NEITHER resolve NOR reject if the
// user simply ignores the prompt (MDN). So the permission phase races a timeout, and a stream that arrives
// after we gave up is stopped on arrival — otherwise the OS mic indicator stays lit with nobody listening.
//
//   record({ seconds, timeoutMs, onStream, onErr }) → { done: Promise<{blob,mime,settings}|null>, stop(), cancel() }
//   onErr("unsupported" | "denied" | "unavailable" | "timeout" | "error");  stop() keeps the audio, cancel() drops it.
export const MIC_MIMES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
// `ideal`, never `exact`: a phone that cannot switch its DSP off answers exact:false with OverconstrainedError,
// and a processed sample beats no sample. Read the truth back with track.getSettings() — it is telemetry, not
// an error state. Left at the UA defaults, noise suppression gates away the very room tone this is here for.
const MIC_CONSTRAINTS = { audio: { channelCount: { ideal: 1 }, echoCancellation: { ideal: false }, noiseSuppression: { ideal: false }, autoGainControl: { ideal: false } }, video: false };
const micErr = (e) => {
  const n = e && e.name;
  if (n === "NotAllowedError" || n === "SecurityError") return "denied";
  if (n === "NotFoundError" || n === "NotReadableError" || n === "OverconstrainedError") return "unavailable";
  return "error";
};

export const mic = {
  supported: typeof navigator !== "undefined" && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && typeof MediaRecorder !== "undefined",
  mime() { try { return MIC_MIMES.find((m) => MediaRecorder.isTypeSupported?.(m)) || ""; } catch { return ""; } },
  record({ seconds = 2, timeoutMs = 10000, bitsPerSecond = 128000, onStream, onErr } = {}) {
    if (!this.supported) { onErr?.("unsupported"); return { done: Promise.resolve(null), stop() {}, cancel() {} }; }
    let stream = null, rec = null, take = 0, dead = false, settle = null;
    const done = new Promise((res) => { settle = res; });
    const finish = (v) => {
      if (dead) return;
      dead = true; clearTimeout(take);
      try { stream?.getTracks().forEach((tr) => tr.stop()); } catch { /* already gone */ }
      stream = null; settle(v);
    };
    const fail = (kind) => { onErr?.(kind); finish(null); };
    const guard = setTimeout(() => fail("timeout"), timeoutMs);
    navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS).then((s) => {
      clearTimeout(guard);
      if (dead) { s.getTracks().forEach((tr) => tr.stop()); return; }        // we gave up; do not leave it hot
      stream = s; onStream?.(s);
      const mime = this.mime(), chunks = [];
      try { rec = new MediaRecorder(s, mime ? { mimeType: mime, audioBitsPerSecond: bitsPerSecond } : { audioBitsPerSecond: bitsPerSecond }); }
      catch { fail("error"); return; }                                        // an unsupported MIME throws synchronously
      const settings = () => { try { return s.getAudioTracks()[0]?.getSettings?.() || {}; } catch { return {}; } };
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onerror = () => fail("error");
      rec.onstop = () => finish(chunks.length ? { blob: new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" }), mime: rec.mimeType || mime, settings: settings() } : null);
      try { rec.start(); } catch { fail("error"); return; }
      take = setTimeout(() => { try { if (rec.state !== "inactive") rec.stop(); } catch { finish(null); } }, seconds * 1000);
    }).catch((e) => { clearTimeout(guard); fail(micErr(e)); });
    const halt = (keep) => {
      clearTimeout(guard);
      if (rec && keep) { try { if (rec.state !== "inactive") { rec.stop(); return; } } catch { /* fall through */ } }
      try { if (rec && rec.state !== "inactive") rec.stop(); } catch { /* already stopped */ }
      finish(null);
    };
    return { done, stop: () => halt(true), cancel: () => halt(false) };
  },
};
