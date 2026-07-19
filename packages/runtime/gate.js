// Shared gate/mock detection — was copy-pasted into ~17 apps. `isGate` is true under the headless
// verify/shoot gate (localhost); `MOCK` is the ?mock query param (a phone/mock preview also forces gate
// mode); `gate` = either (MOCK present, even empty). Apps seed a deterministic fixture when `gate` is true.
const QS = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
export const isGate = typeof location !== "undefined" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
export const MOCK = QS.get("mock");
export const gate = isGate || MOCK != null;
