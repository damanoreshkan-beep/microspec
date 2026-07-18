import { render } from "preact";
import { html } from "htm/preact";
import { validateSpec } from "./validate.js";
import { createApp } from "./store.js";
import { setApp, App } from "./render.js";
import { haptic, hapticFor } from "./sensors.js";

export function start(spec, arg2) {
  try { validateSpec(spec); }
  catch (e) { console.error("%c⛔ Invalid spec.json — app not started\n%c" + e.message, "font-weight:bold;color:#f87171", "color:#fca5a5"); throw e; }

  const opts = typeof arg2 === "function" ? { load: arg2 } : (arg2 || {});
  const app = createApp(spec, opts.load || (async () => ({ items: [], meta: {} })));
  app.canRefresh = typeof opts.load === "function";
  setApp(app, opts.views || {});
  const { S, load } = app;

  const applyTheme = (t) => document.documentElement.setAttribute("data-theme", t);
  applyTheme(S.theme.get());
  S.theme.listen(applyTheme);

  addEventListener("pointerdown", (e) => {
    const pattern = hapticFor(e.target);
    if (pattern) haptic[pattern]?.();
  }, { capture: true, passive: true });

  render(html`<${App} />`, document.getElementById("app"));
  S.tab.listen(() => { window.scrollTo({ top: 0 }); if (S.screen.get()) S.screen.set(null); }); 

  const overlays = [
    [S.sheet, () => S.sheet.set(false), (v) => v === true],
    [S.installOpen, () => S.installOpen.set(false), (v) => v === true],
    [S.qrOpen, () => S.qrOpen.set(false), (v) => v === true],
    [S.screen, () => S.screen.set(null), (v) => v != null],
    [S.detail, () => S.detail.set(null), (v) => v != null],
    [S.player, () => S.player.set(null), (v) => v != null],
  ];
  const openCount = () => overlays.filter(([a, , isOpen]) => isOpen(a.get())).length;
  const anyOpen = () => openCount() > 0;
  let depth = 0, fromPop = false, selfBack = false, exitArmed = false, exitTimer;
  for (const [a] of overlays) a.listen(() => {
    const n = openCount();
    if (fromPop) { depth = n; return; }                       
    if (n > depth) { depth = n; history.pushState({ msOverlay: 1 }, ""); }
    else if (n < depth) { const d = depth - n; depth = n; if (history.state?.msOverlay) { selfBack = true; history.go(-d); } } 
  });
  history.pushState({ msRoot: 1 }, "");
  addEventListener("popstate", () => {
    if (selfBack) { selfBack = false; return; }                                       
    if (anyOpen()) {
      for (let i = overlays.length - 1; i >= 0; i--) {
        const [a, close, isOpen] = overlays[i];
        if (!isOpen(a.get())) continue;
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
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

  const hold = typeof location !== "undefined" && location.search.includes("__hold");
  if (opts.stream) {
    const push = (items) => S.data.set({ ...S.data.get(), items: items || [], loading: false, error: false });
    if (!hold) try { opts.stream(push, S); } catch { S.data.set({ ...S.data.get(), loading: false, error: true }); }
  } else if (!hold) {
    load();
  }
}
