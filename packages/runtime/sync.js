// microspec runtime — cross-device control sync over a WebSocket (wss://…/feed/sync, edge relay on core).
// One room per signed-in user (the edge keys it off the sealed sid — provider:id); devices mirror STATE for
// display and exchange COMMANDS (play/pause/vol). Remote control, not multi-room: a full mirror would play
// the same stream unsynchronised on two speakers (tide RESEARCH.md §6).
//
// The sid rides the FIRST FRAME, never the URL — nginx logs URLs. The sealed tunnel does not cover a ws
// (sealedfetch wraps fetch only); TLS carries the frames, the edge checks Origin server-side.
//
// FAIL OPEN. Until the owner enables the nginx ws location (vps/enable-sync-ws.sh in the edge repo) the
// handshake dies at nginx — the client retries with a capped backoff and the app stays fully usable.
// GATE-SAFE: under `gate` there is no network — a deterministic mock peer populates the sheet for the shot.
import { VPS_PROXY } from "./feed.js";
import { gate } from "./gate.js";

export const SYNC_URL = VPS_PROXY.replace(/^http/, "ws") + "/sync";

// ── pure: the wire protocol (the edge holds a mirror copy, same shapes) ──────────────────────────────────
// client → server:  {t:"hi", sid, app}  ·  {t:"state", s:{p:0|1, st:<id>, v:0..1}}  ·  {t:"cmd", c, v?}
// server → client:  {t:"ok", peers, s}  ·  {t:"peers", n}  ·  {t:"state", s}  ·  {t:"cmd", c, v?}
export const CMDS = ["play", "pause", "vol"];

export const clampVol = (v) => (Number.isFinite(+v) ? Math.min(1, Math.max(0, +v)) : 1);

/** A device's player state, wire-shaped and clamped; null in → null out. */
export const packState = (s) => (s ? { p: s.playing ? 1 : 0, st: String(s.station || ""), v: clampVol(s.vol) } : null);

/** Validate a wire state object → {playing, station, vol} or null. */
export const openState = (s) =>
  (s && typeof s === "object" && typeof s.st === "string" && s.st.length <= 64)
    ? { playing: s.p === 1, station: s.st, vol: clampVol(s.v) }
    : null;

/** Parse one server frame → a typed message or null (unknown/garbage is dropped, never thrown). */
export function parseServer(raw) {
  let m;
  try { m = JSON.parse(raw); } catch { return null; }
  if (!m || typeof m !== "object") return null;
  if (m.t === "ok") return { t: "ok", peers: Math.max(0, m.peers | 0), state: openState(m.s) };
  if (m.t === "peers") return { t: "peers", n: Math.max(0, m.n | 0) };
  if (m.t === "state") { const s = openState(m.s); return s ? { t: "state", state: s } : null; }
  if (m.t === "cmd" && CMDS.includes(m.c)) return { t: "cmd", c: m.c, ...(m.c === "vol" ? { v: clampVol(m.v) } : {}) };
  return null;
}

/** Reconnect backoff, capped — the fail-open path when the edge (or nginx's ws location) is away. */
export const syncDelay = (attempt) => [1000, 2000, 5000, 10000][attempt] ?? 30000;

// A deterministic peer so the gate shoots the POPULATED sheet, never the empty state.
export const MOCK_PEER = { playing: true, station: "groovesalad", vol: 0.8 };

// ── the connection ───────────────────────────────────────────────────────────────────────────────────────
/**
 * openSync({ sid, app, onStatus, onPeers, onState, onCmd }) → { sendState, sendCmd, close }.
 * onStatus: "conn" | "on" | "off" (off = retrying in the background). Callbacks fire on the socket's events;
 * the caller mirrors them into atoms. close() ends it for good (logout / unmount).
 */
export function openSync({ sid, app, onStatus, onPeers, onState, onCmd }) {
  if (gate) {
    onStatus?.("on"); onPeers?.(2); onState?.({ ...MOCK_PEER });
    return { sendState: () => {}, sendCmd: () => {}, close: () => {} };
  }
  let ws = null, alive = true, attempt = 0, retry = null, okd = false;
  let lastState = null;                                          // re-announced on every (re)connect
  const send = (obj) => { try { if (ws && ws.readyState === 1 && okd) ws.send(JSON.stringify(obj)); } catch { /* drop */ } };
  const connect = () => {
    if (!alive) return;
    onStatus?.("conn"); okd = false;
    try { ws = new WebSocket(SYNC_URL); } catch { onStatus?.("off"); arm(); return; }
    ws.onopen = () => { try { ws.send(JSON.stringify({ t: "hi", sid, app })); } catch { /* close handles it */ } };
    ws.onmessage = (e) => {
      const m = parseServer(e.data);
      if (!m) return;
      if (m.t === "ok") { okd = true; attempt = 0; onStatus?.("on"); onPeers?.(m.peers); if (m.state) onState?.(m.state); if (lastState) send({ t: "state", s: lastState }); }
      else if (m.t === "peers") onPeers?.(m.n);
      else if (m.t === "state") onState?.(m.state);
      else if (m.t === "cmd") onCmd?.(m);
    };
    ws.onclose = () => { if (alive) { onStatus?.("off"); arm(); } };
    ws.onerror = () => { try { ws.close(); } catch { /* already closing */ } };
  };
  const arm = () => { if (retry) clearTimeout(retry); retry = setTimeout(() => { retry = null; connect(); }, syncDelay(attempt++)); };
  connect();
  const bye = () => { alive = false; if (retry) clearTimeout(retry); try { ws?.close(); } catch { /* */ } };
  if (typeof addEventListener !== "undefined") addEventListener("pagehide", bye);
  return {
    sendState: (s) => { lastState = packState(s); if (lastState) send({ t: "state", s: lastState }); },
    sendCmd: (c, v) => { if (CMDS.includes(c)) send({ t: "cmd", c, ...(c === "vol" ? { v: clampVol(v) } : {}) }); },
    close: bye,
  };
}
