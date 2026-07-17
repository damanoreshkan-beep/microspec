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
};

// compass — cross-platform magnetic heading (0..360 from north). iOS webkitCompassHeading (needs a
// gesture-gated permission); Android deviceorientationabsolute (360−alpha). Screen-orientation corrected,
// circular-EMA smoothed. start(onHeading) returns a stop fn; request() prompts on iOS.
export const compass = {
  supported: typeof window !== "undefined" && typeof DeviceOrientationEvent !== "undefined",
  needsPermission: typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function",
  async request() {
    if (this.needsPermission) { try { return (await DeviceOrientationEvent.requestPermission()) === "granted"; } catch { return false; } }
    return true;
  },
  start(onHeading) {
    if (!this.supported) return () => {};
    let ema = null;
    const handler = (e) => {
      let h = null;
      if (typeof e.webkitCompassHeading === "number") h = e.webkitCompassHeading;      // iOS: from north, clockwise
      else if (e.absolute && typeof e.alpha === "number") h = (360 - e.alpha) % 360;    // Android: absolute
      if (h == null) return;
      h = (h + ((screen.orientation && screen.orientation.angle) || 0)) % 360;          // screen-orientation correction
      if (ema == null) ema = h;
      else { const d = ((h - ema + 540) % 360) - 180; ema = (ema + 0.25 * d + 360) % 360; } // circular EMA
      onHeading(ema);
    };
    const evt = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
    window.addEventListener(evt, handler, true);
    return () => window.removeEventListener(evt, handler, true);
  },
};
