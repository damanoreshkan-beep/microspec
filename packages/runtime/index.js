// microspec runtime — entry. The app's index.html imports its spec.json + data.js and calls start().
import { render } from "preact";
import { html } from "htm/preact";
import { validateSpec } from "./validate.js";
import { createApp } from "./store.js";
import { overlayDepth } from "./overlay.js";
import { setApp, App } from "./render.js";
import { haptic, hapticFor } from "./sensors.js";

// start(spec, load) — data app; OR start(spec, { load?, views? }) — tool app with custom views.
export function start(spec, arg2) {
  try { validateSpec(spec); }
  catch (e) { console.error("%c⛔ Invalid spec.json — app not started\n%c" + e.message, "font-weight:bold;color:#f87171", "color:#fca5a5"); throw e; }

  const opts = typeof arg2 === "function" ? { load: arg2 } : (arg2 || {});
  const app = createApp(spec, opts.load || (async () => ({ items: [], meta: {} })));
  // Only data apps pass a real load — for tool/stream apps the AppBar refresh would be a dead affordance
  // (it calls the no-op load and updates nothing), so it's hidden there. See the taste-gate finding.
  app.canRefresh = typeof opts.load === "function";
  setApp(app, opts.views || {});
  const { S, load } = app;

  const applyTheme = (t) => document.documentElement.setAttribute("data-theme", t);
  applyTheme(S.theme.get());
  S.theme.listen(applyTheme);

  // Touch feedback, for the whole farm, from one place. These are apps, not pages: a tap that answers
  // is most of what separates the two, and a runtime that leaves it to each view ships a dock that
  // buzzes next to buttons that don't. `pointerdown`, not click — the answer has to land under the
  // finger, not after the handler. Passive + capture so it can never delay or swallow a gesture, and it
  // reads the element rather than the app's intent, so a control added tomorrow is already covered.
  // (navigator.vibrate is Android/Chrome; iOS Safari has no Vibration API at all and stays silent.)
  addEventListener("pointerdown", (e) => {
    const pattern = hapticFor(e.target);
    if (pattern) haptic[pattern]?.();
  }, { capture: true, passive: true });

  render(html`<${App} />`, document.getElementById("app"));
  // Dissolve the HTML instant app-shell (#boot) now the live app is painted underneath it — a crossfade from
  // the wordmark/loading-line shell to the real chrome in the same places, so first load never flashes blank.
  const boot = document.getElementById("boot");
  if (boot && !/[?&]__boot\b/.test(location.search)) { requestAnimationFrame(() => { boot.classList.add("gone"); setTimeout(() => boot.remove(), 450); }); } // ?__boot freezes the shell for review/gates
  S.tab.listen(() => { window.scrollTo({ top: 0 }); if (S.screen.get()) S.screen.set(null); }); // leaving a tab closes its sub-screen

  // Back-button routing invariant: hardware/browser Back closes an open overlay (detail, sheet,
  // install modal, tool sub-screen) instead of exiting the PWA. Each open state = one history entry;
  // closing via UI consumes it with history.back() so history stays balanced. Tabs are NOT routed.
  // Ordered BOTTOM → TOP: overlays stack, and Back must close only the top one. The player opens over a
  // detail, so a flat "Back closes everything" would drop the viewer from the film all the way back to the
  // list, losing the item they were reading — one history entry per open layer is what makes Back mean
  // "the previous screen" rather than "the beginning".
  // BOTTOM-most on purpose: S.stack is a drill-down INSIDE a tab (a dive, a drilled feed), and any sheet or
  // detail opened while you're down there was opened later, so it must close before the drill-down unwinds.
  const overlays = [
    [S.stack, () => S.stack.set(S.stack.get().slice(0, -1)), (v) => v],   // an array: one history entry PER level
    [S.sheet, () => S.sheet.set(false), (v) => v === true],
    [S.installOpen, () => S.installOpen.set(false), (v) => v === true],
    [S.qrOpen, () => S.qrOpen.set(false), (v) => v === true],
    [S.screen, () => S.screen.set(null), (v) => v != null],
    [S.detail, () => S.detail.set(null), (v) => v != null],
    [S.player, () => S.player.set(null), (v) => v != null],
    [S.confirm, () => S.confirm.set(null), (v) => v != null],   // danger-confirm sheet — stacks on top, Back cancels
  ];
  // Depth, not a boolean count: every overlay is worth 1 entry except a stack overlay, worth its length.
  const depthOf = ([a, , isOpen]) => overlayDepth(isOpen(a.get()));
  const openCount = () => overlays.reduce((n, o) => n + depthOf(o), 0);
  const anyOpen = () => openCount() > 0;
  // selfBack COUNTS our own balancing jumps, it is not a flag: two overlays can close in one tick (a tool
  // that resets a drill-down stack AND closes its sheet), that is two history.go() calls, two popstates —
  // and a boolean would swallow only the first, leaving the second to be read as a user Back at the root.
  let depth = 0, fromPop = false, selfBack = 0, exitArmed = false, exitTimer;
  for (const [a] of overlays) a.listen(() => {
    const n = openCount();
    if (fromPop) { depth = n; return; }                       // Back already consumed the entry — don't balance it
    if (n > depth) { const d = n - depth; depth = n; for (let i = 0; i < d; i++) history.pushState({ msOverlay: 1 }, ""); }  // a stack can grow by more than one
    else if (n < depth) { const d = depth - n; depth = n; if (history.state?.msOverlay) { selfBack++; history.go(-d); } } // closing via UI balances history
  });
  // Double-Back-to-exit at the app ROOT (TikTok-style). A persistent guard entry makes the first hardware/
  // browser Back at root catchable: we cancel it and warn, then allow a second Back within ~2s to leave.
  history.pushState({ msRoot: 1 }, "");
  addEventListener("popstate", () => {
    if (selfBack) { selfBack--; return; }                                       // our own balancing back()
    // Back closes the TOP-most overlay only — the player returns you to the detail you opened it from.
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
    if (exitArmed) { clearTimeout(exitTimer); exitArmed = false; history.back(); return; } // 2nd Back → actually leave
    exitArmed = true;
    history.pushState({ msRoot: 1 }, "");                                              // re-arm the guard → cancel this Back
    app.toast("__exit__");
    exitTimer = setTimeout(() => { exitArmed = false; }, 2000);
  });

  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); S.installEvent.set(e); });
  addEventListener("appinstalled", () => { S.installEvent.set(null); S.installOpen.set(false); });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

  // Test hook (gate only): ?__hold freezes the app in its LOADING state so the skeleton gate can inspect it.
  const hold = typeof location !== "undefined" && location.search.includes("__hold");
  if (opts.stream) {
    // Live data source (WebSocket/SSE/…): the app opens its own connection and pushes the current items;
    // the list family renders them with its search / filter / sort. The stream owns its reconnect logic.
    const push = (items) => S.data.set({ ...S.data.get(), items: items || [], loading: false, error: false });
    if (!hold) try { opts.stream(push, S); } catch { S.data.set({ ...S.data.get(), loading: false, error: true }); }
  } else if (!hold) {
    load();
  }
}
