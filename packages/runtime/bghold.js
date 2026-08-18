import { shell } from "./shell.js";

let holds = 0, up = false;

const can = () => { try { return shell.present && shell.has("bg.start") && shell.has("bg.stop"); } catch { return false; } };

/** holdBackground({ title, body }) → release(). Idempotent per release; safe to call without a shell. */
export function holdBackground({ title = "", body = "" } = {}) {
  let released = false;
  if (can()) {
    holds++;
    if (!up) { up = true; shell.call("bg.start", { title, body }).catch(() => { up = false; }); }
  }
  return () => {
    if (released) return; released = true;
    if (!can()) return;
    holds = Math.max(0, holds - 1);
    if (!holds && up) { up = false; shell.call("bg.stop", {}).catch(() => {}); }
  };
}
