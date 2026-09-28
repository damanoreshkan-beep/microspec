/* @ts-self-types="./capabilities.d.mts" */
/**
 * # caps — spec.json `needs` must match what the code actually reaches for
 *
 * The capability gate. An app declares its hardware in `tabs[].needs`; this measures what its own source
 * touches — the named gateway symbols it imports from the runtime ({@link SYMBOL_CAPS}) and raw browser
 * calls in its files ({@link RAW_CAPS}) — and names every drift in both directions. The field was inert:
 * one place in the farm read it, and it drifted for a whole category (six apps opened WebUSB, none
 * declared it). Make it true before making it functional, because wiring a wrong field into the
 * permission surface ships the drift. Exports the pure {@link importedNames} and {@link capabilitiesOf}
 * plus the per-app {@link scanApp}.
 *
 * ![The caps node in the 8n8 pipeline](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/pipeline-caps.svg)
 *
 * ## Usage
 * ```sh
 * deno run -A jsr:@microspec/core/caps            # report every mismatch
 * deno run -A jsr:@microspec/core/caps --check    # exit 1 on any (the 8n8 node)
 * ```
 * `deno task gates` runs it as the 8n8 node `caps`, with `--check`, from the consumer's tree.
 *
 * ## Flags and arguments
 * | flag | effect |
 * | --- | --- |
 * | `--check` | exit 1 when any app mismatches; without it the same report exits 0 |
 *
 * Everything else comes from the tree it is run in: every apps/<id>/ that has a spec.json.
 *
 * ## What it checks
 * Per app, all .js and .mjs files under apps/<id>/ concatenated — except e2e.spec.mjs (drives the app
 * from outside) and sw.js (generated). Against that source:
 * - gateway imports: `geo`, `camera`, `mic`, `compass`, `tilt`, `wakeLock` from /_rt/sensors.js;
 *   `CameraPrime`, `MicPrime` from /_rt/camprime.js; any import of /_rt/auth.js is `auth`, of
 *   /_rt/hackrf.js is `usb`. `compass` charges `compass` + `orientation`; `tilt` charges `orientation`.
 * - raw calls: `navigator.usb`, `navigator.geolocation`, `navigator.wakeLock`, `getUserMedia` with
 *   `video:` or `audio:`, `DeviceOrientationEvent` / "deviceorientation", `DeviceMotionEvent` / "devicemotion".
 * - the compass opt-out, read rather than assumed: `compass` also charges `geo` unless the source passes
 *   `trueNorth: false` — handpan and rave do, precisely to avoid the permission.
 * - haptic is absent on purpose: index.js delegates one pointerdown for the whole farm, so every app with
 *   a button has it. A runtime property, not an app capability.
 *
 * One line per failing app, naming every capability: `✗ <id>  undeclared: usb  ·  declared but unused: geo`,
 * then "k of n apps declare capabilities that do not match their code." — the whole work list in one run.
 * Green prints `✓ capabilities: n apps, every spec.json needs matches its call sites.` It writes nothing.
 *
 * ## Exit codes
 * - 0 — every `needs` matches its call sites, or a report without `--check`.
 * - 1 — `--check` and at least one app is undeclared or stale.
 *
 * ## Where it sits
 * gate · script · needs: spec, view, demo · needed by: nothing downstream — a target of the `gates` flow,
 * the pre-push floor. It reads the CONSUMER's apps/ from cwd, never the package's own tree; in the appless
 * core the demo node seeds the app it audits.
 *
 * ## Why
 * spec.json `needs` must match the capabilities the code actually reaches for. The field was inert and had
 * drifted for a whole category — six apps opened WebUSB, none declared it — so it is made true before it is
 * made functional. Two measurements were thrown away on the way here: the import closure (thirty apps
 * flagged, a habit tracker among them, because sensors.js holds every sensor), and named imports without
 * the trueNorth opt-out. Both were caught by dry-running the farm before the gate was ever fatal.
 * @module
 */

const ROOT = Deno.cwd();
const read = (p) => { try { return Deno.readTextFileSync(`${ROOT}/${p}`); } catch { return null; } };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Runtime module → imported symbol → the capabilities that symbol reaches for (`"*"` = any import of the module). */
export const SYMBOL_CAPS = {
  "/_rt/sensors.js": {
    geo: ["geo"], camera: ["camera"], mic: ["microphone"],
    compass: ["compass", "orientation"], tilt: ["orientation"], wakeLock: ["wakeLock"],
  },
  "/_rt/camprime.js": { CameraPrime: ["camera"], MicPrime: ["microphone"] },
  "/_rt/camstage.js": { CamStage: ["camera", "wakeLock"] },
  "/_rt/intake.js": { Camera: ["camera"] },
  "/_rt/auth.js": { "*": ["auth"] },
  "/_rt/hackrf.js": { "*": ["usb"] },
};

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
