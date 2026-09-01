/* @ts-self-types="./noundef.d.mts" */
/**
 * # noundef — undefined identifiers caught statically, not by the one screen that renders them
 *
 * A regex edit once deleted a `const` that a single sheet referenced. The local gates went green and CI
 * failed five checks, because every existing gate has to RENDER the code to see the problem: preflight
 * mounts a tab, and the constant lived behind a history-backed sheet no tab mount opens. A reference to a
 * name that does not exist is a static fact and should not need a browser, a tab or a tap to notice. So
 * this gate runs `deno lint` with exactly one rule, no-undef, over every app entry point, and fails on any
 * name that is neither declared nor a measured browser global. The allowlist is the whole design decision:
 * deno lint has no DOM lib, so every platform global reads as undefined, and the list is the complete set
 * the farm actually uses. If it ever needs a name that is not a browser global, that is the bug this gate
 * exists for, and adding it to the list is the one thing not to do.
 *
 * ![The noundef node in the 8n8 pipeline](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/pipeline-noundef.svg)
 *
 * ## Usage
 * ```sh
 * deno run -A jsr:@microspec/core/noundef
 * ```
 * `deno task gates` runs it as the 8n8 node `noundef`; the runner also runs it the moment the `view`
 * agent node returns, as that node's `verify` gate.
 *
 * ## Flags and arguments
 * None — it reads the tree it is run in: every apps/id/view.js, data.js and stream.js that exists, sorted.
 *
 * ## What it checks / produces
 * - Spawns `deno lint --no-config --rules-tags= --rules-include=no-undef --json` over the entry points.
 *   `--no-config` because the repo's own deno.json excludes apps/ from linting; `--rules-tags=` clears the
 *   default set so the output is not dominated by style rules the farm never opted into.
 * - Keeps every diagnostic of the form "name is not defined" whose name is not in the allowlist:
 *   document, requestAnimationFrame, cancelAnimationFrame, getComputedStyle, devicePixelRatio, matchMedia,
 *   Image, DOMParser, IntersectionObserver, ResizeObserver, MutationObserver, DeviceOrientationEvent,
 *   AudioContext, webkitAudioContext, AudioWorkletNode, OfflineAudioContext, OffscreenCanvas.
 * - Each offender is printed as `path:line — message`, then the count, with the reason: a name that is
 *   not a browser global and not declared is a crash waiting for the screen that renders it.
 * - Green: "no undefined identifiers in N app entry points". Writes nothing.
 * - apps/ must exist — in a tree with none the `demo` node seeds apps/books first, which is why this node
 *   depends on it.
 *
 * ## Exit codes
 * - 0 — no offenders.
 * - 1 — one or more undefined identifiers (each named with file and line).
 * - 2 — the `deno lint --json` output could not be parsed (lint did not run, or did not emit JSON).
 *
 * ## Where it sits
 * gate · script (frozen 2026-06-24) · needs: scaffold, demo · needed by: no node lists it in `needs`;
 * it is the `verify` gate of the `view` agent node, and a target of the `gates` flow.
 *
 * ## Why
 * Undefined identifiers a zero-build stack would only discover in the browser.
 * @module
 */
// microspec — the undefined-identifier gate for app entry points.
//
// WHY THIS EXISTS. A regex edit deleted a `const` that only one sheet referenced. `deno task gates` went
// green and CI failed five checks, because every existing gate has to RENDER the code to see the problem:
// preflight mounts a tab, and the constant lived behind a history-backed sheet that no tab mount opens.
// A reference to a name that does not exist is a static fact, and it should not need a browser, a tab, or
// a tap to notice.
//
// `deno lint` has exactly the right rule and the repo's own deno.json excludes `apps/` from linting, so it
// is reached with --no-config. --rules-tags= clears the default set, leaving no-undef alone — otherwise the
// output is dominated by style rules the farm has never opted into.
//
// THE ALLOWLIST IS THE WHOLE DESIGN DECISION. deno lint has no DOM lib and no way to declare globals, so
// every browser global reads as undefined. The list below is the complete set the farm actually uses,
// measured across all 63 apps — 15 names, all genuine platform globals, and not one real offender besides.
// A short measured list is a fair price; if it ever grows a name that is NOT a browser global, that is the
// bug this gate is for, and adding it here to shut the gate up is the one thing not to do.
//
//   deno run -A tools/noundef.mjs

const BROWSER = new Set([
  "document", "requestAnimationFrame", "cancelAnimationFrame", "getComputedStyle", "devicePixelRatio",
  "matchMedia", "Image", "DOMParser", "IntersectionObserver", "ResizeObserver", "MutationObserver",
  "DeviceOrientationEvent", "AudioContext", "webkitAudioContext", "AudioWorkletNode", "OfflineAudioContext",
  "OffscreenCanvas",
]);

const entries = [];
for await (const e of Deno.readDir("apps")) {
  if (!e.isDirectory) continue;
  for (const f of ["view.js", "data.js", "stream.js"]) {
    try { await Deno.stat(`apps/${e.name}/${f}`); entries.push(`apps/${e.name}/${f}`); } catch { /* not this shape */ }
  }
}
entries.sort();

const out = await new Deno.Command("deno", {
  args: ["lint", "--no-config", "--rules-tags=", "--rules-include=no-undef", "--json", ...entries],
  stdout: "piped", stderr: "piped",
}).output();

let report;
try { report = JSON.parse(new TextDecoder().decode(out.stdout)); }
catch { console.error("noundef: could not parse `deno lint --json` output"); Deno.exit(2); }

const offenders = (report.diagnostics || []).filter((d) => {
  const m = /^(.+?) is not defined/.exec(d.message || "");
  return m && !BROWSER.has(m[1]);
});

if (!offenders.length) {
  console.log(`  ✓ no undefined identifiers in ${entries.length} app entry points`);
  Deno.exit(0);
}
for (const d of offenders) {
  const at = d.filename ? d.filename.replace(/^file:\/\//, "").replace(Deno.cwd() + "/", "") : "?";
  console.error(`  ✗ ${at}:${d.range?.start?.line ?? "?"} — ${d.message}`);
}
console.error(`\n  ${offenders.length} undefined identifier(s). A name that is not a browser global and not declared is a crash waiting for the screen that renders it.`);
Deno.exit(1);
