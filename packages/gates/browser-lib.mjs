// Shared browser plumbing for the gates — boot, in-process serve, e2e helpers, design checks.
// Used by verify.mjs (one-browser fast path) and, transitively, check-all.mjs. Keeps the e2e
// helper surface and the 3 design checks in ONE place so the fast path can't drift from intent.
import { launch } from "jsr:@astral/astral@^0.5.3";
import { makeHandler } from "./serve-handler.mjs";

export const DEVICES = {
  s25ultra: { width: 384, height: 832, dpr: 3.5, mobile: true },
  desktop:  { width: 1280, height: 900, dpr: 1, mobile: false },
};
const MOBILE_UA = "Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const AXE = "https://cdn.jsdelivr.net/npm/axe-core@4.10.2/axe.min.js";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// proot-safe display + dbus muting (same contract as shot.mjs/setup.mjs)
export function ensureDisplay() {
  const DNUM = Deno.env.get("DISPLAY_NUM") ?? "99";
  if (!Deno.env.get("DISPLAY")) Deno.env.set("DISPLAY", `:${DNUM}`);
  Deno.env.set("DBUS_SESSION_BUS_ADDRESS", "disabled:");
  Deno.env.set("DBUS_SYSTEM_BUS_ADDRESS", "disabled:");
}

const fileExists = async (p) => { try { await Deno.stat(p); return true; } catch { return false; } };
async function xvfbRunning(dnum) {
  try { const { stdout } = await new Deno.Command("pgrep", { args: ["-f", `Xvfb :${dnum}`], stdout: "piped", stderr: "null" }).output(); return new TextDecoder().decode(stdout).trim().length > 0; }
  catch { return false; }
}

// THE crash guard. Chromium booted against a DEAD X server floods zygote/dbus errors that —
// under Termux/proot — print straight to the user's real terminal (past every redirect we own),
// crashing it and spilling bytes into their input. So we NEVER launch a browser until a display
// is verified ALIVE (pgrep, not just the socket file — a dead Xvfb leaves a stale socket behind).
// If it's down we restart it the one safe way (MIT-SHM + fully detached + stdio null, per setup.mjs).
// Returns false (caller exits cleanly) rather than letting Chromium spew.
export async function ensureDisplayUp() {
  ensureDisplay();
  const dnum = Deno.env.get("DISPLAY_NUM") ?? "99";
  if (Deno.env.get("DISPLAY") !== `:${dnum}`) return true;                 // a real/external display — trust it
  const sock = `/tmp/.X11-unix/X${dnum}`;
  if (await xvfbRunning(dnum) && await fileExists(sock)) return true;       // already alive
  try { await Deno.remove(sock); } catch { /* stale socket */ }            // clear the lie a dead Xvfb left
  try { await Deno.remove(`/tmp/.X${dnum}-lock`); } catch { /* stale lock */ }
  new Deno.Command("Xvfb", { args: [`:${dnum}`, "-screen", "0", "1280x900x24", "-extension", "MIT-SHM", "-nolisten", "tcp"], stdin: "null", stdout: "null", stderr: "null" }).spawn().unref();
  for (let i = 0; i < 50; i++) { if (await fileExists(sock) && await xvfbRunning(dnum)) return true; await sleep(100); }
  return false;
}

export function serveLocal(dir) {
  const ac = new AbortController();
  const server = Deno.serve({ port: 0, signal: ac.signal, onListen: () => {} }, makeHandler(dir));
  return { url: `http://localhost:${server.addr.port}/index.html`, stop: async () => { ac.abort(); await server.finished; } };
}

export async function bootBrowser(dev = DEVICES.s25ultra) {
  return await launch({
    path: Deno.env.get("CHROMIUM_PATH") ?? "/usr/sbin/chromium",
    headless: false,
    args: [
      "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
      `--window-size=${dev.width},${dev.height}`, `--force-device-scale-factor=${dev.dpr}`, "--hide-scrollbars",
      ...(dev.mobile ? [`--user-agent=${MOBILE_UA}`] : []),
    ],
  });
}

// e2e helper surface — identical to e2e.mjs, plus waitFor() for async data (cold-cache safe).
export function makeHelpers(page) {
  const ev = (fn, ...args) => page.evaluate(fn, { args });
  const h = {
    count: (s) => ev((s) => document.querySelectorAll(s).length, s),
    text:  (s) => ev((s) => document.querySelector(s)?.innerText ?? "", s),
    attr:  (s, n) => ev((s, n) => document.querySelector(s)?.getAttribute(n) ?? "", s, n),
    prop:  (s, p) => ev((s, p) => document.querySelector(s)?.[p], s, p),
    storage: (k) => ev((k) => localStorage.getItem(k), k),
    bodyText: () => ev(() => document.body.innerText),
    type:  (s, v) => ev((s, v) => { const e = document.querySelector(s); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); }, s, v),
    // set a <select> value and fire change (native selects react to change, not input)
    select: (s, v) => ev((s, v) => { const e = document.querySelector(s); e.value = v; e.dispatchEvent(new Event("change", { bubbles: true })); }, s, v),
    click: (s) => ev((s) => document.querySelector(s)?.click(), s),
    // A real tap: pointerdown THEN click. `click()` alone dispatches neither pointer nor touch events, so
    // anything a finger triggers — the runtime's delegated haptic, a press state, a pointer-driven
    // instrument — is invisible to click() and passes a test it never actually exercised.
    tap: (s) => ev((s) => {
      const e = document.querySelector(s);
      if (!e) return false;
      e.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
      e.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true }));
      e.click();
      return true;
    }, s),
    hasClass: (s, c) => ev((s, c) => !!document.querySelector(s)?.classList.contains(c), s, c),
    scrollTo: (y) => ev((y) => window.scrollTo(0, y), y),
    scrollY: () => ev(() => window.scrollY),
    back: () => ev(() => history.back()),
    // Reload the page and wait for the app to settle. The ONLY way to test that something survives a
    // session: an app persisting to IndexedDB is indistinguishable from one that silently drops it until
    // you actually come back. Without this the gate could never tell "saved" from "lost".
    reload: async (settle = 1200) => { await page.reload({ waitUntil: "load" }); await sleep(settle); },
    wait: (ms) => sleep(ms),
    expect: (cond, msg) => { if (!cond) throw new Error(msg || "assertion failed"); },
    // poll a body-text regex up to `ms` — the cold-cache settle lesson, reusable
    waitFor: async (re, ms = 12000, step = 500) => { let t = ""; for (let i = 0; i < Math.ceil(ms / step); i++) { t = await ev(() => document.body.innerText); if (re.test(t)) return true; await sleep(step); } return re.test(t); },
  };
  return { h, ev };
}

export async function gotoAndSettle(page, url, settle = 3500) {
  await page.goto(url, { waitUntil: "load" });
  await sleep(settle);
}

// The 3 design checks (a11y / overflow@384 / watch-glance@200). Returns [{name, ok, msg}].
export async function runDesignChecks(ev) {
  const out = [];
  // Freeze all CSS transitions/animations for the duration of the checks: otherwise flipping data-theme
  // (dark→light) samples axe mid-transition and a borderline contrast flickers pass/fail. Removed at the end.
  await ev(() => { const s = document.createElement("style"); s.id = "__freeze"; s.textContent = "*,*::before,*::after{transition:none!important;animation:none!important}"; document.head.appendChild(s); });
  const runAxe = () => ev(async () => {
    const r = await axe.run(document, { resultTypes: ["violations"] });
    return r.violations.map((x) => ({ id: x.id, impact: x.impact, n: x.nodes.length, targets: x.nodes.slice(0, 6).map((nd) => nd.target.join(" ")) }));
  });
  const axeResult = (v, label) => {
    const bad = v.filter((x) => x.impact === "critical" || x.impact === "serious");
    return bad.length
      ? { name: `a11y ${label}: без critical/serious`, ok: false, msg: bad.map((b) => `${b.id}[${b.impact}×${b.n}]`).join(", "), detail: bad.map((b) => `${b.id}: ${b.targets.join(" | ")}`) }
      : { name: `a11y ${label}: без critical/serious`, ok: true, msg: v.length ? `${v.length} minor` : "чисто" };
  };
  try {
    await ev(async (src) => { await new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }, AXE);
    out.push(axeResult(await runAxe(), "(dark)"));
    // SAME pass in the LIGHT theme — contrast is theme-specific (a pale label on white passes the dark pass
    // but fails here). Flip data-theme, re-run axe, restore — so both themes are guaranteed accessible.
    const base = await ev(() => document.documentElement.getAttribute("data-theme") || "signal");
    const flipped = await ev((th) => { const t = th.includes("light") ? th : th + "-light"; document.documentElement.setAttribute("data-theme", t); return t; }, base);
    await sleep(200);
    out.push(axeResult(await runAxe(), `light (${flipped})`));
    await ev((th) => document.documentElement.setAttribute("data-theme", th), base);
  } catch (e) { out.push({ name: "a11y (axe)", ok: false, msg: "не вдалось завантажити axe: " + e.message }); }

  // overflow@384 + NAME the widest element that spills past the viewport, so a failure is instantly fixable
  const ovi = await ev(() => {
    const ov = document.documentElement.scrollWidth - window.innerWidth;
    if (ov <= 1) return { ov: 0 };
    let sel = "?", far = window.innerWidth;
    for (const el of document.querySelectorAll("body *")) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.right > far + 0.5) { far = r.right; const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""; sel = el.tagName.toLowerCase() + (cls ? "." + cls : ""); } }
    return { ov, sel };
  });
  out.push(ovi.ov <= 1 ? { name: "phone 384px: без горизонтального overflow", ok: true } : { name: "phone 384px: overflow", ok: false, msg: `+${ovi.ov}px — винуватець: ${ovi.sel}` });

  await ev(() => { const v = document.getElementById("view"); if (v) v.style.maxWidth = "200px"; });
  await sleep(250);
  // cards (data apps) → check each card collapses; no cards (tool/custom view) → check the view container doesn't overflow
  const watch = await ev(() => {
    const cards = [...document.querySelectorAll(".card")];
    if (cards.length) { let m = 0; cards.forEach((c) => { m = Math.max(m, c.scrollWidth - c.clientWidth); }); return { mode: "card", o: m }; }
    const v = document.getElementById("view"); return { mode: "view", o: v ? v.scrollWidth - v.clientWidth : 0 };
  });
  await ev(() => { const v = document.getElementById("view"); if (v) v.style.maxWidth = ""; });   // restore for subsequent shots
  out.push(watch.o <= 2
    ? { name: `watch ~200px: ${watch.mode === "card" ? "контент уміщується (container query)" : "без overflow (custom view)"}`, ok: true }
    : { name: "watch ~200px: контент не вміщується", ok: false, msg: `+${watch.o}px overflow${watch.mode === "card" ? " у картці" : ""}` });
  await ev(() => document.getElementById("__freeze")?.remove());
  return out;
}
