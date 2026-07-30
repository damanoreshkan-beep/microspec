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
    // Headless by default (the farm is canvas-2D / no WebGL, so it renders identically and needs no Xvfb —
    // that's what kills ~15s of apt-get per matrix job). HEADFUL=1 forces a real display for debugging.
    headless: Deno.env.get("HEADFUL") === "1" ? false : true,
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
    /* Hold a key, then let go. Until this existed no gate in the farm could press a key at all, so
       "it works with a keyboard" was an assertion nobody could check — and a game is the one app
       where that claim is load-bearing. `code` is the physical key (ArrowRight, KeyZ, ShiftLeft),
       which is what a game listens to; dispatching on window matches where the handler lives. */
    /* keyDown/keyUp are separate on purpose: a HELD key is a state, and the interesting assertions
       (does the on-screen key light up, does a tap erase what the keyboard is holding) can only be
       made while it is still down. A press-and-release helper cannot express that, and a test
       written against one silently checks the moment AFTER the release — which is how the first
       version of these cases failed against perfectly good code. */
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
    /* The COMPUTED value, which is a different thing from the class list and a very different thing
       from the source. The farm's own rule says "do not assert source text where you can assert the
       computed result", and until now the harness could not: `hasClass` proves a class was written,
       not that anything came of it.
       It exists because of a defect that shipped with every gate green. A console's whole geometry —
       its plastic, its aperture, its radii, its plate — travels as custom properties on one element,
       and that element also receives a spread of props carrying a `style` of its own. The spread came
       second, so it REPLACED the geometry rather than merging with it, and nine shells rendered as
       one. Nothing could see it: the classes were all present, the JS-level differences still worked,
       a11y and overflow were unaffected. `getPropertyValue` reads custom properties too, which is the
       only way to prove a variable actually reached the element it is supposed to describe. */
    css: (s, prop) => ev((s, prop) => {
      const el = document.querySelector(s);
      return el ? getComputedStyle(el).getPropertyValue(prop).trim() : null;
    }, s, prop),
    scrollTo: (y) => ev((y) => window.scrollTo(0, y), y),
    scrollY: () => ev(() => window.scrollY),
    back: () => ev(() => history.back()),
    // Reload the page and wait for the app to settle. The ONLY way to test that something survives a
    // session: an app persisting to IndexedDB is indistinguishable from one that silently drops it until
    // you actually come back. Without this the gate could never tell "saved" from "lost".
    reload: async (settle = 1200) => { await page.reload({ waitUntil: "load" }); await sleep(settle); },
    // Load the app AT a query — `?tab=`/`?screen=`/`?theme=`/`?locale=`/`?detail=`/`?mock`. Those params
    // exist because the screenshot service and preflight cannot tap, so they are the only way a deep screen
    // is ever reviewed; a gate that never exercises them lets that door rot shut without a single failure.
    goto: async (query = "", settle = 1200) => {
      const u = new URL(page.url());
      u.search = query ? (query.startsWith("?") ? query.slice(1) : query) : "";
      await page.goto(u.toString(), { waitUntil: "load" });
      await sleep(settle);
    },
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

// ── The responsive matrix ─────────────────────────────────────────────────────────────────────────────
// Real breakpoints at real aspect ratios, because "it fits on my phone" was never the standard and the
// gate that only ever measured 384×832 could not say otherwise. Two dimensions were missing and both
// ship bugs: WIDTH below the reference device (a 320px phone is still the floor of the market), and
// HEIGHT at all — a phone in landscape is 390px tall, which is less than half the reference, and every
// single-screen instrument in this farm was laid out as if that viewport did not exist.
//
// 20:9, 9:16, 4:3, 3:4, 19.5:9 landscape and 16:10 — the proportions real screens actually come in.
export const BREAKPOINTS = [
  { id: "phone-sm",    w: 320,  h: 568,  note: "9:16 · small-phone floor" },
  { id: "phone",       w: 384,  h: 832,  note: "20:9 · reference device" },
  { id: "phone-tall",  w: 412,  h: 915,  note: "9:19.5 · tall phone" },
  { id: "phone-land",  w: 844,  h: 390,  note: "19.5:9 · rotated — the height test" },
  { id: "split",       w: 412,  h: 430,  note: "split-screen — two apps stacked on a tall phone" },
  { id: "split-sm",    w: 360,  h: 340,  note: "floating window — the height floor" },
  // A REAL watch viewport (Apple Watch 46mm; Wear OS round is 227×227). The long-standing "watch ~200px"
  // check below narrows #view with an inline style inside a 384px window — so no media query fires, the
  // density tokens never step and the dock never becomes a rail. It tests a narrow ELEMENT; this tests the
  // screen, which is the only way the chrome itself is ever measured.
  { id: "watch",       w: 208,  h: 248,  note: "watch — the smallest real screen" },
  // The SQUARE watch is a different test, not a rounding of the one above: Wear OS round is 227×227 and
  // the floor is ~200×200, so the height drops from 248 to 200 while the width barely moves. Everything
  // that fails at this size fails VERTICALLY — which is exactly the axis the rail was meant to buy back,
  // so this is the shape that proves the trade actually worked.
  { id: "watch-sq",    w: 200,  h: 200,  note: "square watch (Wear OS round) — the vertical floor" },
  { id: "tablet",      w: 768,  h: 1024, note: "3:4 · tablet portrait" },
  { id: "tablet-land", w: 1024, h: 768,  note: "4:3 · tablet landscape" },
  { id: "desktop",     w: 1280, h: 900,  note: "16:10 · desktop" },
];

// runResponsiveMatrix — sweep every breakpoint and assert the layout HOLDS at each one.
//   • horizontal: nothing spills past the viewport, anywhere, ever;
//   • vertical: only for a FIT screen (a tab with `fit` → .ms-fit on <html>), where the contract is that
//     the page is exactly one viewport. Measured on #view's own box, not the document's, because a fit
//     page sets overflow:hidden — so content that does not fit is CLIPPED rather than scrollable, and a
//     document-level scroll check would call that a pass while the bottom control sits off-screen.
// Restores the original viewport before returning, so shots after it are still the reference device.
export async function runResponsiveMatrix(page, ev, dev) {
  const out = [];
  for (const bp of BREAKPOINTS) {
    await page.setViewportSize({ width: bp.w, height: bp.h });
    await sleep(260);                                   // let the height-token step + container queries settle
    const m = await ev(() => {
      const de = document.documentElement;
      const ox = de.scrollWidth - window.innerWidth;
      let sel = "?";
      if (ox > 1) {
        // Only elements that are actually ON SCREEN can be the reason the DOCUMENT is too wide. Anything
        // parked inside a horizontal scroller is clipped by it — the sheet's own inner scroll reported a
        // button at x736 in a 200px viewport, which is 536px of pure red herring.
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
        // The CHAIN, not just the furthest element. Three rounds were spent fixing "a button sticks out"
        // when the button was only the last thing in a container that was already too wide — the widest
        // ancestor is the one that has to change, and it is invisible if the check names a leaf. Each link
        // reports its own width so the first one wider than the viewport is the actual subject.
        const chain = [];
        for (let el = node; el && el !== document.body && chain.length < 5; el = el.parentElement) {
          const c = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
          // width AND right edge: a link that is narrow but sits far to the right overflows just as surely
          // as a wide one, and the two cases need opposite fixes (shrink it vs. stop pushing it).
          const b = el.getBoundingClientRect();
          chain.push(`${el.tagName.toLowerCase()}${c ? "." + c : ""}[w${Math.round(b.width)}→x${Math.round(b.right)}]`);
          // On the FIRST parent, list the siblings with their widths. A row overflows because of what is in
          // it, and "this child sticks out" never says which of its neighbours refuses to give up space —
          // which is the whole question when several are shrink-0.
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
        // The vertical case needs the same treatment the horizontal one got: naming the lowest element says
        // WHO overflows but never WHY, and "a Panel is too tall" is not something you can act on. So report
        // the offender with its own height, then its tallest children — the row that actually costs the
        // pixels is always one of them, and it is invisible from the parent alone.
        if (oy > 1 && v) {
          let low = v.getBoundingClientRect().bottom, node = null;
          for (const el of v.querySelectorAll("*")) { const r = el.getBoundingClientRect(); if (r.height > 0 && r.bottom > low + 0.5) { low = r.bottom; node = el; } }
          const name = (el) => { const c = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""; return el.tagName.toLowerCase() + (c ? "." + c : ""); };
          if (node) {
            // …and the COMPUTED display/tracks of each child. Three rounds went into why `.ms-cols` was
            // "choosing one column" before the measurement showed the grid had never applied at all — a
            // rule can be present, correct and matched, and still lose a cascade fight it never reports.
            // Geometry says what happened; computed style says what the browser decided.
            const kids = [...node.children].slice(0, 4).map((k) => {
              const cs = getComputedStyle(k);
              const tracks = cs.display.includes("grid") ? ` ${cs.gridTemplateColumns.split(" ").length}tr` : "";
              return `${name(k)}[h${Math.round(k.getBoundingClientRect().height)} ${cs.display}${tracks}]`;
            });
            vsel = `${name(node)}[h${Math.round(node.getBoundingClientRect().height)}]` + (kids.length ? ` ▾ ${kids.join(" + ")}` : "");
          }
        }
      }
      // The dock is `fixed`, so anything it covers is NOT an overflow — the page measures perfectly while
      // the bottom control sits under the bar. Nothing caught that: axe compares text to its background,
      // the fit check compares content to its box, and neither compares two boxes to each other.
      //
      // FIT SCREENS ONLY, and that distinction is the whole check. In a scrolling app the dock is a
      // floating island that content passes UNDER by design — whatever it covers at this scroll position
      // scrolls clear a moment later, and `main`'s --dock-h bottom padding guarantees the end of the list
      // can be reached. On a fit screen nothing scrolls, so anything under the dock is hidden forever.
      // (Decorative fixed layers — the dock fade, the stage scrim — are pointer-events-none and excluded;
      // they are MEANT to overlap.)
      let hide = 0, hsel = "?", hgeo = "";
      const nav = document.querySelector("nav[data-dock]");
      const view = document.getElementById("view");
      if (fit && nav && view) {
        const d = nav.getBoundingClientRect();
        for (const el of view.querySelectorAll("*")) {
          const r = el.getBoundingClientRect();
          if (r.width < 8 || r.height < 8) continue;
          // Only IN-FLOW content counts. Three things legitimately live under the dock and all three are
          // the farm's own idioms: the full-bleed ambient backdrop (`fixed inset-0 z-0`, aria-hidden — see
          // drift/rave/handpan), the dock's own fade, and any scrim. A `fixed` element sits outside the
          // layout that main's --dock-h padding protects, and aria-hidden means it is decoration, not
          // content. What must stay visible is the flowing column — and the island that started this
          // check is exactly that, so it is still caught.
          const cs = getComputedStyle(el);
          if (cs.pointerEvents === "none" || cs.position === "fixed" || el.getAttribute("aria-hidden") === "true") continue;
          // Compare the VISIBLE part of the element, not its raw rect. A page parked off-screen inside a
          // horizontal snap pager still has a bounding box out there to the right, and that box overlaps a
          // right-hand dock rail perfectly — so the check reported the watch pager as "content hidden under
          // the dock forever" when the page in question was simply the one you have not swiped to yet.
          // Clip against every scroll-clipping ancestor; nothing outside those is on screen at all.
          let vr = { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
          for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const pcs = getComputedStyle(p);
            if (!/auto|scroll|hidden|clip/.test(pcs.overflowX + pcs.overflowY)) continue;
            const pr = p.getBoundingClientRect();
            vr = { top: Math.max(vr.top, pr.top), bottom: Math.min(vr.bottom, pr.bottom), left: Math.max(vr.left, pr.left), right: Math.min(vr.right, pr.right) };
          }
          if (vr.right - vr.left <= 1 || vr.bottom - vr.top <= 1) continue;   // clipped away → not on screen
          const over = Math.min(vr.bottom, d.bottom) - Math.max(vr.top, d.top);
          const across = Math.min(vr.right, d.right) - Math.max(vr.left, d.left);
          if (over > 1 && across > 1 && over > hide) {
            hide = over;
            const c = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
            hsel = el.tagName.toLowerCase() + (c ? "." + c : "");
            /* The magnitude alone cannot tell you WHY. Two different layout bugs both report "38px
               under the dock", and the only way to tell them apart is where the boxes actually are —
               so print the geometry and the chain of ancestors that decided it. Three rounds went
               into guessing at this number with competing mental models; none of them survived one
               look at the rects. A check that names a subject but no geometry still leaves the fix
               to intuition. */
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
      // CLEARANCE — how much air is left between the flowing content and the chrome. Overlap is a bug;
      // zero clearance is a design failure the overlap test cannot see, and it is what makes a transport
      // look welded to the tab bar. Measured against --ms-gap so it follows the density ladder.
      let clear = 999, csel = "?";
      if (nav && view) {
        const d = nav.getBoundingClientRect();
        const vertical = d.width < window.innerWidth * 0.9;      // the watch rail is a column, not a bar
        for (const el of view.querySelectorAll("*")) {
          const r = el.getBoundingClientRect();
          if (r.width < 24 || r.height < 12) continue;
          const cs = getComputedStyle(el);
          if (cs.pointerEvents === "none" || cs.position === "fixed" || el.getAttribute("aria-hidden") === "true") continue;
          // Only PAINTED boxes count. A layout wrapper has no surface, so its edge is not something the eye
          // can see resting against the bar — measuring it just reports every full-height container.
          const painted = cs.backgroundImage !== "none" ||
            !/^rgba\(0, 0, 0, 0\)$|^transparent$/.test(cs.backgroundColor) ||
            cs.boxShadow !== "none" || parseFloat(cs.borderTopWidth) > 0;
          if (!painted) continue;
          // Third scan to learn the same rule: a box inside a horizontal RAIL is clipped by it, and a pill
          // touching the rail's edge is what a rail IS. The clearance that matters belongs to the rail, not
          // to its contents — so anything clipped by a scroll ancestor is not measured.
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
      // 1.5× the rhythm token, floored at 10px: --ms-gap alone passed a 12px gap between two glass panels
      // that the eye reads as one object. A gate that agrees with a bad screenshot is set too low.
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
      // zero clearance passes the overlap test and still looks welded — so it is its own check
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

// The 3 design checks (a11y / overflow@384 / watch-glance@200). Returns [{name, ok, msg, soft}].
//
// `minWidth` is the app's DECLARED floor (spec.minWidth, default 200). Below it the glance check
// still narrows #view, still measures, and still prints its number and its offending element —
// it is reported as a warning rather than a failure. An app that has stated it cannot go narrower
// than 320px is not hiding a defect: `brick` is a console whose pad and action keys are five tap
// targets in a row, and five times the 36px floor is 180px before a single gap.
//   Note this check narrows #view with an INLINE style inside a 384px window, so no media query
// fires while it runs — the density ladder never steps and .ms-side never becomes a pager. It is
// a test of an ELEMENT at 200px, not of a screen at 200px, which is precisely why an app whose
// controls are sized off the viewport can pass the real watch breakpoints and fail this one.
export async function runDesignChecks(ev, { minWidth = 200 } = {}) {
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
    // Name the offender — a check that reports a magnitude with no subject turns every fix into guesswork.
    // Same scan the responsive matrix does: the element whose right edge reaches furthest past the box.
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
  await ev(() => { const v = document.getElementById("view"); if (v) v.style.maxWidth = ""; });   // restore for subsequent shots
  const soft = minWidth > 200;
  out.push(watch.o <= 2
    ? { name: `watch ~200px: ${watch.mode === "card" ? "контент уміщується (container query)" : "без overflow (custom view)"}`, ok: true }
    : soft
      ? { name: `watch ~200px: нижче оголошеної підлоги ${minWidth}px`, ok: true, soft: true,
          msg: `+${watch.o}px overflow — винуватець: ${watch.sel} (spec.minWidth=${minWidth})` }
      : { name: "watch ~200px: контент не вміщується", ok: false, msg: `+${watch.o}px overflow${watch.mode === "card" ? " у картці" : ""} — винуватець: ${watch.sel}` });
  await ev(() => document.getElementById("__freeze")?.remove());
  return out;
}
