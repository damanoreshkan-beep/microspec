// radar — the uncertainty volume.
//
// This scene deliberately does NOT plot positions, because the phone does not know any. A passive BLE or
// Wi-Fi sighting yields exactly one scalar (RSSI) and no angle: no public stock-Android API returns a
// bearing, and RSSI is not a metric distance (apps/radar/RESEARCH.md). So the geometry shows what we
// actually hold:
//   · radius      — the measured strength band. Real: it is dBm.
//   · a full RING — every bearing is still possible, so the device occupies all of them. Nothing is
//                   pinned, so nothing is invented.
//   · an ARC      — the part of the circle a sweep has actually favoured (packages/runtime/df.js).
//   · a MARK      — only once df.js's concentration and coverage gates say the bearing was earned.
// Height is not a data axis: there is no elevation information anywhere in a scan, so nothing is placed
// by altitude. The dome is the enclosure the rings sit in.
//
// Follows reference_webgl_threejs_in_farm as homin/handpan/rave do: three is LAZY-imported inside the
// effect and init is PROBE-guarded on getContext("webgl") — NOT gate-guarded — so CI's headless Chrome
// renders the real scene into the shots, while preflight's linkedom fails the probe and the DOM fallback
// in view.js stays the whole picture. The fallback always owns data-mark, the labels and the tap targets,
// so e2e and a11y never depend on WebGL existing.
//
// Colours are READ FROM CSS and re-read on a data-theme mutation: a WebGL scene cannot use a DaisyUI
// class, but it must still flip with the theme rather than bake one.

const SEG = 96;                      // ring resolution; 96 keeps a 3.75-degree arc step visible
const R_MIN = 0.18, R_MAX = 1.0;     // the innermost ring never collapses onto the viewer at the centre
const reducedMotion = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function hasWebGL() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); }
  catch { return false; }
}

function readTheme() {
  try {
    const cs = getComputedStyle(document.documentElement);
    const ink = cs.getPropertyValue("--color-base-content").trim() || "#ECECEE";
    const accent = cs.getPropertyValue("--app-accent").trim() || "#D9548E";
    const dt = document.documentElement.getAttribute("data-theme");
    const dark = dt ? dt !== "light" : (typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches);
    return { ink, accent, dark };
  } catch { return { ink: "#ECECEE", accent: "#D9548E", dark: true }; }
}

/**
 * mount(canvas, getState) -> stop()
 *
 * `getState()` is polled per frame and returns:
 *   { heading, pitch, devices: [{ key, radius, pulse, petal, bearing, target }] }
 * where `radius` is 0..1 (strength), `petal` is an optional Float32Array of per-bin evidence, `bearing`
 * is a resolved degrees-from-north or null, and `pulse` is a timestamp of the last sighting.
 */
export async function mount(canvas, getState) {
  if (!canvas || !hasWebGL()) return () => {};
  let THREE;
  try { THREE = await import("three"); } catch { return () => {}; }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 40);
  // The world spins under a fixed camera, so "north" is a property of the SCENE and the phone is a window
  // into it. Rotating the camera instead would make the compass mark drift against its own rings.
  const world = new THREE.Group();
  scene.add(world);

  let theme = readTheme();
  const col = (hex) => new THREE.Color(hex);
  const mk = (c, o) => new THREE.LineBasicMaterial({ color: col(c), transparent: true, opacity: o });

  const mats = {
    ring: mk(theme.ink, 0.22),
    arc: mk(theme.accent, 0.85),
    mark: mk(theme.accent, 1),
    grid: mk(theme.ink, 0.1),
    dome: mk(theme.ink, 0.07),
  };

  // ── the enclosure: horizon grid + dome meridians, drawn once ──────────────────────────────────────
  const enclosure = new THREE.Group();
  for (const r of [0.34, 0.67, 1.0]) {
    const pts = [];
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    enclosure.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mats.grid));
  }
  for (let m = 0; m < 8; m++) {
    const a = (m / 8) * Math.PI * 2, pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = (i / 16) * (Math.PI / 2);
      pts.push(new THREE.Vector3(Math.cos(a) * Math.cos(t), Math.sin(t) * 0.62, Math.sin(a) * Math.cos(t)));
    }
    enclosure.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mats.dome));
  }
  // North is a real direction the compass gives us, so it gets a mark the rings can be read against.
  const north = [];
  for (let i = 0; i <= 8; i++) north.push(new THREE.Vector3(0, 0, -1.02 - (i % 2) * 0.06));
  enclosure.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(north), mats.arc));
  world.add(enclosure);

  const shells = new Map();   // key -> { ring, arc, mark, group }

  function ringPoints(r, from, to) {
    const pts = [];
    const steps = Math.max(2, Math.round(((to - from) / (Math.PI * 2)) * SEG));
    for (let i = 0; i <= steps; i++) {
      const a = from + ((to - from) * i) / steps;
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    return pts;
  }

  function shellFor(key) {
    let s = shells.get(key);
    if (s) return s;
    const group = new THREE.Group();
    const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPoints(1, 0, Math.PI * 2)), mats.ring.clone());
    const arc = new THREE.Line(new THREE.BufferGeometry(), mats.arc.clone());
    // The resolved bearing: a short radial spur, not a dot — a dot at this scale reads as noise.
    const mark = new THREE.Line(new THREE.BufferGeometry(), mats.mark.clone());
    group.add(ring, arc, mark);
    world.add(group);
    s = { group, ring, arc, mark };
    shells.set(key, s);
    return s;
  }

  const setPts = (line, pts) => {
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  };

  let stopped = false, raf = 0;
  const obs = new MutationObserver(() => {
    theme = readTheme();
    mats.ring.color = col(theme.ink); mats.grid.color = col(theme.ink); mats.dome.color = col(theme.ink);
    mats.arc.color = col(theme.accent); mats.mark.color = col(theme.accent);
    for (const s of shells.values()) {
      s.ring.material.color = col(theme.ink);
      s.arc.material.color = col(theme.accent);
      s.mark.material.color = col(theme.accent);
    }
  });
  try { obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] }); } catch { /* linkedom */ }

  function resize() {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    if (canvas.width !== w || canvas.height !== h) renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function frame(now) {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    const st = getState() || {};
    resize();

    // Looking down onto the horizon plane from just above the viewer's own position.
    const pitch = 0.62 + (st.pitch || 0) * 0.12;
    camera.position.set(0, Math.sin(pitch) * 2.6, Math.cos(pitch) * 2.6);
    camera.lookAt(0, 0, 0);
    // Counter-rotate the world so a scene direction stays put while the phone turns.
    world.rotation.y = ((st.heading || 0) * Math.PI) / 180;

    const live = new Set();
    for (const d of st.devices || []) {
      live.add(d.key);
      const s = shellFor(d.key);
      const r = R_MIN + (R_MAX - R_MIN) * Math.max(0, Math.min(1, d.radius));
      setPts(s.ring, ringPoints(r, 0, Math.PI * 2));

      // A fresh advertisement is a real event, so it is the only thing that animates. A rotating sweep
      // line would imply the scan has a direction, and it does not.
      const age = d.pulse ? now - d.pulse : 1e9;
      const pulse = reducedMotion ? 0 : Math.max(0, 1 - age / 900);
      const base = d.target ? 0.5 : 0.22;
      s.ring.material.opacity = base + pulse * 0.45;

      // The arc is the evidence: the contiguous span of the sweep whose strength beats the mean. Absent a
      // sweep there is no arc at all — an unhunted device is a complete ring, which is the honest shape.
      if (d.petal && d.petal.length) {
        const n = d.petal.length;
        let mean = 0;
        for (let i = 0; i < n; i++) mean += d.petal[i];
        mean /= n || 1;
        let best = -1, bestLen = 0, run = -1, runLen = 0;
        for (let i = 0; i < n * 2; i++) {
          if (d.petal[i % n] > mean) {
            if (run < 0) { run = i; runLen = 0; }
            runLen++;
            if (runLen > bestLen) { bestLen = runLen; best = run; }
          } else run = -1;
        }
        if (best >= 0 && bestLen < n) {
          const from = ((best / n) * Math.PI * 2), to = from + (bestLen / n) * Math.PI * 2;
          setPts(s.arc, ringPoints(r, from, to));
          s.arc.material.opacity = 0.9;
        } else s.arc.material.opacity = 0;
      } else s.arc.material.opacity = 0;

      if (d.bearing == null) s.mark.material.opacity = 0;
      else {
        const a = (d.bearing * Math.PI) / 180;
        setPts(s.mark, [
          new THREE.Vector3(Math.cos(a) * (r - 0.07), 0, Math.sin(a) * (r - 0.07)),
          new THREE.Vector3(Math.cos(a) * (r + 0.07), 0, Math.sin(a) * (r + 0.07)),
        ]);
        s.mark.material.opacity = 1;
      }
    }
    for (const [key, s] of shells) {
      if (live.has(key)) continue;
      world.remove(s.group);
      s.ring.geometry.dispose(); s.arc.geometry.dispose(); s.mark.geometry.dispose();
      shells.delete(key);
    }
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    try { obs.disconnect(); } catch { /* never observed */ }
    for (const s of shells.values()) { s.ring.geometry.dispose(); s.arc.geometry.dispose(); s.mark.geometry.dispose(); }
    shells.clear();
    try { renderer.dispose(); } catch { /* context already lost */ }
  };
}
