
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
  try { localStorage.setItem(KEY, JSON.stringify(buf)); } catch {  }
}

/** Append one line, timestamped. Cheap, synchronous, never throws. */
export function log(line) {
  try {
    const b = load();
    b.push(`${new Date().toISOString().slice(11, 23)} ${String(line)}`);
    while (b.length > MAX) b.shift();
    save();
  } catch {  }
}

/** Every recorded line, oldest first. */
export function logLines() { try { return load().slice(); } catch { return []; } }

export function clearLog() { buf = []; try { localStorage.removeItem(KEY); } catch {  } }

/** The heavy step currently in progress — cleared on success. If a boot finds one, the renderer died there. */
export function mark(step) {
  try { step == null ? localStorage.removeItem(MARK) : localStorage.setItem(MARK, String(step)); } catch {  }
}
export function readMark() { try { return localStorage.getItem(MARK); } catch { return null; } }
