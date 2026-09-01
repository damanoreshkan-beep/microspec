/* @ts-self-types="./noundef.d.mts" */
/**
 * The undefined-identifier gate for app entry points: runs `deno lint` with only no-undef over every
 * view.js/data.js/stream.js and fails on any name that is neither declared nor a measured browser global,
 * so a dangling reference is caught statically instead of by the one screen that renders it. A script
 * with no exports.
 * @module
 */

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
    try { await Deno.stat(`apps/${e.name}/${f}`); entries.push(`apps/${e.name}/${f}`); } catch {  }
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
