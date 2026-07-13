// microspec runtime — entry. The app's index.html imports its spec.json + data.js and calls start().
import { render } from "preact";
import { html } from "htm/preact";
import { validateSpec } from "./validate.js";
import { createApp } from "./store.js";
import { setApp, App } from "./render.js";

// start(spec, load) — data app; OR start(spec, { load?, views? }) — tool app with custom views.
export function start(spec, arg2) {
  try { validateSpec(spec); }
  catch (e) { console.error("%c⛔ Invalid spec.json — app not started\n%c" + e.message, "font-weight:bold;color:#f87171", "color:#fca5a5"); throw e; }

  const opts = typeof arg2 === "function" ? { load: arg2 } : (arg2 || {});
  const app = createApp(spec, opts.load || (async () => ({ items: [], meta: {} })));
  setApp(app, opts.views || {});
  const { S, load } = app;

  const applyTheme = (t) => document.documentElement.setAttribute("data-theme", t);
  applyTheme(S.theme.get());
  S.theme.listen(applyTheme);

  render(html`<${App} />`, document.getElementById("app"));
  S.tab.listen(() => { window.scrollTo({ top: 0 }); if (S.screen.get()) S.screen.set(null); }); // leaving a tab closes its sub-screen

  // Back-button routing invariant: hardware/browser Back closes an open overlay (detail, sheet,
  // install modal, tool sub-screen) instead of exiting the PWA. Each open state = one history entry;
  // closing via UI consumes it with history.back() so history stays balanced. Tabs are NOT routed.
  const overlays = [
    [S.detail, () => S.detail.set(null), (v) => v != null],
    [S.screen, () => S.screen.set(null), (v) => v != null],
    [S.sheet, () => S.sheet.set(false), (v) => v === true],
    [S.installOpen, () => S.installOpen.set(false), (v) => v === true],
  ];
  const anyOpen = () => overlays.some(([a, , isOpen]) => isOpen(a.get()));
  let pushed = false;
  for (const [a] of overlays) a.listen(() => {
    const open = anyOpen();
    if (open && !pushed) { pushed = true; history.pushState({ msOverlay: 1 }, ""); }
    else if (!open && pushed) { pushed = false; if (history.state?.msOverlay) history.back(); }
  });
  addEventListener("popstate", () => { if (anyOpen()) { pushed = false; overlays.forEach(([, close]) => close()); } });

  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); S.installEvent.set(e); });
  addEventListener("appinstalled", () => { S.installEvent.set(null); S.installOpen.set(false); });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

  if (opts.stream) {
    // Live data source (WebSocket/SSE/…): the app opens its own connection and pushes the current items;
    // the list family renders them with its search / filter / sort. The stream owns its reconnect logic.
    const push = (items) => S.data.set({ ...S.data.get(), items: items || [], loading: false, error: false });
    try { opts.stream(push, S); } catch { S.data.set({ ...S.data.get(), loading: false, error: true }); }
  } else {
    load();
  }
}
