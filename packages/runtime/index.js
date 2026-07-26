import { render } from "preact";
import { html } from "htm/preact";
import { validateSpec } from "./validate.js";
import { createApp } from "./store.js";
import { overlayDepth } from "./overlay.js";
import { setApp, App } from "./render.js";
import { haptic, hapticFor } from "./sensors.js";
import { installSealedFetch } from "./sealedfetch.js";

installSealedFetch();

function registerWorker(app) {
  if (!("serviceWorker" in navigator)) return;
  const S = app.S;
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => {
    const offer = () => S.update.set(true);
    if (reg.waiting && navigator.serviceWorker.controller) offer();
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) offer(); });
    });
    navigator.serviceWorker.addEventListener("message", (e) => { if (e.data?.type === "ms-update") offer(); });
    let asked = false;
    app.applyUpdate = () => {
      asked = true;
      if (reg.waiting) reg.waiting.postMessage("ms-skip-waiting");   
      else location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!asked) return;   
      asked = false;
      location.reload();
    });
  }).catch(() => {});
}

export function start(spec, arg2) {
  try { validateSpec(spec); }
  catch (e) { console.error("%c⛔ Invalid spec.json — app not started\n%c" + e.message, "font-weight:bold;color:#f87171", "color:#fca5a5"); throw e; }

  const opts = typeof arg2 === "function" ? { load: arg2 } : (arg2 || {});
  const app = createApp(spec, opts.load || (async () => ({ items: [], meta: {} })));
  app.canRefresh = typeof opts.load === "function";
  setApp(app, opts.views || {});
  const { S, load } = app;

  const applyTheme = (t) => document.documentElement.setAttribute("data-theme", t);
  const urlTheme = (() => {
    try { const q = new URLSearchParams(location.search).get("theme"); return q ? (q.includes("light") ? "signal-light" : "signal") : null; } catch { return null; }
  })();
  applyTheme(urlTheme || S.theme.get());
  S.theme.listen((t) => applyTheme(urlTheme || t));

  if (spec.accent) document.documentElement.style.setProperty("--app-accent", spec.accent);

  const applyLang = (l) => { try { document.documentElement.lang = l; } catch {  } };
  applyLang(S.locale.get());
  S.locale.listen(applyLang);

  addEventListener("pointerdown", (e) => {
    const pattern = hapticFor(e.target);
    if (pattern) haptic[pattern]?.();
  }, { capture: true, passive: true });

  render(html`<${App} />`, document.getElementById("app"));
  const boot = document.getElementById("boot");
  if (boot && !/[?&]__boot\b/.test(location.search)) { requestAnimationFrame(() => { boot.classList.add("gone"); setTimeout(() => boot.remove(), 450); }); } 
  S.tab.listen(() => { window.scrollTo({ top: 0 }); if (S.screen.get()) S.screen.set(null); }); 

  const overlays = [
    [S.stack, () => S.stack.set(S.stack.get().slice(0, -1)), (v) => v],   
    [S.sheet, () => S.sheet.set(false), (v) => v === true],
    [S.installOpen, () => S.installOpen.set(false), (v) => v === true],
    [S.qrOpen, () => S.qrOpen.set(false), (v) => v === true],
    [S.screen, () => S.screen.set(null), (v) => v != null],
    [S.detail, () => S.detail.set(null), (v) => v != null],
    [S.player, () => S.player.set(null), (v) => v != null],
    [S.confirm, () => S.confirm.set(null), (v) => v != null],   
  ];
  const depthOf = ([a, , isOpen]) => overlayDepth(isOpen(a.get()));
  const openCount = () => overlays.reduce((n, o) => n + depthOf(o), 0);
  const anyOpen = () => openCount() > 0;
  let depth = 0, fromPop = false, selfBack = 0, exitArmed = false, exitTimer;
  for (const [a] of overlays) a.listen(() => {
    const n = openCount();
    if (fromPop) { depth = n; return; }                       
    if (n > depth) { const d = n - depth; depth = n; for (let i = 0; i < d; i++) history.pushState({ msOverlay: 1 }, ""); }  
    else if (n < depth) { const d = depth - n; depth = n; if (history.state?.msOverlay) { selfBack++; history.go(-d); } } 
  });
  history.pushState({ msRoot: 1 }, "");
  addEventListener("popstate", () => {
    if (selfBack) { selfBack--; return; }                                       
    if (anyOpen()) {
      for (let i = overlays.length - 1; i >= 0; i--) {
        const [, close] = overlays[i];
        if (!depthOf(overlays[i])) continue;
        fromPop = true; try { close(); } finally { fromPop = false; }
        depth = openCount();
        break;
      }
      return;
    }
    if (exitArmed) { clearTimeout(exitTimer); exitArmed = false; history.back(); return; } 
    exitArmed = true;
    history.pushState({ msRoot: 1 }, "");                                              
    app.toast("__exit__");
    exitTimer = setTimeout(() => { exitArmed = false; }, 2000);
  });

  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); S.installEvent.set(e); });
  addEventListener("appinstalled", () => { S.installEvent.set(null); S.installOpen.set(false); });
  registerWorker(app);

  const hold = typeof location !== "undefined" && location.search.includes("__hold");
  if (opts.stream) {
    const push = (items) => S.data.set({ ...S.data.get(), items: items || [], loading: false, error: false });
    if (!hold) try { opts.stream(push, S); } catch { S.data.set({ ...S.data.get(), loading: false, error: true }); }
  } else if (!hold) {
    load();
  }
}
