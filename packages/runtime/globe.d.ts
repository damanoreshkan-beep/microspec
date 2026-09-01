/**
 * # runtime/globe.js — one interactive Earth for any tool view, data-agnostic
 *
 * A canvas orthographic globe (d3-geo, no WebGL — so it renders in the headless gate too) with country
 * outlines, a graticule, drag-to-spin, pinch and wheel zoom, idle auto-rotation, a fly-to tween and
 * tap-to-select. It is SYSTEMIC: it knows nothing about what a pick means — the app supplies that. Two
 * consumers by design: the globe app in explore mode (`onPick` → look a country's facts up by id) and the
 * sun compass in pick mode (`onPick` → set a target lat/lon so the sun math recomputes for that place).
 * The world topology loads once from `/_rt/world-110m.json` and is cached across every globe on the page,
 * and the palette follows the document's `data-theme`, hardcoded so canvas never depends on oklch var
 * support — the amber pole is the accent that makes the selected country and the marker pop on the
 * monochrome map.
 *
 * ![The globe map: the world topology loaded once, the projection, one rAF loop redrawing only when dirty, and the pointer, wheel and prop inputs that make it dirty](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-globe.svg)
 *
 * ## Import
 * ```js
 * import { Globe, countryAt, worldReady } from "/_rt/globe.js";                    // an app's page: the import map resolves /_rt/
 * import { Globe, countryAt, worldReady } from "@microspec/core/runtime/globe.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link Globe} — the Preact component: `onPick({ lat, lon, id, name, point })`, `selected` (country id), `marker` (`{ lat, lon }` pin), `focus` (`{ lat, lon }` to fly to; the initial view when supplied at mount), `points` (`[{ lat, lon, r, color, pulse }]` overlay), `spin` (default true), `height` (max px, the globe is square).
 * - {@link countryAt} — `countryAt(lat, lon)` → `{ id, name }` or null (ocean, or topology not loaded yet), using the world any Globe on the page has already fetched.
 * - {@link worldReady} — whether `/_rt/world-110m.json` has been fetched and parsed, so `countryAt` can answer.
 *
 * ## In practice
 * ```js
 * // globe — explore mode: a tap selects a country, the selection stops the idle spin
 * import { Globe } from "/_rt/globe.js";
 * html`<${Globe} selected=${sel} focus=${focus} onPick=${pick} spin=${!sel} />`;
 *
 * // sun — pick mode: the tap becomes the place the sun math runs for
 * html`<${Globe} marker=${tmp ? { lat: tmp.lat, lon: tmp.lng } : null} focus=${focus} spin=${!tmp}
 *   onPick=${({ lat, lon, name }) => setTmp({ lat, lng: lon, name })} height=${300} />`;
 *
 * // globe/track.js — the ISS over the world: overlay points, fly to it, name the country under it
 * import { Globe, countryAt, worldReady } from "/_rt/globe.js";
 * useEffect(() => { const id = setInterval(() => { tick((x) => x + 1); if (worldReady()) clearInterval(id); }, 1000); return () => clearInterval(id); }, []);
 * const country = countryAt(lat, lon);                     // null until the topology is in
 * html`<${Globe} points=${[{ lat, lon, r: 16, color: "rgba(245,185,77,.16)" }, { lat, lon, r: 5, color: "#F5B94D" }]} focus=${{ lat, lon }} spin=${false} height=${320} />`;
 * ```
 *
 * ## How it fits
 * Imports `htm/preact`, `preact/hooks`, `d3-geo` and `topojson-client` as BARE specifiers (the package
 * rule: JSR rejects https imports, so the pins live in deno.json as npm: for Deno and publish, and in each
 * app page's import map as esm.sh for the browser), plus `Pixels` from `skeleton.js` for the placeholder
 * while the topology loads. Inside the runtime, `hero.js` borrows its idiom — the palette follows the
 * document, not a prop. Two farm apps import it: globe (view, track and quakes screens) and sun.
 *
 * ## Invariants and pitfalls
 * - The topology URL is resolved against the DOCUMENT (`new URL("../_rt/world-110m.json", document.baseURI)`), not `import.meta.url`: the deploy bundles this module into `<app>/app.js`, and a module-relative URL 404'd on every deployed globe while the source-mode gate stayed green (2026-08-18). `../_rt/` is right in every layout; an absolute `/_rt/…` would break a base-path mirror.
 * - ONE continuous rAF loop from mount; it only redraws when something is dirty (auto-rotate, drag, fly, a pulsing point, a prop change, a theme change), so idle costs ~nothing and the animation never waits for a touch.
 * - Size comes from a ResizeObserver — never read `clientWidth` per frame (reflow). DPR is capped at 2.
 * - Idle spin pauses while a pointer is down, while zoomed past 1.05, and whenever `selected` or `marker` is set.
 * - `touch-action: none` on the canvas hands the gesture to the globe: one pointer rotates, two pinch-zoom (0.9–7×), a wheel or trackpad pinch zooms with `passive: false`, a double tap resets zoom. A tap is a release under 6 px of movement with no pinch.
 * - A tap hit-tests `points` first: the nearest VISIBLE point within its radius + 10 px is the pick and rides along as `point` in the payload, so any app with `points` gets tappable markers.
 * - `pulse: true` rings are drawn ON the canvas at the projected position — they stay anchored to the real lat/lon through rotation and drag, never a fixed DOM overlay.
 * - `countryAt` answers null until `worldReady()`; the ISS tracker polls `worldReady` each second until it is.
 * @module
 */
// GENERATED by tools/dts.mjs from packages/runtime/globe.js — edit the JSDoc there, never this file.
/**
 * Look up which country a lat/lon falls in, using the already-loaded world topology.
 * @param lat latitude in degrees
 * @param lon longitude in degrees
 * @returns `{ id, name }` of the containing country, or null for ocean / topology not loaded yet
 */
export function countryAt(lat: any, lon: any): {
    id: string;
    name: any;
};
/**
 * Whether the world topology has finished loading (so `countryAt` can answer).
 * @returns true once /_rt/world-110m.json has been fetched and parsed
 */
export function worldReady(): boolean;
/**
 * The interactive globe component (Preact). Shows a skeleton until the world topology is loaded, then
 * runs one continuous rAF loop that only redraws when something is dirty.
 * @param onPick   fired on a tap with `{ lat, lon, id, name, point }` — `point` is the hit overlay point, if any
 * @param selected country id to highlight with the accent
 * @param marker   `{ lat, lon }` pin for a chosen location
 * @param focus    `{ lat, lon }` — animate the globe to centre it (used as the initial view when supplied at mount)
 * @param points   `[{ lat, lon, r, color, pulse }]` overlay dots; `pulse: true` draws expanding rings on the canvas
 * @param spin     idle auto-rotation (default true; pauses while dragging, zoomed, selected or marked)
 * @param height   max size in px (the globe is square)
 * @returns the globe's VNode
 */
export function Globe({ onPick, selected, marker, focus, points, spin, height }: {
    onPick: any;
    selected: any;
    marker: any;
    focus: any;
    points: any;
    spin?: boolean;
    height?: number;
}): any;
