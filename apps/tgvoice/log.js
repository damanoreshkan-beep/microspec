// tgvoice — the on-device flight recorder.
//
// Exists because the one failure this app kept hitting was INVISIBLE: the WASM engine (512MB initial heap +
// ONNX sessions) can make Android kill the WebView renderer, the shell rebuilds the page, and every trace of
// what happened dies with the old document. So the log lives in localStorage — it survives a renderer death,
// a reload and an app restart — and `mark` records the heavy step in progress, so the next boot can say
// "the engine died during X" instead of showing a silently empty screen.
//
// Everything is try/caught: a broken localStorage (private mode, cleared site data) must never take the app
// down with the diagnostics.

const KEY = "tgvoice.log";
const MARK = "tgvoice.mark";
const MAX = 300;

let buf = null;
function load() {
  if (buf) return buf;
  try { buf = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { buf = []; }
  if (!Array.isArray(buf)) buf = [];
  return buf;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(buf)); } catch { /* storage gone — keep the in-memory ring */ }
}

/** Append one line, timestamped. Cheap, synchronous, never throws. */
export function log(line) {
  try {
    const b = load();
    b.push(`${new Date().toISOString().slice(11, 23)} ${String(line)}`);
    while (b.length > MAX) b.shift();
    save();
  } catch { /* never let diagnostics crash the flight */ }
}

/** Every recorded line, oldest first. */
export function logLines() { try { return load().slice(); } catch { return []; } }

export function clearLog() { buf = []; try { localStorage.removeItem(KEY); } catch { /* */ } }

/** The heavy step currently in progress — cleared on success. If a boot finds one, the renderer died there. */
export function mark(step) {
  try { step == null ? localStorage.removeItem(MARK) : localStorage.setItem(MARK, String(step)); } catch { /* */ }
}
export function readMark() { try { return localStorage.getItem(MARK); } catch { return null; } }
