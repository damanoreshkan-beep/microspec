/* @ts-self-types="./watch.d.ts" */
/**
 * # runtime/watch.js — "tell me when", for any app with a number in it
 *
 * Every app in the farm answers the same shape of question: what is it NOW. This is the other half — a
 * rule the edge keeps: a source, a line, and a Telegram chat to say it in. It is systemic in the sense
 * `globe.js` and `calendar.js` are: it knows nothing about what the number MEANS. The edge's source matrix
 * (microspec-edge `edge/watch.js`) names what can be watched, its unit and its sane bounds; this component
 * renders whatever comes back, so a seventh source appears in every app's profile without a line changing
 * here.
 *
 * ## Why it lives in the runtime and not in an app
 *
 * Because the bell is not a feature of the weather app. Free data is pull-only — no public API will ever
 * wake anyone — so "tell me when" is the one thing the farm can sell over any of them, and a control that
 * exists once is a control that is designed, translated and accessible once. An app opts in with a single
 * spec key:
 *
 * ```json
 * "profile": { "watch": { "source": "air" } }
 * ```
 *
 * ## Import
 * ```js
 * import { Bell, watchList, watchAdd, watchDel } from "/_rt/watch.js";                    // an app's page
 * import { Bell } from "@microspec/core/runtime/watch.js";                                 // a product rt/ module
 * ```
 *
 * ## What it exports
 *
 * - {@link watchList} — `()` → `{rules, sources, balance, cost, max}`; the edge decides all five.
 * - {@link watchAdd} — `({source, params, band, lang})` for a source that offers WORDS, or the older
 *   `({source, params, op, value, lang})` for one whose number a person actually reads → the stored rule,
 *   or throws with `.reason`. A band rule sends no threshold at all: the edge derives it and keeps it.
 * - {@link watchDel} — `(id)` → true.
 * - {@link Bell} — the profile card: the rules on one source, and one form to add another.
 *
 * ## The rules it renders
 *
 * - **A rule needs the Telegram account**, because delivery IS the identity: a rule with nowhere to arrive
 *   is not a rule. Signed in another way, the card SIGNS THEM IN — the OIDC popup in a browser, the deep
 *   link into this app's Mini App in our APK or when the popup is refused. Never a link to the bot's chat.
 * - **The line is the app's business, the unit is the edge's** — and for most sources there is no longer a
 *   line on this screen at all: the reader picks a word and the edge derives the number. The number input is bounded by `min`/`max`
 *   from the source matrix, so an app cannot offer a Kp of 40.
 * - **A place is asked for once, and only when the source needs one** (`needs: "geo"`). The coordinates go
 *   to the edge rounded — it rounds again to ~110 m to make the poll shared — and nothing is stored here.
 * - **Every control here carries its own name.** The save button is a tick and the remove button an
 *   ×; an icon-only button with no `aria-label` is a critical axe failure, and it is the one this
 *   component shipped with until the farm's verify gate caught it on all seven apps at once.
 * - **The cost is shown before the button, never after the alert.** One coin per delivered message is the
 *   whole price list, and a balance of zero is not an error state: rules go quiet and resume on a top-up.
 */
import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { session, loginTelegramWeb } from "./auth.js";
import { shell } from "./shell.js";
import { VPS_PROXY } from "./feed.js";
import { gate } from "./gate.js";
import { sys } from "./i18n.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

// Under the gate there is no edge and no account, and a headless run must still see the control it is
// there to photograph. The fixture is built AROUND THE SOURCE THE APP ASKED FOR rather than a fixed one:
// a canned payload naming `air` renders nothing in the five apps that watch something else, and "the
// control is missing" is exactly what the gate exists to catch — it must not be the fixture's own doing.
// Which sources answer in WORDS, mirroring the edge's own table (microspec-edge edge/watch.js SOURCES).
// The gate has no edge to ask, and a fixture that gave every source bands would photograph a control five
// apps do not have — the gate would then be green on a screen production never shows. A source is here
// because its number is unreadable (a distance in km, a Kp index, µg/m³, a magnitude); °C, a rate and hours
// to a launch are numbers people read, and they keep the input.
const BAND_SOURCES = new Set(["iss", "air", "kp", "quake"]);
const BANDS = [{ id: "close", uk: "близько", en: "close" }, { id: "overhead", uk: "прямо над головою", en: "right overhead" }];
const fixture = (source) => {
  const worded = BAND_SOURCES.has(source);
  return {
    rules: [worded
      ? { id: 1, source, params: { band: "close" }, band: "close", op: "below", value: 752, last: 900, firedAt: null, quiet: false }
      : { id: 1, source, params: {}, band: null, op: "above", value: 35, last: 12, firedAt: null, quiet: false }],
    sources: { [source]: { app: source, unit: "", dflt: 35, min: 0, max: 1000, needs: null, bands: worded ? BANDS : null } },
    balance: 12, cost: 1, max: 20, role: "user", free: false,
  };
};

const call = async (route, body) => {
  const r = await fetch(`${VPS_PROXY}/watch/${route}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error("watch " + r.status), { status: r.status, reason: j?.error || "" });
  return j;
};

/** The gate's canned payload for one source — exported so a test can hold it to the edge's own table. */
export const gateFixture = fixture;

/** Every rule this account has, plus what the edge will let it make. `source` is read only under the
 *  gate, where it shapes the fixture; the live call always answers with the whole matrix. */
export const watchList = (source = "kp") => (gate ? Promise.resolve(fixture(source)) : call("list"));
/** Store one rule. Throws with `.reason` — "telegram" (wrong account), "too many", "bad rule". */
export const watchAdd = (rule) => (gate ? Promise.resolve({ rule: { ...rule, id: Date.now() } }) : call("add", rule)).then((j) => j.rule);
/** Forget one rule. */
export const watchDel = (id) => (gate ? Promise.resolve(true) : call("del", { id }).then(() => true));

/** One fix, or null. Asked for only when something needs a place, and never kept here.
 *  Exported because the globe asks the same question — «і показати на глобусі де я» — and two copies of
 *  "where am I" would drift into two different accuracies and two different timeouts. */
export function place() {
  return new Promise((ok) => {
    if (!navigator.geolocation) return ok(null);
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => ok(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    );
  });
}

const fmt = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));

/**
 * The profile card for ONE source. `params` pins what the source needs when the app already knows it (a
 * currency pair); otherwise a `needs: "geo"` source asks for the place itself on the first save.
 */
export function Bell({ source, loc, app = "", params = null, className = "" }) {
  const sess = useStore(session);
  const [state, setState] = useState(null);      // {rules, sources, balance, cost, max} | null while loading
  const [value, setValue] = useState(null);
  const [band, setBand] = useState(null);        // the WORD the reader picked, when this source offers words
  const [op, setOp] = useState("above");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [fallback, setFallback] = useState(false);   // the popup did not work — show the deep link instead

  const load = () => watchList(source).then((j) => {
    setState(j);
    setValue((v) => (v == null ? (j.sources?.[source]?.dflt ?? 0) : v));
    // The first band is the default, decided on the edge beside the number it resolves to — the surface
    // does not get to have its own opinion about which word a reader means.
    setBand((b) => b || j.sources?.[source]?.bands?.[0]?.id || null);
  }).catch(() => setState({ rules: [], sources: {}, balance: 0, cost: 1, max: 0, role: "user", free: false, down: true }));

  useEffect(() => { if (sess || gate) load(); else setState(null); }, [sess?.sid]);

  const tg = gate || sess?.provider === "telegram";
  const S = state?.sources?.[source];
  const mine = (state?.rules || []).filter((r) => r.source === source);

  // Not the Telegram account → the card SIGNS THEM IN rather than pointing at the bot. The first version
  // shipped a link to `t.me/dreamstudio_x_bot` and it was a dead end in the most literal way: Telegram opens
  // the bot's chat, the chat has nothing to do with this app, and there is no way back — the reader taps a
  // button labelled Telegram and nothing happens. A control that hands the problem to the user is not a
  // control. Three paths, in the order they can work:
  //   · in the Mini App — never reached; the bootstrap already signed in from initData (index.js).
  //   · in a browser — loginTelegramWeb(), the same OIDC popup signin.js uses; the bell then works in place.
  //   · in our APK, or when the popup is blocked or dismissed — the WebView has no popups at all, so the
  //     DEEP LINK opens this very app inside Telegram (?startapp=<app id>), where sign-in is automatic.
  //     That link is what the profile's "Open in Telegram" row already uses; the bare bot link is not.
  if (!tg) {
    const deep = `https://t.me/dreamstudio_x_bot?startapp=${encodeURIComponent(app || "")}`;
    const viaTelegram = async () => {
      setBusy(true); setErr("");
      try { await loginTelegramWeb(); }
      catch (e) { if (e?.message !== "popup-closed") setErr(sys("watchFailed", loc)); setFallback(true); }
      setBusy(false);
    };
    return html`<div data-watch=${source} class=${`card sf-raised sf-e2 rounded-[var(--ms-r)] ${className}`}><div class="card-body p-4 gap-3">
      <div class="flex items-center gap-3">
        <div class="size-11 rounded-xl grid place-items-center bg-primary/10 text-primary shrink-0">${Icon("lucide:bell", "text-2xl")}</div>
        <div class="flex-1 min-w-0"><div class="font-semibold leading-tight">${sys("watchRow", loc)}</div><div class="text-xs text-muted">${sys("watchNeedTg", loc)}</div></div>
      </div>
      ${shell.present || fallback
        ? html`<a data-watch-tg href=${deep} target="_blank" rel="noopener" class="btn btn-sm btn-primary rounded-full self-start gap-1.5">${Icon("lucide:send", "text-[1em]")}${sys("openTelegram", loc)}</a>`
        : html`<button data-watch-signin type="button" disabled=${busy} onClick=${viaTelegram} class="btn btn-sm btn-primary rounded-full self-start gap-1.5">${Icon("lucide:send", "text-[1em]")}${sys("watchSignIn", loc)}</button>`}
      ${err ? html`<div data-watch-err class="text-xs text-error">${err}</div>` : null}
    </div></div>`;
  }
  if (!state || !S) return null;

  const save = async () => {
    setBusy(true); setErr("");
    try {
      let p = params;
      if (!p && S.needs === "geo") { p = await place(); if (!p) { setErr(sys("watchNoPlace", loc)); setBusy(false); return; } }
      // A band rule sends the WORD and nothing else: the edge resolves it against the upstream as it is at
      // this second and stores the number. Sending `op` or `value` alongside would be this surface having
      // an opinion about a threshold it is the whole point of never showing.
      await watchAdd(bands ? { source, params: p || {}, band, lang: loc } : { source, params: p || {}, op, value: Number(value), lang: loc });
      await load();
    } catch (e) {
      setErr(e?.reason === "too many" ? sys("watchTooMany", loc) : sys("watchFailed", loc));
    }
    setBusy(false);
  };

  const unit = S.unit ? " " + S.unit : "";
  // «в км не зрозуміло. просто це "близько" і все» (owner, 2026-09-22). When a source offers words, this
  // card shows words: no number, no unit, no direction — the word already carries all three, and the
  // kilometres stay on the server where they were computed. Sources whose number a person actually reads
  // (°C, a rate, hours to a launch) send no bands and keep the input they had.
  const bands = S.bands && S.bands.length ? S.bands : null;
  const wordOf = (b) => (String(loc || "").startsWith("uk") ? b.uk : b.en) || b.id;
  const bandOf = (id) => (bands || []).find((b) => b.id === id) || null;
  return html`<div data-watch=${source} class=${`card sf-raised sf-e2 rounded-[var(--ms-r)] ${className}`}><div class="card-body p-4 gap-3">
    <div class="flex items-center gap-3">
      <div class="size-11 rounded-xl grid place-items-center bg-primary/10 text-primary shrink-0">${Icon("lucide:bell", "text-2xl")}</div>
      <div class="flex-1 min-w-0">
        <div class="font-semibold leading-tight truncate">${sys("watchRow", loc)}</div>
        ${/* A role is only real to its holder if they can see it. Free means no balance line either — the
             number would be beside the point, and a zero there reads as a problem when it is not. */""}
        <div class="text-xs text-muted truncate">${state.free
          ? html`<span data-watch-role=${state.role}>${state.role} · ${sys("watchFree", loc)}</span>`
          : html`${sys("watchCost", loc)} · ${sys("watchBalance", loc)} ${state.balance}`}</div>
      </div>
    </div>

    ${mine.length
      ? html`<ul data-watch-rules class="flex flex-col gap-1">${mine.map((r) => html`<li key=${r.id} class="flex items-center gap-2 rounded-[var(--ms-r-in)] sf-inset px-3 py-2">
          ${r.band && bandOf(r.band)
            ? html`<span class="flex-1 min-w-0 truncate text-sm">${wordOf(bandOf(r.band))}</span>`
            : html`<span class="flex-1 min-w-0 truncate text-sm tabular-nums">${sys(r.op === "above" ? "watchAbove" : "watchBelow", loc)} ${fmt(r.value)}${unit}${r.last == null ? "" : ` · ${sys("watchNow", loc)} ${fmt(r.last)}`}</span>`}
          ${r.quiet ? html`<span class="badge badge-sm">${sys("watchQuiet", loc)}</span>` : null}
          <button type="button" data-watch-del=${r.id} aria-label=${sys("watchOff", loc)} class="btn btn-ghost btn-xs btn-circle shrink-0"
            onClick=${async () => { await watchDel(r.id); load(); }}>${Icon("lucide:x", "text-base")}</button>
        </li>`)}</ul>`
      : null}

    ${mine.length < (state.max || 0)
      ? html`<div class="flex items-center gap-2 flex-wrap">
          ${bands
            ? html`<div data-watch-bands class="flex-1 min-w-0 flex flex-wrap gap-1.5">
                ${bands.map((b) => html`<button key=${b.id} type="button" data-watch-band=${b.id} aria-pressed=${band === b.id}
                  class=${`btn btn-sm rounded-full ${band === b.id ? "btn-primary" : "btn-ghost sf-inset"}`} onClick=${() => setBand(b.id)}>${wordOf(b)}</button>`)}
              </div>`
            : html`<div class="join">
                  ${[["above", "watchAbove"], ["below", "watchBelow"]].map(([o, k]) => html`<button key=${o} type="button" data-watch-op=${o}
                    class=${`btn btn-sm join-item ${op === o ? "btn-active btn-primary" : ""}`} onClick=${() => setOp(o)}>${sys(k, loc)}</button>`)}
                </div>
                <label class="flex-1 min-w-0 flex items-center gap-1">
                  <span class="sr-only">${sys("watchRow", loc)}</span>
                  <input data-watch-value type="number" inputmode="decimal" class="input input-sm input-bordered w-full tabular-nums"
                    min=${S.min} max=${S.max} value=${value ?? S.dflt} onInput=${(e) => setValue(e.currentTarget.value)} />
                  ${S.unit ? html`<span class="text-xs text-muted shrink-0">${S.unit}</span>` : null}
                </label>`}
          <button type="button" data-watch-add aria-label=${sys("watchSave", loc)} class="btn btn-sm btn-primary rounded-full shrink-0" disabled=${busy} onClick=${save}>
            ${busy ? html`<span class="loading loading-spinner loading-xs"></span>` : Icon("lucide:check", "text-base")}
          </button>
        </div>`
      : null}
    ${err ? html`<div data-watch-err class="text-xs text-error">${err}</div>` : null}
  </div></div>`;
}
