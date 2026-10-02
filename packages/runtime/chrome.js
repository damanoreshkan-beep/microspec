import { Fragment } from "preact";
import { useRef, useEffect, useState } from "preact/hooks";
import { html } from "htm/preact";
import { useStore } from "@nanostores/preact";
import { shell } from "./shell.js";
import { T, sys } from "./i18n.js";
import { SHEET_BOX } from "./ui.js";
import { useSheetDrag } from "./gesture.js";
import { A, Icon, debouncedLoad, watchOf, isIOS } from "./render-ctx.js";
import { SearchField } from "./list.js";

export function FilterChips() {
  const t = useStore(A.S.t), filters = useStore(A.S.filters);
  const f = A.spec.filters; if (!f) return null;
  const defaults = f.defaults || {}, refetch = f.refetch;
  const chips = [];
  for (const c of (f.controls || [])) {
    const v = filters[c.key], def = defaults[c.key] ?? (c.type === "toggle" ? false : "");
    if (c.type === "toggle") { if (v) chips.push({ key: c.key, label: T(t, c.label), reset: false }); continue; }
    if (c.type === "range") { const r = v || {}; if ((r.from ?? "") !== "" || (r.to ?? "") !== "") chips.push({ key: c.key, label: `${T(t, c.label)}: ${r.from ?? "…"}–${r.to ?? "…"}`, reset: {} }); continue; }
    if (c.type === "multi") { const sel = Array.isArray(v) ? v : []; const all = (c.options || []).length; if (sel.length < all) chips.push({ key: c.key, label: `${T(t, c.label)}: ${sel.length}/${all}`, reset: (c.options || []).map((o) => o[0]) }); continue; }
    if (v != null && v !== def) { const opt = (c.options || []).find((o) => o[0] === v); chips.push({ key: c.key, label: opt ? T(t, opt[1]) : String(v), reset: def }); }
  }
  if (!chips.length) return null;
  return html`<div class="flex flex-wrap gap-1.5 px-4 mt-2">${chips.map((ch) => html`<button class="badge badge-primary badge-outline gap-1 cursor-pointer" key=${ch.key} onClick=${() => { A.S.filters.setKey(ch.key, ch.reset); if (refetch) A.load(); }}>${ch.label} ${Icon("lucide:x", "text-xs")}</button>`)}</div>`;
}

export function FilterSheet() {
  const t = useStore(A.S.t), open = useStore(A.S.sheet), filters = useStore(A.S.filters), data = useStore(A.S.data);
  const f = A.spec.filters; if (!f) return null;
  const ref = useRef(); useEffect(() => { const d = ref.current; if (!d) return; open ? d.showModal?.() : d.close?.(); }, [open]);
  const { boxRef, grip } = useSheetDrag(() => A.S.sheet.set(false));
  return html`<dialog id="sheet" ref=${ref} class="modal modal-bottom" onClose=${() => A.S.sheet.set(false)}><div ref=${boxRef} class=${`${SHEET_BOX} pb-8 flex flex-col gap-3`}>${grip}
    <div class="flex items-center justify-between"><h3 class="font-bold text-lg">${T(t, "filterTitle")}</h3><button aria-label=${T(t, "close")} class="btn btn-ghost btn-sm btn-circle" onClick=${() => A.S.sheet.set(false)}>${Icon("lucide:x", "text-xl")}</button></div>
    ${(f.controls || []).map((c) => {
      if (c.type === "select") {
        const opts = c.options ? c.options.map(([v, l]) => ({ v, l: T(t, l) })) : (data.meta[c.optionsFrom] || []);
        return html`<label class="form-control" key=${c.key}><span class="text-sm flex items-center gap-2 mb-1">${c.icon ? Icon(c.icon) : null} ${T(t, c.label)}</span><select id=${"f-" + c.key} class="select select-bordered rounded-2xl w-full" value=${filters[c.key] || ""} onChange=${(e) => A.S.filters.setKey(c.key, e.target.value)}>${opts.map((o) => html`<option value=${o.v} key=${o.v}>${o.l}</option>`)}</select></label>`;
      }
      if (c.type === "toggle") return html`<label class="flex items-center justify-between" key=${c.key}><span class="flex items-center gap-2">${c.icon ? Icon(c.icon) : null} ${T(t, c.label)}</span><input id=${"f-" + c.key} type="checkbox" class="toggle toggle-primary" checked=${!!filters[c.key]} onChange=${(e) => A.S.filters.setKey(c.key, e.target.checked)} /></label>`;
      if (c.type === "range") { const r = filters[c.key] || {}; const set = (k, v) => A.S.filters.setKey(c.key, { ...(filters[c.key] || {}), [k]: v });
        return html`<label class="form-control" key=${c.key}><span class="text-sm flex items-center gap-2 mb-1">${c.icon ? Icon(c.icon) : null} ${T(t, c.label)}${c.unit ? html`<span class="text-base-content/50">(${c.unit})</span>` : null}</span><div class="flex items-center gap-2">
          <input id=${"f-" + c.key + "-from"} type="number" inputmode="decimal" step=${c.step || "any"} placeholder=${T(t, "rangeFrom")} value=${r.from ?? ""} class="input input-bordered rounded-2xl w-full tabular-nums" onInput=${(e) => set("from", e.target.value)} />
          <span class="text-base-content/40 shrink-0">–</span>
          <input id=${"f-" + c.key + "-to"} type="number" inputmode="decimal" step=${c.step || "any"} placeholder=${T(t, "rangeTo")} value=${r.to ?? ""} class="input input-bordered rounded-2xl w-full tabular-nums" onInput=${(e) => set("to", e.target.value)} />
        </div></label>`; }
      if (c.type === "multi") { const sel = Array.isArray(filters[c.key]) ? filters[c.key] : []; const toggle = (v) => { const s = new Set(sel); s.has(v) ? s.delete(v) : s.add(v); A.S.filters.setKey(c.key, [...s]); };
        return html`<${Fragment} key=${c.key}><span class="flex items-center gap-2 text-sm">${c.icon ? Icon(c.icon) : null} ${T(t, c.label)}</span><div class="flex flex-wrap gap-1.5" id=${"f-" + c.key}>${c.options.map(([v, l]) => html`<button class=${`btn btn-sm rounded-full gap-1 ${sel.includes(v) ? "btn-primary" : "btn-ghost border border-base-300"}`} data-val=${v} aria-pressed=${sel.includes(v)} key=${v} onClick=${() => toggle(v)}>${T(t, l)}</button>`)}</div></${Fragment}>`; }
      return html`<${Fragment} key=${c.key}><span class="flex items-center gap-2 text-sm">${c.icon ? Icon(c.icon) : null} ${T(t, c.label)}</span><div class="join w-full" id=${"f-" + c.key}>${c.options.map(([v, l]) => html`<button class=${`btn btn-sm join-item flex-1 ${(filters[c.key] || "") === v ? "btn-active" : ""}`} data-val=${v} key=${v} onClick=${() => A.S.filters.setKey(c.key, v)}>${T(t, l)}</button>`)}</div></${Fragment}>`;
    })}
    <button id="f-apply" class="btn btn-primary rounded-2xl mt-3" onClick=${() => { A.S.sheet.set(false); A.S.tab.set(A.spec.tabs[0].id); if (f.refetch) A.load(); }}>${T(t, "apply")}</button>
  </div><form method="dialog" class="modal-backdrop"><button>close</button></form></dialog>`;
}

export function InstallModal() {
  const t = useStore(A.S.t), open = useStore(A.S.installOpen), ev = useStore(A.S.installEvent);
  const ref = useRef(); useEffect(() => { const d = ref.current; if (!d) return; open ? d.showModal?.() : d.close?.(); }, [open]);
  const go = async () => { if (ev) { ev.prompt(); await ev.userChoice; A.S.installEvent.set(null); } A.S.installOpen.set(false); };
  const { boxRef, grip } = useSheetDrag(() => A.S.installOpen.set(false));
  return html`<dialog id="install" ref=${ref} class="modal modal-bottom" onClose=${() => A.S.installOpen.set(false)}><div ref=${boxRef} class=${`${SHEET_BOX} pb-8`}>${grip}
    <div class="flex items-center justify-between mb-3"><h3 class="font-bold text-lg flex items-center gap-2">${Icon("lucide:download", "text-primary")} ${T(t, "installTitle")}</h3><button aria-label=${T(t, "close")} class="btn btn-ghost btn-sm btn-circle" onClick=${() => A.S.installOpen.set(false)}>${Icon("lucide:x", "text-xl")}</button></div>
    <div class="text-sm text-base-content/70 mb-4">${T(t, "installDesc")}</div>
    ${ev ? html`<button id="install-go" class="btn btn-primary rounded-2xl w-full gap-2" onClick=${go}>${Icon("lucide:download")} ${T(t, "installBtn")}</button>` : html`<div class="flex items-start gap-2 bg-base-200 rounded-2xl px-3 py-3 text-sm">${Icon(isIOS() ? "lucide:share" : "lucide:menu", "text-lg mt-0.5")}<span>${isIOS() ? T(t, "installIosHint") : T(t, "installGenericHint")}</span></div>`}
  </div><form method="dialog" class="modal-backdrop"><button>close</button></form></dialog>`;
}

const QR_LBL = {
  en: { open: "Open on phone", title: "Open on your phone", stay: "Stay on desktop" },
  uk: { open: "Відкрити на телефоні", title: "Відкрити на телефоні", stay: "Залишитись на десктопі" },
};

function usePublishedChrome(kind) {
  const ref = useRef();
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const apply = () => {
      const s = document.documentElement.style;
      const h = el.offsetHeight;
      if (kind === "header") { if (h) s.setProperty("--hdr-h", `${h}px`); return; }
      const rail = (getComputedStyle(el).gridAutoFlow || "").includes("row");
      s.setProperty("--dock-h", rail ? "0px" : `${h + 24}px`);
      s.setProperty("--dock-w", rail ? `${el.offsetWidth}px` : "0px");
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return ref;
}

function useBattery() {
  const [b, setB] = useState(null);
  useEffect(() => {
    try {
      const q = new URLSearchParams(location.search), f = q.get("battery");
      if (f != null) { setB({ level: Math.max(0, Math.min(1, Number(f) / 100 || 0)), charging: q.get("charging") === "1", forced: true }); return; }
    } catch { }
    if ((!matchMedia("(display-mode: fullscreen)").matches && !shell.present) || typeof navigator === "undefined" || !navigator.getBattery) return;
    let bat, dead = false;
    const read = () => { if (!dead && bat) setB({ level: bat.level, charging: bat.charging }); };
    navigator.getBattery().then((m) => { bat = m; read(); m.addEventListener("levelchange", read); m.addEventListener("chargingchange", read); }).catch(() => {});
    return () => { dead = true; bat?.removeEventListener("levelchange", read); bat?.removeEventListener("chargingchange", read); };
  }, []);
  return b;
}

/**
 * The runtime's own battery indicator — a small glyph + percentage, shown only when the page runs in
 * fullscreen display-mode (the farm's WebAPKs hide the system status bar, so the runtime carries the one
 * reading that bar provided). `force` renders it regardless of display mode — for a surface that hides the
 * chrome itself, like a screensaver's show. Renders nothing when the Battery API is silent.
 * @param props `force` show even outside fullscreen display-mode
 * @returns the `[data-battery]` element, or null
 */
export function Battery({ force = false } = {}) {
  const b = useBattery(), loc = useStore(A.S.locale);
  if (!b || (!force && !b.forced && !matchMedia("(display-mode: fullscreen)").matches && !shell.present)) return null;
  const pct = Math.round(b.level * 100), low = !b.charging && pct <= 15;
  return html`<span data-battery data-charging=${b.charging ? "1" : null} role="status" aria-label=${`${sys("battery", loc)} ${pct}%`}
    class=${`flex items-center gap-1.5 shrink-0 font-mono text-[0.7rem] tabular-nums ${low ? "text-error" : "text-base-content/80"}`}>
    <svg width="24" height="12" viewBox="0 0 24 12" aria-hidden="true" class="shrink-0">
      <rect x="1" y="1.5" width="19" height="9" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".5" />
      <rect x="21.3" y="4" width="2" height="4" rx="1" fill="currentColor" opacity=".5" />
      <rect x="3" y="3.5" width=${Math.max(0.8, 15 * b.level)} height="5" rx="1.2" fill=${b.charging ? "var(--app-accent)" : "currentColor"} />
    </svg>
    <span>${pct}</span>
  </span>`;
}

export function AppBar() {
  const t = useStore(A.S.t), loc = useStore(A.S.locale);
  const qL = QR_LBL[loc] || QR_LBL.en;
  const hdrRef = usePublishedChrome("header");
  const cur = useStore(A.S.tab), searchOpen = useStore(A.S.searchOpen);
  const tab = A.spec.tabs.find((x) => x.id === cur) || A.spec.tabs[0];
  const searchable = tab?.type === "list" && !!tab.search;
  useEffect(() => { if (A.S.searchOpen.get()) A.S.searchOpen.set(false); }, [cur]);
  const fold = () => { A.S.query.set(""); if (tab?.searchFetch) debouncedLoad(); A.S.searchOpen.set(false); };
  if (searchable && searchOpen) {
    return html`<header ref=${hdrRef} class="navbar sticky top-0 z-30 px-4 gap-1" style="padding-top:var(--ms-safe-top)"><${SearchField} tab=${tab} /><button id="search-close" class="btn btn-ghost btn-sm btn-circle shrink-0" aria-label=${T(t, "close")} onClick=${fold}>${Icon("lucide:x", "text-xl")}</button></header>`;
  }
  return html`<header ref=${hdrRef} class="navbar sticky top-0 z-30 px-4 gap-1" style="padding-top:var(--ms-safe-top)"><div class="flex-1 min-w-0"><span data-title class="block truncate">${T(t, "title")}</span></div><${Battery} />${watchOf(cur)?.source ? html`<button id="watch-btn" class="btn btn-ghost btn-sm btn-circle shrink-0" aria-label=${sys("watchRow", loc)} onClick=${() => A.S.screen.set("watch")}>${Icon("lucide:bell", "text-xl")}</button>` : null}${searchable ? html`<input id="filter" type="search" class="hidden" tabindex="-1" aria-hidden="true" onInput=${(e) => { A.S.query.set(e.target.value); if (tab.searchFetch) debouncedLoad(); }} /><button id="search-btn" class="btn btn-ghost btn-sm btn-circle shrink-0" aria-label=${T(t, tab.searchKey || "search")} onClick=${() => A.S.searchOpen.set(true)}>${Icon("lucide:search", "text-xl")}</button>` : null}<button id="qr-open" class="btn btn-ghost btn-sm btn-circle shrink-0 hidden lg:inline-flex" aria-label=${qL.open} onClick=${() => A.S.qrOpen.set(true)}>${Icon("lucide:smartphone", "text-xl")}</button>${A.spec.filters ? html`<button id="filter-btn" class="btn btn-ghost btn-sm btn-circle" aria-label=${T(t, "ariaFilter")} onClick=${() => A.S.sheet.set(true)}>${Icon("lucide:sliders-horizontal", "text-xl")}</button>` : null}${A.canRefresh ? html`<button id="refresh" class="btn btn-ghost btn-sm btn-circle" aria-label=${T(t, "refresh")} onClick=${() => A.load()}>${Icon("lucide:rotate-cw", "text-xl")}</button>` : null}</header>`;
}

export function QrModal() {
  const open = useStore(A.S.qrOpen), loc = useStore(A.S.locale);
  const L = QR_LBL[loc] || QR_LBL.en;
  const ref = useRef(); useEffect(() => { const d = ref.current; if (!d) return; open ? d.showModal?.() : d.close?.(); }, [open]);
  const [uri, setUri] = useState("");
  const url = typeof location !== "undefined" ? location.href : "";
  useEffect(() => { if (!open) return; let live = true; import("./qrcode.js").then((m) => { if (live) setUri(m.qrDataUri(url, { margin: 3 })); }).catch(() => { }); return () => { live = false; }; }, [open, url]);
  const close = () => A.S.qrOpen.set(false);
  const { boxRef, grip } = useSheetDrag(close);
  return html`<dialog id="qr-invite" ref=${ref} class="modal modal-bottom" onClose=${close}><div ref=${boxRef} class=${`${SHEET_BOX} pb-8 flex flex-col items-center gap-4`}>${grip}
    <div class="flex items-center justify-between w-full"><h3 class="font-bold text-lg flex items-center gap-2">${Icon("lucide:smartphone", "text-primary")} ${L.title}</h3><button aria-label=${L.stay} class="btn btn-ghost btn-sm btn-circle" onClick=${close}>${Icon("lucide:x", "text-xl")}</button></div>
    ${""}
    <div class="rounded-2xl bg-white p-3 max-w-full">${uri ? html`<img data-qr src=${uri} alt="" width="216" height="216" class="block w-52 h-auto max-w-full" />` : html`<div class="w-52 max-w-full aspect-square"></div>`}</div>
    <div class="font-mono text-xs text-base-content/55 break-all text-center max-w-full">${url}</div>
    <button data-qr-stay class="btn btn-primary rounded-2xl w-full" onClick=${close}>${L.stay}</button>
  </div><form method="dialog" class="modal-backdrop"><button>close</button></form></dialog>`;
}

export const DockFade = () => html`<div aria-hidden="true" data-dock-fade class="fixed inset-x-0 bottom-0 z-20 pointer-events-none"
  style="height:calc(var(--dock-h) + env(safe-area-inset-bottom));background:linear-gradient(to top, var(--color-base-200) 18%, transparent 78%)">
  <div data-garland class="ms-decor"></div>
</div>`;

export function CleanExit() {
  const loc = useStore(A.S.locale);
  return html`<button data-clean-exit class="fixed right-3 z-30 btn btn-ghost btn-sm btn-circle sf-frost border border-white/15 bg-black/55 text-white/85 backdrop-blur-sm"
    style="top:calc(var(--ms-safe-top) + 0.5rem)" aria-label=${sys("cleanExit", loc)}
    onClick=${() => A.S.clean.set(false)}>${Icon("lucide:minimize-2", "text-base")}</button>`;
}

export function Dock() {
  const t = useStore(A.S.t), cur = useStore(A.S.tab);
  const navRef = usePublishedChrome("dock");
  return html`<nav data-dock ref=${navRef} class="sf-raised sf-e3 fixed left-3 right-3 mx-auto w-fit z-30 grid grid-flow-col gap-1 p-1 rounded-[1.35rem]">${A.spec.tabs.map((tab) => html`<button data-tab=${tab.id} key=${tab.id} aria-label=${T(t, tab.label)} aria-current=${cur === tab.id ? "page" : null} class=${`flex flex-col items-center gap-0.5 px-3.5 py-1.5 min-w-14 rounded-[1rem] transition-colors ${cur === tab.id ? "bg-primary text-primary-content" : "text-base-content/80"}`} onClick=${() => A.S.tab.set(tab.id)}>${Icon(tab.icon, "text-xl")}<span class="text-[0.7rem] leading-[1.4] truncate max-w-full">${T(t, tab.label)}</span></button>`)}</nav>`;
}

export function Toast() {
  const key = useStore(A.S.toast), undo = useStore(A.S.undo), t = useStore(A.S.t), loc = useStore(A.S.locale), update = useStore(A.S.update);
  const band = "position:fixed;left:0;right:0;bottom:0;z-index:50;display:flex;justify-content:center;padding-bottom:calc(var(--dock-h) + 0.75rem)";
  if (undo) {
    const label = undo.label ? `«${undo.label}» ` : "";
    return html`<div data-toast class="pointer-events-none" style=${band}>
      <div class="pointer-events-auto alert bg-neutral text-neutral-content border-0 rounded-2xl sf-e5 py-2 pl-4 pr-2 font-medium flex items-center gap-2 w-max max-w-[calc(100vw-1.5rem)] ms-reveal">
        ${Icon("lucide:trash-2", "text-base-content/55 text-lg shrink-0")}<span class="truncate">${label}${sys("deleted", loc)}</span>
        <button data-undo class="btn btn-sm btn-ghost text-primary font-semibold rounded-xl gap-1.5 shrink-0" onClick=${() => { const fn = A.S.undo.get()?.fn; A.S.undo.set(null); fn?.(); }}>${Icon("lucide:undo-2", "text-base")}${sys("undo", loc)}</button>
      </div>
    </div>`;
  }
  if (update && !key) {
    return html`<div data-toast class="pointer-events-none" style=${band}>
      <div data-update role="status" class="pointer-events-auto sf-raised sf-e5 bg-base-100 rounded-[var(--ms-r)] p-4 flex items-start gap-3 w-[calc(100vw-1.5rem)] max-w-sm ms-reveal">
        <div class="size-10 rounded-full grid place-items-center bg-primary/10 text-primary sf-lift2 shrink-0">${Icon("lucide:sparkles", "text-xl")}</div>
        <div class="flex-1 min-w-0">
          <div class="font-bold leading-tight">${sys("whatsNew", loc)}</div>
          <div class="text-sm text-base-content/80 mt-1 leading-snug">${update.text}</div>
        </div>
        <button data-update-dismiss aria-label=${sys("close", loc)} class="btn btn-sm btn-ghost btn-circle shrink-0" onClick=${() => A.S.update.set(null)}>${Icon("lucide:x", "text-lg")}</button>
      </div>
    </div>`;
  }
  const isExit = key === "__exit__";
  const text = isExit ? sys("exit", loc) : key === "saved" ? T(t, "toastSaved") : key === "removed" ? T(t, "toastRemoved") : key;
  const icon = isExit ? Icon("lucide:log-out", "text-base-content/70 text-lg") : Icon("lucide:check-circle", "text-success text-lg");
  return html`<div data-toast class="pointer-events-none" style=${band}><div class=${`alert bg-neutral text-neutral-content border-0 rounded-2xl sf-e5 py-3 px-5 font-medium flex items-center gap-2 w-max transition-opacity duration-200 ${key ? "opacity-100" : "opacity-0"}`}>${icon}${text || ""}</div></div>`;
}

export function ConfirmSheet() {
  const c = useStore(A.S.confirm), loc = useStore(A.S.locale);
  const ref = useRef(); useEffect(() => { const d = ref.current; if (!d) return; c ? d.showModal?.() : d.close?.(); }, [c]);
  const close = () => A.S.confirm.set(null);
  const go = () => { const fn = c?.onConfirm; close(); fn?.(); };
  const { boxRef, grip } = useSheetDrag(close);
  return html`<dialog id="confirm" ref=${ref} class="modal modal-bottom" onClose=${close}><div ref=${boxRef} class=${`${SHEET_BOX} pb-8`}>${grip}
    <h3 class="font-bold text-lg flex items-start gap-2">${Icon("lucide:triangle-alert", "text-error text-xl shrink-0 mt-0.5")}<span>${c?.title || ""}</span></h3>
    ${c?.body ? html`<p class="text-sm text-base-content/70 mt-2 pl-8">${c.body}</p>` : null}
    <div class="flex gap-2 mt-5">
      <button id="confirm-cancel" class="btn btn-ghost flex-1 rounded-2xl" onClick=${close}>${sys("cancel", loc)}</button>
      <button id="confirm-go" data-haptic="bump" class="btn btn-error flex-1 rounded-2xl" onClick=${go}>${c?.verb || ""}</button>
    </div>
  </div><form method="dialog" class="modal-backdrop"><button>close</button></form></dialog>`;
}
