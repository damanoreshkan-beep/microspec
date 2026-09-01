/* @ts-self-types="./bghold.d.ts" */
/**
 * Hold the shell's foreground service while a long job runs, so Android does not freeze the backgrounded
 * WebView mid-generation. Exports `holdBackground`, a ref-counted hold that returns its own release and is
 * a no-op where there is no shell.
 * @module
 */
// microspec runtime — hold the shell's foreground service while a long job runs. Android 12+ (and One UI
// sooner) FREEZES a backgrounded app that has no foreground service, and a frozen WebView polls nothing —
// so a generation "died" the moment the owner switched apps (measured 2026-08-18). The shell's bg.start is a
// real Service with a persistent notification; while it is up, the process stays warm and the page's timers
// keep ticking (MainActivity never pauses the WebView). Ref-counted: two runs (Твори + Онови) share one hold,
// the last release stops it. In a browser there is no shell and this is a no-op — Chrome throttles but does
// not freeze a PWA for the few minutes a job takes.
import { shell } from "./shell.js";

let holds = 0, up = false;

const can = () => { try { return shell.present && shell.has("bg.start") && shell.has("bg.stop"); } catch { return false; } };

/**
 * Take one ref-counted hold on the shell's foreground service; the first hold starts it, the last release stops it.
 * Idempotent per release; safe to call without a shell (then a no-op).
 * @param opts `{ title, body }` — the persistent notification's text
 * @returns a `release()` function that drops this hold
 */
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
