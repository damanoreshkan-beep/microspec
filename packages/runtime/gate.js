/* @ts-self-types="./gate.d.ts" */
/**
 * Shared gate/mock detection, so apps seed a deterministic fixture instead of hitting live data under the
 * headless verify/shoot gate or a `?mock` preview. Exports `isGate` (localhost), `MOCK` (the query param)
 * and `gate` (either).
 * @module
 */
// Shared gate/mock detection — was copy-pasted into ~17 apps. `isGate` is true under the headless
// verify/shoot gate (localhost); `MOCK` is the ?mock query param (a phone/mock preview also forces gate
// mode); `gate` = either (MOCK present, even empty). Apps seed a deterministic fixture when `gate` is true.
const QS = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
/** True under the headless verify/shoot gate — the page is served from localhost. */
export const isGate = typeof location !== "undefined" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
/** The `?mock` query param value (empty string when present without a value), or null when absent. */
export const MOCK = QS.get("mock");
/** True when the app should seed a deterministic fixture: under the gate, or with `?mock` present. */
export const gate = isGate || MOCK != null;
