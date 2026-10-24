/* @ts-self-types="./paysheet.d.ts" */
/**
 * # runtime/paysheet.js — the farm's ONE payment sheet, for any pack and any way to pay
 *
 * Every monetised path of an app opens the same sheet: a coin pack, a premium unlock, a donation. The sheet knows
 * nothing about Telegram Stars, TON or Bitcoin — the PRODUCT hands it `methods`, each one a small object that
 * prices a pack and starts a payment, and the sheet carries the person through it: choose → (await) → paid ·
 * held · expired · error. A method that settles in place (Stars: the Mini App's own invoice) answers at once; a
 * method paid in an outside wallet (TON, later Bitcoin) answers `await` with a link, the fields a wallet needs and
 * a `wait()` that resolves when the backend has judged the transfer — the sheet shows a QR, an "open wallet"
 * button and a live countdown meanwhile, and never polls on its own.
 *
 * The brand's mascot rides in the sheet's hero (`[data-mascot]`, the product's `--ds-mascot`): she breathes while
 * you choose, watches while the wallet is open, and leaps in a burst of sparks when the coins land. Every motion is
 * CSS on `data-pay-state` (runtime.css), off under `prefers-reduced-motion`; every colour is a theme token.
 *
 * ## Import
 * ```js
 * import { PaySheet } from "/_rt/paysheet.js";                    // an app's page
 * import { PaySheet } from "@microspec/core/runtime/paysheet.js"; // a product rt/ module
 * ```
 *
 * ## What it exports
 * - {@link PaySheet} — the component: `{ open, onClose, locale, title, packs, methods, onPaid, unit }`.
 * - {@link payStep} — the pure state machine every transition goes through (unit-tested).
 * - {@link mmss} — seconds → "m:ss", the countdown's text.
 *
 * ## A method
 * ```js
 * { id: "ton", label: "TON", icon: "token:ton", available: true,
 *   price: (pack) => "0.27 TON",
 *   pay: async (pack, { signal }) =>
 *     ({ status: "await", link: "ton://transfer/…", qr: "ton://transfer/…", exp: 1792864343,
 *        fields: [{ key: "comment", label: "Comment", value: "mriia-…" }],
 *        wait: (signal) => Promise<{ status: "paid", coins, balance } | { status: "held", why } | { status: "expired" }> }) }
 * ```
 * `pay` may also answer `{status:"paid", coins, balance}`, `{status:"cancelled"}` or `{status:"error", message}`.
 * A method may carry `aside: { label, note, href }` — one outbound link the sheet shows under the pay button and on
 * the waiting screen (where a person finds out they have none of that currency): where to get it, and why now.
 *
 * @module
 */
import { html } from "htm/preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { Sheet, Segmented } from "./ui.js";
import { sys } from "./i18n.js";
import { qrDataUri } from "./qrcode.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

/**
 * The sheet's state machine — pure, so every transition is tested and the view only renders `state`.
 * States: `choose` · `starting` · `await` · `paid` · `held` · `expired` · `error`. Events: `start`, `outcome`
 * (a method's answer), `back`, `reset`. An outcome that arrives in a state that no longer expects it is ignored —
 * a late answer after the person closed or went back must not repaint the sheet.
 * @param {{name: string, [k: string]: unknown}} state
 * @param {{type: string, [k: string]: unknown}} ev
 * @returns {{name: string, [k: string]: unknown}}
 */
export function payStep(state, ev) {
  switch (ev.type) {
    case "reset": return { name: "choose" };
    case "start": return state.name === "choose" || state.name === "error" || state.name === "expired" ? { name: "starting", pack: ev.pack, method: ev.method } : state;
    case "back": return state.name === "await" || state.name === "error" || state.name === "expired" || state.name === "held" ? { name: "choose" } : state;
    case "outcome": {
      if (state.name !== "starting" && state.name !== "await") return state;
      const o = /** @type {any} */ (ev.outcome) || {};
      const keep = { pack: state.pack, method: state.method };
      if (o.status === "await" && state.name === "starting") return { name: "await", ...keep, link: o.link, qr: o.qr || o.link, exp: o.exp, fields: o.fields || [] };
      if (o.status === "paid") return { name: "paid", ...keep, coins: o.coins, balance: o.balance };
      if (o.status === "held") return { name: "held", ...keep, why: o.why };
      if (o.status === "expired") return { name: "expired", ...keep };
      if (o.status === "cancelled") return { name: "choose", note: "payCancelled" };
      return { name: "error", ...keep, message: o.message || "" };
    }
    default: return state;
  }
}

/** Seconds → "m:ss" (never negative). @param {number} s @returns {string} */
export const mmss = (s) => { const n = Math.max(0, Math.floor(Number(s) || 0)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`; };

// a number that counts up to its value when it appears — the moment the coins land
function CountUp({ to }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const end = Number(to) || 0;
    if (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(end); return; }
    let raf = 0; const t0 = performance.now();
    const tick = (t) => { const k = Math.min(1, (t - t0) / 900); setV(Math.round(end * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return html`<span>${v}</span>`;
}

function Countdown({ exp, loc }) {
  const left = () => Math.max(0, Math.round(Number(exp) - Date.now() / 1000));
  const [s, setS] = useState(left());
  useEffect(() => { if (!exp) return; const id = setInterval(() => setS(left()), 1000); return () => clearInterval(id); }, [exp]);
  return exp ? html`<span data-pay-left class="font-mono tabular-nums">${sys("payLeft", loc).replace("{t}", mmss(s))}</span>` : null;
}

// a method's one outbound link (where to get the currency) — a quiet card, never a second primary button
function Aside({ a }) {
  return a && a.href ? html`<a href=${a.href} target="_blank" rel="noopener" data-pay-aside
    class="w-full flex items-center gap-3 rounded-[var(--ms-r)] border border-base-content/10 px-3 py-2 text-left active:scale-[.99] transition-transform">
    ${Icon("lucide:gift", "shrink-0 text-xl text-[var(--app-accent)]")}
    <span class="flex-1 min-w-0">
      <span class="block font-semibold text-[0.9rem] leading-tight">${a.label}</span>
      ${a.note ? html`<span class="block text-[0.8rem] text-base-content/70 leading-snug">${a.note}</span>` : null}
    </span>
    ${Icon("lucide:arrow-up-right", "shrink-0 text-lg text-base-content/70")}
  </a>` : null;
}

function CopyField({ f, loc }) {
  const [done, setDone] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(String(f.value)); setDone(true); setTimeout(() => setDone(false), 1400); } catch { /* the value stays selectable */ } };
  return html`<button type="button" data-pay-field=${f.key || ""} onClick=${copy}
    class="w-full flex items-center gap-3 rounded-[var(--ms-r)] border border-base-content/10 px-3 py-2 text-left active:scale-[.99] transition-transform">
    <span class="flex-1 min-w-0">
      <span class="block font-mono uppercase tracking-wide text-[length:var(--ms-label)] text-base-content/70">${f.label}</span>
      <span class="block font-mono text-sm truncate select-all">${f.value}</span>
    </span>
    ${Icon(done ? "lucide:check" : "lucide:copy", "shrink-0 text-lg text-base-content/70")}
  </button>`;
}

/**
 * The payment sheet. `packs`: `[{ id, amount, badge? }]` (amount = what the person gets, in `unit`); `methods`: see
 * the module doc; `onPaid(outcome)` runs once the coins are in. `title` defaults to the system "Top up".
 * @param {{ open: boolean, onClose: () => void, locale?: string, title?: string, unit?: string,
 *   packs: Array<{id: string, amount: number, badge?: string}>,
 *   methods: Array<{id: string, label: string, icon?: string, available?: boolean, price: (pack: any) => string, pay: (pack: any, ctx: {signal: AbortSignal}) => Promise<any>, aside?: {label: string, note?: string, href: string}}>,
 *   onPaid?: (outcome: any) => void, best?: string }} props
 * @returns {any}
 */
export function PaySheet({ open, onClose, locale, title, unit = "", packs, methods, onPaid, best }) {
  const loc = locale || (typeof document !== "undefined" ? document.documentElement.lang : "") || "en";
  const live = (methods || []).filter((m) => m.available !== false);
  const [methodId, setMethodId] = useState(live[0]?.id || "");
  const [packId, setPackId] = useState(best || packs?.[1]?.id || packs?.[0]?.id || "");
  const [st, setSt] = useState({ name: "choose" });
  const ctl = useRef(/** @type {AbortController|null} */ (null));
  const method = live.find((m) => m.id === methodId) || live[0];
  const pack = (packs || []).find((p) => p.id === packId) || packs?.[0];
  const send = (ev) => setSt((s) => payStep(s, ev));

  // closing aborts whatever is in flight and returns the sheet to the start for next time
  useEffect(() => { if (!open) { ctl.current?.abort(); ctl.current = null; setSt({ name: "choose" }); } }, [open]);

  const go = async () => {
    if (!method || !pack || st.name === "starting") return;
    ctl.current?.abort(); const c = new AbortController(); ctl.current = c;
    send({ type: "start", pack: pack.id, method: method.id });
    let o;
    try { o = await method.pay(pack, { signal: c.signal }); } catch (e) { o = { status: "error", message: String(e?.message || "") }; }
    if (c.signal.aborted) return;
    send({ type: "outcome", outcome: o });
    if (o?.status === "await" && typeof o.wait === "function") {
      let w;
      try { w = await o.wait(c.signal); } catch (e) { w = c.signal.aborted ? null : { status: "error", message: String(e?.message || "") }; }
      if (!w || c.signal.aborted) return;
      send({ type: "outcome", outcome: w });
      if (w.status === "paid") onPaid?.(w);
    } else if (o?.status === "paid") onPaid?.(o);
  };

  const s = st.name;
  const hero = html`<div data-pay-hero data-pay-state=${s} aria-hidden="true">
    <span data-pay-glow></span><span data-mascot data-pay-fox></span>
    ${s === "paid" ? html`<span data-pay-burst>${Array.from({ length: 12 }, (_, i) => html`<i style=${`--i:${i}`}></i>`)}</span>` : null}
  </div>`;

  const choose = html`<div data-pay-choose class="flex flex-col gap-[var(--ms-gap)]">
    ${live.length > 1 ? html`<${Segmented} items=${live.map((m) => ({ id: m.id, label: m.label, icon: m.icon }))} value=${method?.id} onChange=${setMethodId} attr="data-pay-method" label=${sys("payWith", loc)} />` : null}
    <div data-pay-packs class="grid grid-cols-3 gap-2">
      ${(packs || []).map((p) => html`<button key=${p.id} type="button" data-pay-pack=${p.id} aria-pressed=${p.id === pack?.id} onClick=${() => setPackId(p.id)}
        class=${`relative flex flex-col items-center gap-1 rounded-[var(--ms-r)] px-2 py-3 border transition-[transform,border-color] active:scale-[.97] ${p.id === pack?.id ? "border-[var(--app-accent)] bg-base-content/5" : "border-base-content/10"}`}>
        ${p.badge ? html`<span class="absolute -top-2 badge badge-sm font-mono uppercase text-[9px] tracking-wider border-[var(--app-accent)] text-[var(--app-accent)] bg-base-100">${p.badge}</span>` : null}
        <span class="font-mono tabular-nums text-2xl font-bold leading-none">${p.amount}</span>
        <span class="font-mono uppercase tracking-wide text-[length:var(--ms-label)] text-base-content/70">${unit}</span>
        <span class="font-mono tabular-nums text-[0.8rem] text-base-content/80">${method ? method.price(p) : ""}</span>
      </button>`)}
    </div>
    ${st.note ? html`<p data-pay-note class="text-[0.85rem] text-base-content/70" aria-live="polite">${sys(String(st.note), loc)}</p>` : null}
    <button type="button" data-pay-go class="btn btn-primary w-full" disabled=${!method || !pack} onClick=${go}>
      ${method?.icon ? Icon(method.icon, "text-lg") : null}${sys("payDo", loc).replace("{price}", method && pack ? method.price(pack) : "")}
    </button>
    <${Aside} a=${method?.aside} />
  </div>`;

  const starting = html`<div data-pay-starting class="flex flex-col gap-[var(--ms-gap)]">
    <button type="button" class="btn btn-primary w-full" disabled><span data-pay-shimmer>${sys("payPreparing", loc)}</span></button>
  </div>`;

  const waiting = html`<div data-pay-await class="flex flex-col items-center gap-[var(--ms-gap)]">
    ${/* a method paid elsewhere with no link of its own (Stars opened in Telegram) shows only the wait */""}
    ${st.qr ? html`<a href=${st.link} data-pay-qr class="block rounded-[var(--ms-r)] bg-white p-2 shadow-sm"><img src=${qrDataUri(String(st.qr), { margin: 2 })} alt="" width="168" height="168" class="block w-[min(42vw,10.5rem)] h-auto [image-rendering:pixelated]" /></a>` : null}
    ${st.link ? html`<a href=${st.link} data-pay-open class="btn btn-primary w-full">${Icon("lucide:wallet", "text-lg")}${sys("payOpen", loc)}</a>` : null}
    <div class="w-full flex flex-col gap-2">${(st.fields || []).map((f) => html`<${CopyField} key=${f.key || f.label} f=${f} loc=${loc} />`)}</div>
    <div class="flex items-center gap-2 text-[0.85rem] text-base-content/80" aria-live="polite">
      <span data-pay-dot></span><span>${sys("payWaiting", loc)}</span><span class="text-base-content/50">·</span><${Countdown} exp=${st.exp} loc=${loc} />
    </div>
    <${Aside} a=${live.find((m) => m.id === st.method)?.aside} />
    <button type="button" class="btn btn-ghost btn-sm" onClick=${() => { ctl.current?.abort(); send({ type: "back" }); }}>${sys("payBack", loc)}</button>
  </div>`;

  const paid = html`<div data-pay-paid class="flex flex-col items-center gap-2 text-center">
    <div class="font-mono tabular-nums text-5xl font-bold leading-none text-[var(--app-accent)]">+<${CountUp} to=${st.coins} /></div>
    <div class="font-mono uppercase tracking-wide text-[length:var(--ms-label)] text-base-content/70">${unit}</div>
    ${st.balance != null ? html`<div class="text-[0.9rem] text-base-content/80">${sys("payBalance", loc)} <span class="font-mono tabular-nums">${st.balance}</span></div>` : null}
    <button type="button" data-pay-done class="btn btn-primary w-full mt-2" onClick=${onClose}>${sys("payDoneBtn", loc)}</button>
  </div>`;

  const told = (head, body, verb, act) => html`<div data-pay-told=${s} class="flex flex-col items-center gap-2 text-center">
    <div class="font-bold text-[length:var(--ms-title)]">${head}</div>
    ${body ? html`<p class="text-[0.9rem] text-base-content/80 max-w-[30ch]">${body}</p>` : null}
    <button type="button" class="btn btn-primary w-full mt-2" onClick=${act}>${verb}</button>
  </div>`;

  const body = s === "choose" ? choose : s === "starting" ? starting : s === "await" ? waiting : s === "paid" ? paid
    : s === "held" ? told(sys("payHeld", loc), sys("payHeldBody", loc), sys("payDoneBtn", loc), onClose)
    : s === "expired" ? told(sys("payExpired", loc), sys("payExpiredBody", loc), sys("payNew", loc), () => send({ type: "back" }))
    : told(sys("payFailed", loc), st.message ? String(st.message) : "", sys("payRetry", loc), () => send({ type: "back" }));

  return html`<${Sheet} id="pay-sheet" open=${open} onClose=${onClose} title=${title || sys("payTitle", loc)} icon="lucide:sparkles" locale=${loc} tone="frost">
    <div data-paysheet class="flex flex-col gap-[var(--ms-gap)]">${hero}${body}</div>
  </${Sheet}>`;
}
