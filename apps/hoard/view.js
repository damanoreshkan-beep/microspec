// apps/hoard — a pay rate turned into a living hoard. The maths (rate → per-second, the saturating fill
// and depth channels, the money and span formatting) is the unit-tested /_rt/earn.js; the look is
// hoard.frag on /_rt/glstage.js; this file is the clock, the store and the surface.
//
// The clock is a TIMESTAMP, never a counter. `hoard:startedAt` goes into localStorage on Start and every
// number on screen is derived from (Date.now() - startedAt): close the app, lock the phone, reboot — the
// hoard is exactly where the work left it. A per-tick accumulator would drift the moment the tab is
// backgrounded, which is the one thing this app must survive.
//
// The field never re-renders Preact: GlStage reads `ink`/`vary` as FUNCTIONS every frame, so one rAF pump
// integrates the channels and writes the three live strings straight into their nodes. A component that
// re-rendered at 60 fps would rebuild the whole fit screen for a number that changed in the second decimal.

import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { Sheet, Segmented, Island, Panel, FROST } from "/_rt/ui.js";
import { GlStage } from "/_rt/glstage.js";
import { collection } from "/_rt/db.js";
import { fitText } from "/_rt/fittext.js";
import {
  CURRENCIES, MODES, DEFAULTS, normRate, perSecond, earned, hoardFill, lifetimeDepth,
  rateDp, fmtAmount, fmtSpan, vaultTotals,
} from "/_rt/earn.js";

const JSON_CODEC = { encode: JSON.stringify, decode: (s) => { try { return JSON.parse(s); } catch { return null; } } };

const $rate = persistentAtom("hoard:rate", { mode: "month", ...DEFAULTS.month, currency: "UAH" }, JSON_CODEC);
const $startedAt = persistentAtom("hoard:startedAt", "0");     // ms epoch, "0" = nothing running
const $sessions = atom([]);                                     // banked, newest first (IndexedDB)

const ledger = collection("hoard");
const started = () => Number($startedAt.get()) || 0;

// The gate has no history and no hardware, so it would photograph a blank pool and an empty vault — the
// empty state of every screen this app has. Seed a running three-hour session and a week of banked work.
const FIXTURE_STARTED = 3 * 3600_000;
const FIXTURE_SESSIONS = [
  { id: "fx1", amount: 1190.48, ms: 8 * 3600_000, currency: "UAH", endedAt: 1755000000000, mode: "month" },
  { id: "fx2", amount: 1041.67, ms: 7 * 3600_000, currency: "UAH", endedAt: 1754910000000, mode: "month" },
  { id: "fx3", amount: 1339.29, ms: 9 * 3600_000, currency: "UAH", endedAt: 1754820000000, mode: "month" },
  { id: "fx4", amount: 744.05, ms: 5 * 3600_000, currency: "UAH", endedAt: 1754740000000, mode: "month" },
];

// db.js's all() orders by the record's WRITE time, which is not when the session ended — a restored undo,
// or a fixture set written in one loop, comes back shuffled (the vault shipped 10·9·12·11 серпня). The
// list is ordered by the field it is actually about.
const byEnded = (rows) => [...rows].sort((a, b) => (b.endedAt || b._ts || 0) - (a.endedAt || a._ts || 0));

async function loadSessions() {
  try {
    let all = await ledger.all();
    if (gate && !all.length) {
      for (const s of FIXTURE_SESSIONS) await ledger.put(s.id, s);
      all = await ledger.all();
    }
    $sessions.set(byEnded(all));
  } catch {
    $sessions.set(gate ? byEnded(FIXTURE_SESSIONS) : []);       // no IndexedDB (preflight): render anyway
  }
}
if (gate && !started()) $startedAt.set(String(Date.now() - FIXTURE_STARTED));

// ---- the live channels: read every frame by GlStage, integrated by the one rAF pump below ----
// #D8A43A (spec.accent) in display space. The shader shades and desaturates it; this is the hue only.
const GOLD = [0.847, 0.643, 0.227];
const env = { fill: 0.1, heat: 0, glint: 0, phase: 0, depth: 0 };
const varyOf = () => [env.fill, env.heat, env.glint, env.phase];
const inkOf = () => [GOLD[0], GOLD[1], GOLD[2], env.depth];

// ---- the hoard screen ----------------------------------------------------------------------------

export function flow({ t, S, toast }) {
  const loc = useStore(S.locale);
  const raw = useStore($rate);
  const sessions = useStore($sessions);
  const startAt = useStore($startedAt);
  const screen = useStore(S.screen);
  const rate = normRate(raw);
  const perSec = perSecond(rate);
  const running = Number(startAt) > 0;

  const boxRef = useRef(), amountRef = useRef(), elapsedRef = useRef();

  useEffect(() => { loadSessions(); }, []);

  // Everything ever banked in the ACTIVE currency: a hoard is one pile, and two currencies added together
  // would be a lie. It sets the resting height of the field and how rich the gold runs.
  const banked = vaultTotals(sessions).find((v) => v.currency === rate.currency)?.sum || 0;
  const depth = lifetimeDepth(banked, perSec);

  // ONE rAF pump: it integrates the shader channels and writes the three live strings. Restarted only when
  // something structural changes (the rate, the currency, whether a session runs) — never per frame.
  useEffect(() => {
    let raf = 0, dead = false, prev = 0, lastDom = -1, lastLen = -1, lastUnit = -1;
    env.depth = depth;
    // The resting height: what you have ALREADY banked. Without it a stopped hoard is an empty screen, and
    // the pile you spent a month on would vanish every time you pressed Bank.
    const rest = 0.10 + 0.45 * depth;
    const frame = (now) => {
      if (dead) return;
      const dt = prev ? Math.min(0.1, (now - prev) / 1000) : 0.016;
      prev = now;
      const ms = running ? Math.max(0, Date.now() - Number($startedAt.get())) : 0;
      const amount = earned(perSec, ms);

      env.heat += ((running ? 1 : 0) - env.heat) * Math.min(1, dt * 2.5);
      env.phase += dt * (0.35 + 0.9 * env.heat);
      env.fill += (Math.max(rest, running ? hoardFill(amount, perSec) : rest) - env.fill) * Math.min(1, dt * 1.2);
      env.glint *= Math.exp(-dt * 3.2);
      const unit = Math.floor(amount);
      if (running && lastUnit >= 0 && unit > lastUnit) env.glint = 1;   // a whole coin lands
      lastUnit = unit;

      // The DOM at 10 Hz, the field at 60: past ~10 updates a second the last digit is a blur nobody reads,
      // and each one costs a layout on a text node that is 80 px tall.
      if (now - lastDom > 100) {
        lastDom = now;
        const el = amountRef.current, box = boxRef.current;
        if (el) {
          const s = fmtAmount(amount, rate.currency, 2);
          el.textContent = s;
          // Refit only when the string CHANGES LENGTH: a binary search over font-size is ~26 reflows, and
          // the length changes once per order of magnitude, not once per tick.
          if (box && s.length !== lastLen) { lastLen = s.length; fitText(el, box); }
        }
        if (elapsedRef.current) elapsedRef.current.textContent = fmtSpan(ms);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const refit = () => { const el = amountRef.current, box = boxRef.current; if (el && box) { lastLen = -1; fitText(el, box); } };
    addEventListener("resize", refit);
    return () => { dead = true; cancelAnimationFrame(raf); removeEventListener("resize", refit); };
  }, [running, perSec, rate.currency, depth]);

  const start = () => $startedAt.set(String(Date.now()));
  const bank = async () => {
    const at = started();
    if (!at) return;
    const ms = Math.max(0, Date.now() - at);
    const amount = earned(perSec, ms);
    $startedAt.set("0");
    const rec = { amount, ms, currency: rate.currency, mode: rate.mode, endedAt: Date.now() };
    try { await ledger.put(String(at), rec); await loadSessions(); }
    catch { $sessions.set(byEnded([{ id: String(at), ...rec }, ...$sessions.get()])); }
    toast?.(T(t, "banked", { v: fmtAmount(amount, rate.currency, 2) }));
  };

  const modeWord = T(t, rate.mode === "month" ? "modeMonth" : rate.mode === "shift" ? "modeShift" : "modeDay");
  const rateLine = [
    fmtAmount(rate.pay, rate.currency, 0),
    modeWord,
    rate.mode === "month" ? T(t, "daysShort", { d: rate.days }) : null,
    T(t, "hoursShort", { h: rate.hours }),
  ].filter(Boolean).join(" · ");

  return html`<${Fragment}>
    <div class="fixed inset-0 z-0 bg-base-200" aria-hidden="true">
      <${GlStage} shader=${new URL("hoard.frag", import.meta.url)} seed=${0.37} zClass="z-0" ink=${inkOf} vary=${varyOf} />
    </div>

    <div class="relative z-10 h-full min-h-0 flex flex-col gap-[var(--ms-gap)]" data-running=${running ? "yes" : "no"}>
      ${/* the rate, as the one thing you can change from here — a pill, because it is context that happens
           to be tappable, not a control cluster */""}
      <div class="shrink-0 flex justify-center">
        <button data-rate type="button" aria-label=${T(t, "aRate")} onClick=${() => S.screen.set("rate")}
          class=${`btn btn-ghost btn-sm h-auto min-h-0 py-1.5 px-3 rounded-full font-mono uppercase tracking-wide text-[var(--ms-label)] max-w-full ${FROST}`}>
          <span class="truncate">${rateLine}</span>
          <iconify-icon icon="lucide:chevron-down" class="shrink-0"></iconify-icon>
        </button>
      </div>

      ${/* the subject: the amount, sized to the box rather than to a guess (fitText), and a mono meta line
           carrying the two numbers behind it */""}
      <div class="shrink-0 text-center px-1">
        <div ref=${boxRef} data-amount-box class="w-full" style="height:var(--ms-hero)">
          <div ref=${amountRef} data-amount class="font-mono tabular-nums font-semibold"
            style="white-space:pre-wrap;word-break:normal;line-height:0.95;font-size:var(--ms-hero)">${fmtAmount(0, rate.currency, 2)}</div>
        </div>
        <div class="mt-1 font-mono uppercase tracking-wide text-[var(--ms-label)] text-base-content/70 flex items-center justify-center gap-2">
          <span data-persec>${T(t, "perSec", { v: fmtAmount(perSec, rate.currency, rateDp(perSec)) })}</span>
          <span aria-hidden="true">·</span>
          <span ref=${elapsedRef} data-elapsed class="tabular-nums">${fmtSpan(0)}</span>
        </div>
      </div>

      ${/* the void the hoard rises into — deliberately empty: the field IS the content here */""}
      <div class="flex-1 min-h-0" aria-hidden="true"></div>

      ${/* Filled ink in BOTH states. The running state was an outline for one build, and on the shot it read
           as a disabled control — an outline inside a frost island over a dark field is barely a box. The
           state is not carried by this button anyway: the field, the ticking amount and the clock all say
           it, and the button says what it DOES, the way a play/pause key does. */""}
      <${Island} className="shrink-0" tone="frost">
        <button data-run type="button" onClick=${running ? bank : start}
          class="btn btn-primary btn-block h-[var(--ms-ctl)] min-h-0 rounded-[var(--ms-r-in)] gap-2">
          <iconify-icon icon=${running ? "lucide:hand-coins" : "lucide:play"} class="text-[var(--ms-icon)]"></iconify-icon>
          ${T(t, running ? "bank" : "start")}
        </button>
      </${Island}>
    </div>

    <${RateSheet} t=${t} loc=${loc} S=${S} open=${screen === "rate"} rate=${rate} />
  </${Fragment}>`;
}

// ---- the pay rate ---------------------------------------------------------------------------------

function RateSheet({ t, loc, S, open, rate }) {
  const [draft, setDraft] = useState(rate);
  // The sheet is a DRAFT: Back and the close button discard, one button commits. Opening it re-seeds from
  // the live rate, so a discarded edit never survives into the next open.
  useEffect(() => { if (open) setDraft(rate); }, [open]);
  const set = (k, v) => setDraft({ ...draft, [k]: v });
  const close = () => S.screen.set(null);
  const save = () => { $rate.set(normRate(draft)); close(); };

  const field = (label, key, extra) => html`<label class="flex flex-col gap-1 min-w-0 flex-1 basis-[7rem]">
    <span class="font-mono uppercase tracking-wide font-semibold text-[var(--ms-label)] text-base-content/70 truncate">${label}</span>
    <input ...${extra} type="number" min="0" step="any" inputmode="decimal" value=${draft[key] ?? ""}
      onInput=${(e) => set(key, e.target.value)}
      class="input w-full min-w-0 font-mono tabular-nums rounded-[var(--ms-r-in)] h-[var(--ms-ctl)]" />
  </label>`;

  return html`<${Sheet} id="ratesheet" open=${open} onClose=${close} locale=${loc} tone="frost"
    title=${T(t, "rateTitle")} subtitle=${T(t, "rateSub")} icon="lucide:wallet">
    <${Segmented} attr="data-mode" label=${T(t, "rateMode")} value=${draft.mode}
      onChange=${(id) => setDraft({ ...normRate({ ...DEFAULTS[id], mode: id, currency: draft.currency }) })}
      items=${MODES.map((m) => ({ id: m, label: T(t, m === "month" ? "modeMonth" : m === "shift" ? "modeShift" : "modeDay") }))} />

    ${/* three number fields on one row down to ~360 px; below that they wrap rather than shrink under the
         thumb. Wrapping a ROW is free — the sheet is the farm's one sanctioned nested scroll. */""}
    <div class="flex flex-wrap gap-[var(--ms-gap)] items-end">
      ${field(T(t, draft.mode === "month" ? "payMonth" : draft.mode === "shift" ? "payShift" : "payDay"), "pay", { "data-pay": "" })}
      ${draft.mode === "month" ? field(T(t, "rateDays"), "days", { "data-days": "" }) : null}
      ${field(T(t, draft.mode === "shift" ? "rateHoursShift" : "rateHoursDay"), "hours", { "data-hours": "" })}
    </div>

    <${Segmented} attr="data-cur" label=${T(t, "rateCurrency")} value=${draft.currency}
      onChange=${(id) => set("currency", id)}
      items=${CURRENCIES.map((c) => ({ id: c, label: c === "UAH" ? "₴" : "$" }))} />

    <button data-save-rate type="button" onClick=${save}
      class="btn btn-primary btn-block h-[var(--ms-ctl)] min-h-0 rounded-[var(--ms-r-in)]">${T(t, "rateDone")}</button>
  <//>`;
}

// ---- the vault ------------------------------------------------------------------------------------

export function vault({ t, S, undo }) {
  const loc = useStore(S.locale);
  const sessions = useStore($sessions);
  useEffect(() => { loadSessions(); }, []);
  const totals = vaultTotals(sessions);
  const when = (ms) => new Intl.DateTimeFormat(loc === "uk" ? "uk-UA" : "en-US",
    { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));

  const remove = async (s) => {
    $sessions.set($sessions.get().filter((x) => x.id !== s.id));
    try { await ledger.remove(s.id); } catch { /* no IndexedDB: the list is already gone from view */ }
    undo?.(async () => { try { await ledger.put(s.id, s); } catch { /* */ } await loadSessions(); }, T(t, "removed"));
  };

  if (!sessions.length) {
    return html`<div class="flex flex-col items-center justify-center gap-2 py-16 text-center" data-empty>
      <iconify-icon icon="lucide:coins" class="text-4xl text-base-content/30"></iconify-icon>
      <div class="font-semibold">${T(t, "vaultEmpty")}</div>
      <div class="text-sm text-base-content/70">${T(t, "vaultEmptyHint")}</div>
    </div>`;
  }

  return html`<${Fragment}>
    ${totals.map((v) => html`<${Panel} key=${v.currency} title=${T(t, "vaultTotal")} data-total=${v.currency}>
      <div class="flex items-end justify-between gap-3">
        <div class="font-mono tabular-nums font-semibold text-2xl min-w-0 truncate">${fmtAmount(v.sum, v.currency, 2)}</div>
        <div class="font-mono uppercase tracking-wide text-[var(--ms-label)] text-base-content/70 shrink-0 text-right">
          ${T(t, "vaultCount")} · ${v.count}<br/>${fmtSpan(v.ms)}
        </div>
      </div>
    <//>`)}

    <${Panel}>
      <div class="flex flex-col">
        ${sessions.map((s, i) => html`<div key=${s.id} data-session=${s.id}
          class=${`flex items-center gap-3 py-2 ${i ? "border-t border-base-content/10" : ""}`}>
          <div class="min-w-0 flex-1">
            <div class="font-mono tabular-nums font-semibold truncate">${fmtAmount(s.amount, s.currency, 2)}</div>
            <div class="font-mono uppercase tracking-wide text-[var(--ms-label)] text-base-content/70 truncate">
              ${when(s.endedAt || s._ts || Date.now())} · ${fmtSpan(s.ms)}
            </div>
          </div>
          <button data-del=${s.id} type="button" data-haptic="bump" aria-label=${T(t, "remove")}
            class="btn btn-ghost btn-sm btn-circle shrink-0 text-base-content/70" onClick=${() => remove(s)}>
            <iconify-icon icon="lucide:trash-2" class="text-lg"></iconify-icon>
          </button>
        </div>`)}
      </div>
    <//>
  </${Fragment}>`;
}
