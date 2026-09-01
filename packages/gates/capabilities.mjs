/* @ts-self-types="./capabilities.d.mts" */
/**
 * The capability gate: `spec.json`'s `needs` must match what the app's own source actually reaches for,
 * measured by the named gateway symbols it imports (`SYMBOL_CAPS`) and raw browser calls (`RAW_CAPS`),
 * with the compass trueNorth opt-out read rather than assumed. Exports the pure `importedNames` and
 * `capabilitiesOf` plus the per-app `scanApp`; run as a script it reports every mismatch in the farm and
 * `--check` exits 1 on any.
 * @module
 */
// microspec — the capability gate. `spec.json`'s `needs` must match what the app actually reaches for.
//
//   deno run -A packages/gates/capabilities.mjs            # report
//   deno run -A packages/gates/capabilities.mjs --check     # exit 1 on any mismatch (the 8n8 node)
//
// Why this exists: `needs` was inert. Exactly one place in the farm read it — packages/runtime/validate.js
// asserts it is an array — while the schema's own description claimed it "drives permission priming".
// Nothing did. So it drifted: six apps opened a WebUSB device and none declared it, `air` used geolocation
// undeclared, `sun` declared geo and also consumed compass. Make it TRUE first; only then is it safe to
// make it functional (priming, a store affordance, the Android shell's permission set), because wiring a
// wrong field into the permission surface ships the drift.
//
// THE MEASUREMENT, and the two wrong versions it took to get here — both caught by dry-running the whole
// farm before this was ever fatal:
//
//  v1  "the app's import closure contains navigator.geolocation" → 30 apps flagged, including `habits`,
//      a habit tracker. Wrong because /_rt/sensors.js holds EVERY sensor API in one module, so importing
//      it at all looked like using all of them. A signal that fires on a habit tracker measures nothing.
//  v2  "which named gateway does the app import" — right idea, still wrong twice over:
//      · haptic is SYSTEMIC. index.js delegates one pointerdown listener for the whole farm and
//        hapticFor() decides ("An app writes nothing"). Every app with a button has haptics, so declaring
//        it says nothing. It is a runtime property, not an app capability — and it is absent here.
//      · a gateway is TRANSITIVE: compass.start() defaults to trueNorth and watches geolocation inside to
//        fetch a declination. But `handpan` and `rave` pass { trueNorth: false } precisely to avoid that,
//        so charging them a geo declaration would demand a permission they went out of their way not to
//        need. The opt-out is read here.

const ROOT = Deno.cwd(); // the apps it audits live in the CONSUMER's tree, never in the package
const read = (p) => { try { return Deno.readTextFileSync(`${ROOT}/${p}`); } catch { return null; } };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// imported symbol → the capabilities it actually reaches for
/** Runtime module → imported symbol → the capabilities that symbol reaches for (`"*"` = any import of the module). */
export const SYMBOL_CAPS = {
  "/_rt/sensors.js": {
    geo: ["geo"], camera: ["camera"], mic: ["microphone"],
    compass: ["compass", "orientation"], tilt: ["orientation"], wakeLock: ["wakeLock"],
  },
  "/_rt/camprime.js": { CameraPrime: ["camera"], MicPrime: ["microphone"] },
  "/_rt/auth.js": { "*": ["auth"] },
  "/_rt/hackrf.js": { "*": ["usb"] },
};

// raw calls in the app's own files — an app reaching past the runtime still declares the capability
/** Capability → regex matching a raw browser API call in the app's own source. */
export const RAW_CAPS = {
  usb: /navigator\.usb\b/,
  geo: /navigator\.geolocation\b/,
  wakeLock: /navigator\.wakeLock\b/,
  camera: /getUserMedia\s*\(\s*\{[^}]*video\s*:/s,
  microphone: /getUserMedia\s*\(\s*\{[^}]*audio\s*:/s,
  orientation: /DeviceOrientationEvent\b|["']deviceorientation["']/,
  motion: /DeviceMotionEvent\b|["']devicemotion["']/,
};

// The names imported from one module. Pure, so it is testable without a filesystem.
/**
 * The names an app source imports from one module specifier; `"*"` is added whenever the module is imported at all.
 * @param src JavaScript source text
 * @param moduleSpec the exact module specifier, e.g. "/_rt/sensors.js"
 * @returns a Set of imported names
 */
export function importedNames(src, moduleSpec) {
  const names = new Set();
  const re = new RegExp(`import\\s*(?:[\\w$]+\\s*,\\s*)?\\{([^}]*)\\}\\s*from\\s*["']${esc(moduleSpec)}["']`, "g");
  for (const m of src.matchAll(re)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name) names.add(name);
    }
  }
  if (new RegExp(`from\\s*["']${esc(moduleSpec)}["']`).test(src)) names.add("*");
  return names;
}

// Everything one app's own source reaches for. `src` is the app's .js files concatenated.
/**
 * Every capability one app's own source reaches for, via gateway imports and raw browser calls.
 * @param src the app's .js files concatenated
 * @returns a Set of capability ids (geo, camera, microphone, compass, orientation, motion, wakeLock, usb, auth)
 */
export function capabilitiesOf(src) {
  const used = new Set();
  for (const [mod, map] of Object.entries(SYMBOL_CAPS)) {
    const names = importedNames(src, mod);
    for (const [sym, caps] of Object.entries(map)) if (names.has(sym)) caps.forEach((c) => used.add(c));
  }
  for (const [cap, re] of Object.entries(RAW_CAPS)) if (re.test(src)) used.add(cap);
  // the trueNorth opt-out, read rather than assumed
  if (used.has("compass") && !/trueNorth\s*:\s*false/.test(src)) used.add("geo");
  return used;
}

/**
 * Audit one app under apps/<id>: compare the capabilities its code uses against the `needs` its spec.json declares.
 * @param id the app directory name
 * @returns `{ id, missing, stale }` — used but undeclared, and declared but unused, both sorted
 */
export function scanApp(id) {
  let src = "";
  for (const f of Deno.readDirSync(`${ROOT}/apps/${id}`)) {
    // e2e drives the app from outside and sw.js is generated — neither is the app reaching for hardware
    if (f.isFile && /\.(js|mjs)$/.test(f.name) && f.name !== "e2e.spec.mjs" && f.name !== "sw.js") {
      src += (read(`apps/${id}/${f.name}`) ?? "") + "\n";
    }
  }
  const spec = JSON.parse(read(`apps/${id}/spec.json`));
  const declared = new Set((spec.tabs ?? []).flatMap((t) => t.needs ?? []));
  const used = capabilitiesOf(src);
  return {
    id,
    missing: [...used].filter((c) => !declared.has(c)).sort(),
    stale: [...declared].filter((c) => !used.has(c)).sort(),
  };
}

if (import.meta.main) {
  const check = Deno.args.includes("--check");
  const ids = [];
  for (const e of Deno.readDirSync(`${ROOT}/apps`)) {
    if (e.isDirectory && read(`apps/${e.name}/spec.json`)) ids.push(e.name);
  }
  ids.sort();

  const bad = [];
  for (const id of ids) {
    const r = scanApp(id);
    if (r.missing.length || r.stale.length) bad.push(r);
  }
  // Name every app AND every capability, so one run returns the whole work list rather than a count.
  for (const r of bad) {
    const parts = [];
    if (r.missing.length) parts.push(`undeclared: ${r.missing.join(", ")}`);
    if (r.stale.length) parts.push(`declared but unused: ${r.stale.join(", ")}`);
    console.log(`✗ ${r.id.padEnd(12)} ${parts.join("  ·  ")}`);
  }
  console.log(bad.length
    ? `\n${bad.length} of ${ids.length} apps declare capabilities that do not match their code.`
    : `✓ capabilities: ${ids.length} apps, every spec.json needs matches its call sites.`);
  if (check && bad.length) Deno.exit(1);
}
