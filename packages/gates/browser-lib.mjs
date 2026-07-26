import { launch } from "jsr:@astral/astral@^0.5.3";
import { makeHandler } from "./serve-handler.mjs";

export const DEVICES = {
  s25ultra: { width: 384, height: 832, dpr: 3.5, mobile: true },
  desktop:  { width: 1280, height: 900, dpr: 1, mobile: false },
};
const MOBILE_UA = "Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const AXE = "https://cdn.jsdelivr.net/npm/axe-core@4.10.2/axe.min.js";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

export async function ensureDisplayUp() {
  ensureDisplay();
  const dnum = Deno.env.get("DISPLAY_NUM") ?? "99";
  if (Deno.env.get("DISPLAY") !== `:${dnum}`) return true;                 
  const sock = `/tmp/.X11-unix/X${dnum}`;
  if (await xvfbRunning(dnum) && await fileExists(sock)) return true;       
  try { await Deno.remove(sock); } catch {  }            
  try { await Deno.remove(`/tmp/.X${dnum}-lock`); } catch {  }
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
    headless: Deno.env.get("HEADFUL") === "1" ? false : true,
    args: [
      "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
      `--window-size=${dev.width},${dev.height}`, `--force-device-scale-factor=${dev.dpr}`, "--hide-scrollbars",
      ...(dev.mobile ? [`--user-agent=${MOBILE_UA}`] : []),
    ],
  });
}

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
    select: (s, v) => ev((s, v) => { const e = document.querySelector(s); e.value = v; e.dispatchEvent(new Event("change", { bubbles: true })); }, s, v),
    click: (s) => ev((s) => document.querySelector(s)?.click(), s),
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
    reload: async (settle = 1200) => { await page.reload({ waitUntil: "load" }); await sleep(settle); },
    wait: (ms) => sleep(ms),
    expect: (cond, msg) => { if (!cond) throw new Error(msg || "assertion failed"); },
    waitFor: async (re, ms = 12000, step = 500) => { let t = ""; for (let i = 0; i < Math.ceil(ms / step); i++) { t = await ev(() => document.body.innerText); if (re.test(t)) return true; await sleep(step); } return re.test(t); },
  };
  return { h, ev };
}

export async function gotoAndSettle(page, url, settle = 3500) {
  await page.goto(url, { waitUntil: "load" });
  await sleep(settle);
}

export const BREAKPOINTS = [
  { id: "phone-sm",    w: 320,  h: 568,  note: "9:16 · small-phone floor" },
  { id: "phone",       w: 384,  h: 832,  note: "20:9 · reference device" },
  { id: "phone-tall",  w: 412,  h: 915,  note: "9:19.5 · tall phone" },
  { id: "phone-land",  w: 844,  h: 390,  note: "19.5:9 · rotated — the height test" },
  { id: "split",       w: 412,  h: 430,  note: "split-screen — two apps stacked on a tall phone" },
  { id: "split-sm",    w: 360,  h: 340,  note: "floating window — the height floor" },
  { id: "watch",       w: 208,  h: 248,  note: "watch — the smallest real screen" },
  { id: "watch-sq",    w: 200,  h: 200,  note: "square watch (Wear OS round) — the vertical floor" },
  { id: "tablet",      w: 768,  h: 1024, note: "3:4 · tablet portrait" },
  { id: "tablet-land", w: 1024, h: 768,  note: "4:3 · tablet landscape" },
  { id: "desktop",     w: 1280, h: 900,  note: "16:10 · desktop" },
];

export async function runResponsiveMatrix(page, ev, dev) {
  const out = [];
  for (const bp of BREAKPOINTS) {
    await page.setViewportSize({ width: bp.w, height: bp.h });
    await sleep(260);                                   
    const m = await ev(() => {
      const de = document.documentElement;
      const ox = de.scrollWidth - window.innerWidth;
      let sel = "?";
      if (ox > 1) {
        let far = window.innerWidth, node = null;
        for (const el of document.querySelectorAll("body *")) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.right > far + 0.5) { far = r.right; node = el; } }
        const chain = [];
        for (let el = node; el && el !== document.body && chain.length < 5; el = el.parentElement) {
          const c = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
          chain.push(`${el.tagName.toLowerCase()}${c ? "." + c : ""}[${Math.round(el.getBoundingClientRect().width)}]`);
        }
        sel = chain.join(" ◂ ");
      }
      const fit = de.classList.contains("ms-fit");
      let oy = 0, vsel = "?";
      if (fit) {
        const v = document.getElementById("view");
        oy = v ? Math.max(v.scrollHeight - v.clientHeight, de.scrollHeight - window.innerHeight) : 0;
        if (oy > 1 && v) { const lim = v.getBoundingClientRect().bottom; let low = lim; for (const el of v.querySelectorAll("*")) { const r = el.getBoundingClientRect(); if (r.height > 0 && r.bottom > low + 0.5) { low = r.bottom; const c = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""; vsel = el.tagName.toLowerCase() + (c ? "." + c : ""); } } }
      }
      let hide = 0, hsel = "?";
      const nav = document.querySelector("nav[data-dock]");
      const view = document.getElementById("view");
      if (fit && nav && view) {
        const d = nav.getBoundingClientRect();
        for (const el of view.querySelectorAll("*")) {
          const r = el.getBoundingClientRect();
          if (r.width < 8 || r.height < 8) continue;
          const cs = getComputedStyle(el);
          if (cs.pointerEvents === "none" || cs.position === "fixed" || el.getAttribute("aria-hidden") === "true") continue;
          let vr = { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
          for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const pcs = getComputedStyle(p);
            if (!/auto|scroll|hidden|clip/.test(pcs.overflowX + pcs.overflowY)) continue;
            const pr = p.getBoundingClientRect();
            vr = { top: Math.max(vr.top, pr.top), bottom: Math.min(vr.bottom, pr.bottom), left: Math.max(vr.left, pr.left), right: Math.min(vr.right, pr.right) };
          }
          if (vr.right - vr.left <= 1 || vr.bottom - vr.top <= 1) continue;   
          const over = Math.min(vr.bottom, d.bottom) - Math.max(vr.top, d.top);
          const across = Math.min(vr.right, d.right) - Math.max(vr.left, d.left);
          if (over > 1 && across > 1 && over > hide) { hide = over; const c = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""; hsel = el.tagName.toLowerCase() + (c ? "." + c : ""); }
        }
      }
      return { ox, sel, fit, oy, vsel, hide: Math.round(hide), hsel };
    });
    const label = `${bp.id} ${bp.w}×${bp.h}`;
    const push = (pass, failed) => out.push(pass ? failed.pass : failed.fail);
    push(m.ox <= 1, {
      pass: { name: `${label}: без горизонтального overflow`, ok: true, msg: bp.note },
      fail: { name: `${label}: горизонтальний overflow`, ok: false, msg: `+${m.ox}px — винуватець: ${m.sel}` },
    });
    if (m.fit) {
      push(m.oy <= 1, {
        pass: { name: `${label}: один екран без скролу (fit)`, ok: true },
        fail: { name: `${label}: fit-екран не вміщується`, ok: false, msg: `+${m.oy}px по висоті — винуватець: ${m.vsel}. Ущільніть через --ms-* або перенесіть у Sheet` },
      });
      push(m.hide <= 1, {
        pass: { name: `${label}: док нічого не перекриває (fit)`, ok: true },
        fail: { name: `${label}: док ховає контент назавжди (fit)`, ok: false, msg: `${m.hide}px — під доком: ${m.hsel}. На fit-екрані ніщо не скролиться, тож це сховано назавжди — --dock-h має міряти реальну висоту доку` },
      });
    }
  }
  await page.setViewportSize({ width: dev.width, height: dev.height });
  await sleep(260);
  return out;
}

export async function runDesignChecks(ev) {
  const out = [];
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
    const base = await ev(() => document.documentElement.getAttribute("data-theme") || "signal");
    const flipped = await ev((th) => { const t = th.includes("light") ? th : th + "-light"; document.documentElement.setAttribute("data-theme", t); return t; }, base);
    await sleep(200);
    out.push(axeResult(await runAxe(), `light (${flipped})`));
    await ev((th) => document.documentElement.setAttribute("data-theme", th), base);
  } catch (e) { out.push({ name: "a11y (axe)", ok: false, msg: "не вдалось завантажити axe: " + e.message }); }

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
  const watch = await ev(() => {
    const widest = (box) => {
      let far = box.getBoundingClientRect().right, sel = "?";
      for (const el of box.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > far + 0.5) {
          far = r.right;
          const c = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
          sel = el.tagName.toLowerCase() + (c ? "." + c : "");
        }
      }
      return sel;
    };
    const cards = [...document.querySelectorAll(".card")];
    if (cards.length) {
      let m = 0, sel = "?";
      cards.forEach((c) => { const o = c.scrollWidth - c.clientWidth; if (o > m) { m = o; sel = widest(c); } });
      return { mode: "card", o: m, sel };
    }
    const v = document.getElementById("view");
    return { mode: "view", o: v ? v.scrollWidth - v.clientWidth : 0, sel: v ? widest(v) : "?" };
  });
  await ev(() => { const v = document.getElementById("view"); if (v) v.style.maxWidth = ""; });   
  out.push(watch.o <= 2
    ? { name: `watch ~200px: ${watch.mode === "card" ? "контент уміщується (container query)" : "без overflow (custom view)"}`, ok: true }
    : { name: "watch ~200px: контент не вміщується", ok: false, msg: `+${watch.o}px overflow${watch.mode === "card" ? " у картці" : ""} — винуватець: ${watch.sel}` });
  await ev(() => document.getElementById("__freeze")?.remove());
  return out;
}
