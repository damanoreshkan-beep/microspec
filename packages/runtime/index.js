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
    [S.detail, () => S.detail.set(null), (v) => v != null],
    [S.screen, () => S.screen.set(null), (v) => v != null],
    [S.sheet, () => S.sheet.set(false), (v) => v === true],
    [S.installOpen, () => S.installOpen.set(false), (v) => v === true],
  ];
  const anyOpen = () => overlays.some(([a, , isOpen]) => isOpen(a.get()));
  let pushed = false, selfBack = false, exitArmed = false, exitTimer;
  for (const [a] of overlays) a.listen(() => {
    const open = anyOpen();
    if (open && !pushed) { pushed = true; history.pushState({ msOverlay: 1 }, ""); }
    else if (!open && pushed) { pushed = false; if (history.state?.msOverlay) { selfBack = true; history.back(); } }  
  });
  history.pushState({ msRoot: 1 }, "");
  addEventListener("popstate", () => {
    if (selfBack) { selfBack = false; return; }                                       
    if (anyOpen()) { pushed = false; overlays.forEach(([, close]) => close()); return; }  
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
