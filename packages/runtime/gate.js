// Shared gate/mock detection — was copy-pasted into ~17 apps. `isGate` is true under the headless
// verify/shoot gate (localhost); `MOCK` is the ?mock query param (a phone/mock preview also forces gate
// mode); `gate` = either (MOCK present, even empty). Apps seed a deterministic fixture when `gate` is true.
// `?live` (alias `?real`) is a DEV escape hatch: it forces real-hardware mode on localhost so a WebUSB app
// (localhost is a secure context) can show its true connect/permission flow instead of the seeded fixture.
// Off by default, so CI verify/shoot on localhost still gets `gate === true` and the deterministic seed.
const QS = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
export const isGate = typeof location !== "undefined" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
export const MOCK = QS.get("mock");
export const LIVE = QS.has("live") || QS.has("real");
export const gate = (isGate || MOCK != null) && !LIVE;
