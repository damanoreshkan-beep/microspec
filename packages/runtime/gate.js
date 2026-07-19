const QS = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
export const isGate = typeof location !== "undefined" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
export const MOCK = QS.get("mock");
export const gate = isGate || MOCK != null;
