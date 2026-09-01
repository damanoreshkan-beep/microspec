/* @ts-self-types="./gate.d.ts" */
/**
 * Shared gate/mock detection, so apps seed a deterministic fixture instead of hitting live data under the
 * headless verify/shoot gate or a `?mock` preview. Exports `isGate` (localhost), `MOCK` (the query param)
 * and `gate` (either).
 * @module
 */
const QS = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
/** True under the headless verify/shoot gate — the page is served from localhost. */
export const isGate = typeof location !== "undefined" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
/** The `?mock` query param value (empty string when present without a value), or null when absent. */
export const MOCK = QS.get("mock");
/** True when the app should seed a deterministic fixture: under the gate, or with `?mock` present. */
export const gate = isGate || MOCK != null;
