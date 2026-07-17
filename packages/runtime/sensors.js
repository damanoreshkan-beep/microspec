
const canVibrate = typeof navigator !== "undefined" && "vibrate" in navigator;

export const haptic = {
  supported: canVibrate,
  buzz: (pattern) => { try { if (canVibrate) navigator.vibrate(pattern); } catch {  } },
  tick: () => haptic.buzz(8),
  bump: () => haptic.buzz(18),
  ok: () => haptic.buzz([12, 40, 12]),
};

const TAPPABLE = 'button, a[href], summary, label[for], select, input, textarea, [role="button"], [role="tab"], [role="switch"], [role="option"], [data-tab], [data-loc], .btn, .tab';
const QUIET_INPUT = /^(text|search|email|url|tel|password|number)$/;
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

export const compass = {
  supported: typeof window !== "undefined" && typeof DeviceOrientationEvent !== "undefined",
  needsPermission: typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function",
  async request() {
    if (this.needsPermission) { try { return (await DeviceOrientationEvent.requestPermission()) === "granted"; } catch { return false; } }
    return true;
  },
  start(onHeading, { trueNorth = true } = {}) {
    if (!this.supported) return () => {};
    let ema = null, dec = null, wmm = null, stopGeo = () => {};

    if (trueNorth && geo.supported) {
      stopGeo = geo.watch(async (p) => {
        try {
          wmm = wmm || await import("./geomag.js");
          const y = wmm.decimalYear();
          dec = wmm.inRange(y) ? wmm.declination(p.lat, p.lng, (p.altitude || 0) / 1000, y) : null;
        } catch { dec = null; }                                                    
      }, () => { dec = null; }, { enableHighAccuracy: false, maximumAge: 300000, timeout: 20000 });
    }

    const handler = (e) => {
      let h = null;
      if (typeof e.webkitCompassHeading === "number") h = e.webkitCompassHeading;      
      else if (e.absolute && typeof e.alpha === "number") h = (360 - e.alpha) % 360;    
      if (h == null) return;
      h = (h + ((screen.orientation && screen.orientation.angle) || 0)) % 360;          
      if (ema == null) ema = h;
      else { const d = ((h - ema + 540) % 360) - 180; ema = (ema + 0.25 * d + 360) % 360; } 
      onHeading(wmm ? wmm.trueFrom(ema, dec) : ema, { magnetic: ema, declination: dec, isTrue: dec != null });
    };
    const evt = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
    window.addEventListener(evt, handler, true);
    return () => { stopGeo(); window.removeEventListener(evt, handler, true); };
  },
};
