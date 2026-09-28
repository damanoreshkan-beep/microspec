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
  try { await Deno.remove(sock); } catch { }
  try { await Deno.remove(`/tmp/.X${dnum}-lock`); } catch { }
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
    keyDown: (code) => ev((code) => dispatchEvent(new KeyboardEvent("keydown", { code, key: code, bubbles: true })), code),
    keyUp: (code) => ev((code) => dispatchEvent(new KeyboardEvent("keyup", { code, key: code, bubbles: true })), code),
    key: async (code, ms = 250) => { await h.keyDown(code); await sleep(ms); await h.keyUp(code); },
    /** Press several keys together and release them — running and jumping is two keys at once. */
    keys: async (codes, ms = 250) => {
      for (const c of codes) await h.keyDown(c);
      await sleep(ms);
      for (const c of codes) await h.keyUp(c);
    },
    hasClass: (s, c) => ev((s, c) => !!document.querySelector(s)?.classList.contains(c), s, c),
    css: (s, prop) => ev((s, prop) => {
      const el = document.querySelector(s);
      return el ? getComputedStyle(el).getPropertyValue(prop).trim() : null;
    }, s, prop),
    scrollTo: (y) => ev((y) => window.scrollTo(0, y), y),
    scrollY: () => ev(() => window.scrollY),
    back: () => ev(() => history.back()),
    reload: async (settle = 1200) => { await page.reload({ waitUntil: "load" }); await sleep(settle); },
    goto: async (query = "", settle = 1200) => {
      const u = new URL(await ev(() => location.href));
      u.search = query ? (query.startsWith("?") ? query.slice(1) : query) : "";
      await page.goto(u.toString(), { waitUntil: "load" });
      await sleep(settle);
    },
    wait: (ms) => sleep(ms),
    expect: (cond, msg) => { if (!cond) throw new Error(msg || "assertion failed"); },
    waitFor: async (re, ms = 12000, step = 500) => { let t = ""; for (let i = 0; i < Math.ceil(ms / step); i++) { t = await ev(() => document.body.innerText); if (re.test(t)) return true; await sleep(step); } return re.test(t); },
  };
  return { h, ev };
}

export async function gotoAndSettle(page, url, settle = 3500) {
  await page.goto(url, { waitUntil: "load" });
  await sleep(settle);
  await layoutStill(page);
}

export async function layoutStill(page, { tries = 12, gap = 80 } = {}) {
  const read = () => page.evaluate(() => {
    try { document.fonts?.ready?.catch?.(() => {}); } catch { }
    const pending = [...document.querySelectorAll('link[rel~="stylesheet"]')]
      .filter((l) => { try { return new URL(l.href, location.href).origin === location.origin && !l.sheet; } catch { return false; } }).length;
    return document.documentElement.scrollWidth + ":" + document.documentElement.scrollHeight +
      ":" + (document.fonts && document.fonts.status === "loaded" ? 1 : 0) + ":" + pending;
  });
  let prev = await read();
  for (let i = 0; i < tries; i++) {
    await sleep(gap);
    const now = await read();
    if (now === prev && /:1:0$/.test(now)) return true;
    prev = now;
  }
  return false;
}

export const BREAKPOINTS = [
  { id: "phone-sm",    w: 320,  h: 568,  note: "9:16 · small-phone floor" },
  { id: "phone",       w: 384,  h: 832,  note: "20:9 · reference device" },
  { id: "phone-tall",  w: 412,  h: 915,  note: "9:19.5 · tall phone" },
  { id: "phone-land",  w: 844,  h: 390,  note: "19.5:9 · rotated — the height test" },
  { id: "split",       w: 412,  h: 430,  note: "split-screen — two apps stacked on a tall phone" },
  { id: "split-sm",    w: 360,  h: 340,  note: "floating window — the height floor" },
  { id: "tablet",      w: 768,  h: 1024, note: "3:4 · tablet portrait" },
  { id: "tablet-land", w: 1024, h: 768,  note: "4:3 · tablet landscape" },
  { id: "desktop",     w: 1280, h: 900,  note: "16:10 · desktop" },
];

export async function runResponsiveMatrix(page, ev, dev, { minWidth = 0 } = {}) {
  const out = [];
  for (const bp of BREAKPOINTS) {
    if (bp.w < minWidth) continue;
    await page.setViewportSize({ width: bp.w, height: bp.h });
    await sleep(260);
    const m = await ev(() => {
      const de = document.documentElement;
      const ox = de.scrollWidth - window.innerWidth;
      let sel = "?";
      if (ox > 1) {
        const clipped = (el) => {
          for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const cs = getComputedStyle(p);
            if (!/auto|scroll|hidden|clip/.test(cs.overflowX)) continue;
            const pr = p.getBoundingClientRect(), r = el.getBoundingClientRect();
            if (r.left > pr.right - 0.5 || r.right < pr.left + 0.5) return true;
          }
          return false;
        };
        let far = window.innerWidth, node = null;
        for (const el of document.querySelectorAll("body *")) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.right > far + 0.5 && !clipped(el)) { far = r.right; node = el; } }
        const chain = [];
        for (let el = node; el && el !== document.body && chain.length < 5; el = el.parentElement) {
          const c = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
          const b = el.getBoundingClientRect();
          chain.push(`${el.tagName.toLowerCase()}${c ? "." + c : ""}[w${Math.round(b.width)}→x${Math.round(b.right)}]`);
          if (chain.length === 2) {
            const sibs = [...el.children].slice(0, 6).map((k) => {
              const kb = k.getBoundingClientRect();
              const kc = typeof k.className === "string" ? k.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
              return `${k.tagName.toLowerCase()}${kc ? "." + kc : ""}:${Math.round(kb.width)}`;
            });
            if (sibs.length) chain.push(`⟨${sibs.join(" ")}⟩`);
          }
        }
        sel = chain.join(" ◂ ");
      }
      const fit = de.classList.contains("ms-fit");
      let oy = 0, vsel = "?";
      if (fit) {
        const v = document.getElementById("view");
        oy = v ? Math.max(v.scrollHeight - v.clientHeight, de.scrollHeight - window.innerHeight) : 0;
        if (oy > 1 && v) {
          let low = v.getBoundingClientRect().bottom, node = null;
          for (const el of v.querySelectorAll("*")) { const r = el.getBoundingClientRect(); if (r.height > 0 && r.bottom > low + 0.5) { low = r.bottom; node = el; } }
          const name = (el) => { const c = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""; return el.tagName.toLowerCase() + (c ? "." + c : ""); };
          if (node) {
            const kids = [...node.children].slice(0, 4).map((k) => {
              const cs = getComputedStyle(k);
              const tracks = cs.display.includes("grid") ? ` ${cs.gridTemplateColumns.split(" ").length}tr` : "";
              return `${name(k)}[h${Math.round(k.getBoundingClientRect().height)} ${cs.display}${tracks}]`;
            });
            vsel = `${name(node)}[h${Math.round(node.getBoundingClientRect().height)}]` + (kids.length ? ` ▾ ${kids.join(" + ")}` : "");
          }
        }
      }
      let hide = 0, hsel = "?", hgeo = "";
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
          if (over > 1 && across > 1 && over > hide) {
            hide = over;
            const c = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
            hsel = el.tagName.toLowerCase() + (c ? "." + c : "");
            const chain = [];
            for (let q = el; q && q !== document.body && chain.length < 4; q = q.parentElement) {
              const qs = getComputedStyle(q), qr = q.getBoundingClientRect();
              const cls = typeof q.className === "string" ? q.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
              chain.push(`${q.tagName.toLowerCase()}${cls ? "." + cls : ""}[${Math.round(qr.top)}→${Math.round(qr.bottom)} ${qs.display}/${qs.flexDirection} h${Math.round(qr.height)}]`);
            }
            hgeo = `el ${Math.round(vr.top)}→${Math.round(vr.bottom)} · dock ${Math.round(d.top)}→${Math.round(d.bottom)} · view ${Math.round(view.getBoundingClientRect().bottom)} · ${chain.join(" ◂ ")}`;
          }
        }
      }
      let clear = 999, csel = "?";
      if (nav && view) {
        const d = nav.getBoundingClientRect();
        const vertical = d.width < window.innerWidth * 0.9;
        for (const el of view.querySelectorAll("*")) {
          const r = el.getBoundingClientRect();
          if (r.width < 24 || r.height < 12) continue;
          const cs = getComputedStyle(el);
          if (cs.pointerEvents === "none" || cs.position === "fixed" || el.getAttribute("aria-hidden") === "true") continue;
          const painted = cs.backgroundImage !== "none" ||
            !/^rgba\(0, 0, 0, 0\)$|^transparent$/.test(cs.backgroundColor) ||
            cs.boxShadow !== "none" || parseFloat(cs.borderTopWidth) > 0;
          if (!painted) continue;
          let skip = false;
          for (let q = el.parentElement; q && q !== document.body; q = q.parentElement) {
            const qs = getComputedStyle(q);
            if (!/auto|scroll|hidden|clip/.test(qs.overflowX + qs.overflowY)) continue;
            const qr = q.getBoundingClientRect();
            if (r.right > qr.right - 0.5 || r.left < qr.left + 0.5) { skip = true; break; }
          }
          if (skip) continue;
          const gap = vertical ? d.left - r.right : d.top - r.bottom;
          const crosses = vertical
            ? (r.bottom > d.top && r.top < d.bottom)
            : (r.right > d.left && r.left < d.right);
          if (!crosses || gap < 0) continue;
          if (gap < clear) { clear = gap; const c = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""; csel = el.tagName.toLowerCase() + (c ? "." + c : ""); }
        }
      }
      const minGap = Math.max(10, (parseFloat(getComputedStyle(de).getPropertyValue("--ms-gap")) * 16 || 8) * 1.5);
      return { ox, sel, fit, oy, vsel, hide: Math.round(hide), hsel, hgeo, clear: clear === 999 ? -1 : Math.round(clear), minGap: Math.round(minGap), csel };
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
      if (m.clear >= 0 && m.clear < m.minGap) {
        out.push({ name: `${label}: контент притиснутий до хрому (fit)`, ok: false,
          msg: `${m.clear}px замість ${m.minGap}px — ${m.csel}. Просвіт має бути щонайменше --ms-gap: інакше віджет читається як приварений до таб-бару` });
      }
      push(m.hide <= 1, {
        pass: { name: `${label}: док нічого не перекриває (fit)`, ok: true },
        fail: { name: `${label}: док ховає контент назавжди (fit)`, ok: false, msg: `${m.hide}px — під доком: ${m.hsel}. На fit-екрані ніщо не скролиться, тож це сховано назавжди — --dock-h має міряти реальну висоту доку`, detail: m.hgeo ? [m.hgeo] : [] },
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
    const nameOf = (el) => {
      const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
      return (el.id ? "#" + el.id : el.tagName.toLowerCase()) + (cls ? "." + cls : "");
    };
    let sel = "?", far = window.innerWidth;
    for (const el of document.querySelectorAll("body *")) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.right > far + 0.5) { far = r.right; sel = nameOf(el); } }
    if (sel === "?") {
      let leftmost = 0, lsel = "", widest = null, w = 0;
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect(); if (r.width <= 0) continue;
        if (r.left < leftmost - 0.5) { leftmost = r.left; lsel = nameOf(el); }
        if (r.width > w) { w = r.width; widest = el; }
      }
      sel = leftmost < -0.5 ? `${lsel} (виступає ліворуч на ${Math.round(-leftmost)}px)`
        : widest ? `${nameOf(widest)}[w${Math.round(w)}] — найширший; за правий край ніхто не вийшов, підозрюй transform у кадрі` : "?";
    }
    return { ov, sel };
  });
  out.push(ovi.ov <= 1 ? { name: "phone 384px: без горизонтального overflow", ok: true } : { name: "phone 384px: overflow", ok: false, msg: `+${ovi.ov}px — винуватець: ${ovi.sel}` });

  const shifted = await ev(() => {
    const bad = [];
    for (const sel of ["header.navbar", "nav[data-dock]"]) {
      const el = document.querySelector(sel);
      if (!el) continue;
      for (const ps of ["::before", "::after"]) {
        const t = getComputedStyle(el, ps).transform;
        if (!t || t === "none") continue;
        const m = new DOMMatrix(t);
        if (Math.abs(m.m41) > 0.5) bad.push(`${sel}${ps} зсунуто на ${m.m41.toFixed(1)}px по X`);
      }
    }
    return bad;
  });
  out.push(shifted.length
    ? { name: "хром-декор без бічного зсуву", ok: false, msg: shifted.join("; ") }
    : { name: "хром-декор без бічного зсуву", ok: true });

  await ev(() => document.getElementById("__freeze")?.remove());
  return out;
}
