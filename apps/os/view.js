// microspec OS — the capability console.
//
// Three jobs at once, which is why it is one app and not a debug screen:
//   · the honest demonstration of what the Android shell can do — press a row, the thing happens;
//   · the device checklist AS CODE. CI runs Chromium and will never execute the shell, so the Java half
//     is verified by hand — and a written list rots while this one fails visibly;
//   · the stress test for the permissions screen, since it declares every key in the registry.
//
// It is GENERATED from the action catalogue: every row comes from `shell.actions`, never a hand-written
// mirror, which would drift within a week and quietly stop testing whatever was added last. A catalogue
// action with no probe recipe here says so on screen instead of being skipped in silence.
//
// Under the gate the bridge is mocked from that same catalogue, so the whole matrix is populated in
// Chromium — an empty screen would make the shot meaningless and hide a broken row.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom } from "nanostores";
import { T } from "/_rt/i18n.js";
import { Panel } from "/_rt/ui.js";
import { shell, ERR } from "/_rt/shell.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

// Last outcome per action id: { ok, text, ms }. One atom so a run shows up on every tab at once.
const $runs = atom({});
const record = (id, v) => $runs.set({ ...$runs.get(), [id]: v });

const CAP_ICON = {
  system: "lucide:cpu", notify: "lucide:bell", alarm: "lucide:alarm-clock",
  background: "lucide:activity", wifi: "lucide:wifi", cell: "lucide:radio-tower",
  ble: "lucide:bluetooth", usb: "lucide:usb", location: "lucide:map-pin",
  files: "lucide:folder", server: "lucide:server",
};

// Probe recipes: what to send so an action is worth pressing. Actions absent from here are still LISTED
// — the console must show the catalogue, not the subset someone remembered to wire.
const PROBE = {
  "system.info": () => ({}),
  "notify.show": (t) => ({ id: "os-probe", title: T(t, "probeNoteTitle"), body: T(t, "probeNoteBody") }),
  "notify.cancel": () => ({ id: "os-probe" }),
  "alarm.set": (t) => ({ id: "os-probe", at: Date.now() + 60_000, title: T(t, "probeAlarmTitle"), body: T(t, "probeAlarmBody") }),
  "alarm.cancel": () => ({ id: "os-probe" }),
  "alarm.list": () => ({}),
};

const stateOf = (id) => (shell.has(id) ? "ok" : shell.why(id) === ERR.staleBridge ? "stale" : "none");
const DOT = { ok: "bg-success", stale: "bg-warning", none: "bg-base-content/25" };

function groups() {
  const by = new Map();
  for (const id of shell.actions) {
    const cap = shell.action(id).capability;
    if (!by.has(cap)) by.set(cap, []);
    by.get(cap).push(id);
  }
  return [...by.entries()];
}

async function run(id, t, loc) {
  const args = PROBE[id] ? PROBE[id](t) : null;
  if (!args) { record(id, { ok: false, text: T(t, "noProbe"), ms: 0 }); return; }
  const t0 = Date.now();
  try {
    const value = await shell.call(id, args);
    record(id, { ok: true, text: summarise(id, value, loc), ms: Date.now() - t0 });
  } catch (e) {
    record(id, { ok: false, text: e?.code ? `${e.code}${e.detail ? ` · ${e.detail}` : ""}` : String(e), ms: Date.now() - t0 });
  }
}

// One line of the most load-bearing thing each result carries — a raw JSON dump would be unreadable and
// would hide the field that actually matters (did the alarm come back EXACT?).
function summarise(id, v, loc) {
  if (!v || typeof v !== "object") return String(v);
  if (id === "system.info") return `bridge ${v.bridge} · SDK ${v.sdk} · ${v.model}`;
  if (id === "alarm.set") return `${new Date(v.at).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })} · ${v.exact ? "exact" : "inexact"}`;
  if (id === "alarm.list") return `${(v.alarms || []).length}`;
  if (v.id) return v.id;
  if ("ok" in v) return String(v.ok);
  return JSON.stringify(v);
}

// ---- one action ------------------------------------------------------------
function Row({ id, t, loc }) {
  const runs = useStore($runs);
  const a = shell.action(id);
  const st = stateOf(id);
  const last = runs[id];
  const [busy, setBusy] = useState(false);
  const press = async () => { setBusy(true); await run(id, t, loc); setBusy(false); };
  return html`<div data-action=${id} class="flex items-center gap-3 py-2.5 border-b border-base-content/10 last:border-0">
    <span class=${`size-2 rounded-full shrink-0 ${DOT[st]}`} aria-hidden="true"></span>
    <div class="min-w-0 flex-1">
      <div class="font-mono text-sm truncate">${id}</div>
      <div class="text-xs text-muted truncate">
        ${st === "none" ? T(t, "stNone") : st === "stale" ? T(t, "stStale") : a.android.length ? a.android.join(" · ") : T(t, "noPerm")}
      </div>
    </div>
    ${last ? html`<div class=${`text-xs text-right tabular-nums shrink-0 ${last.ok ? "text-base-content/80" : "text-error"}`}>
      <div data-result=${id} class="font-mono truncate max-w-[8.5rem]">${last.text}</div>
      <div class="text-base-content/45">${last.ms} ms</div>
    </div>` : null}
    <button class="btn btn-sm btn-circle btn-ghost shrink-0" disabled=${busy || !PROBE[id]}
        data-run=${id} aria-label=${`${T(t, "run")} ${id}`} onClick=${press}>
      ${Icon(PROBE[id] ? "lucide:play" : "lucide:minus", "text-base")}
    </button>
  </div>`;
}

// ---- the console: the catalogue, live, and every row runnable ---------------
// Capabilities and probes were two tabs of the same list — one of them with a button. Merging them is
// what makes this an instrument instead of two thirds of a screen listing the same six lines twice.
export function caps({ S, t, toast }) {
  const loc = useStore(S.locale);
  const runs = useStore($runs);
  const [all, setAll] = useState(false);
  const present = shell.present;
  const ids = shell.actions;
  const done = ids.filter((id) => runs[id]).length;
  const failed = ids.filter((id) => runs[id] && !runs[id].ok).length;

  // The whole point of a checklist: one press walks it. Sequential, because a notification and an alarm
  // firing at once on a real device tells you nothing about which one worked.
  const runAll = async () => {
    if (all) return;
    setAll(true);
    for (const id of ids) await run(id, t, loc);
    setAll(false);
    toast?.(T(t, "ranAll"));
  };

  return html`<div class="flex flex-col gap-3 pt-1 pb-6">
    <div data-bridge class="flex items-center gap-3 rounded-[var(--ms-r)] sf-raised sf-e2 p-4">
      <span class=${`size-2.5 rounded-full shrink-0 ${present ? "bg-success" : "bg-base-content/25"}`} aria-hidden="true"></span>
      <div class="min-w-0 flex-1">
        <div class="font-medium truncate">${present ? T(t, "bridgeOn") : T(t, "bridgeOff")}</div>
        <div class="font-mono text-xs text-muted truncate">${present ? `bridge ${shell.version} · ${ids.length}` : T(t, "bridgeOffHint")}</div>
      </div>
      <button id="run-all" class="btn btn-sm btn-primary gap-2" disabled=${all} data-run-all onClick=${runAll}>
        ${Icon("lucide:list-checks")}<span>${T(t, "runAll")}</span>
      </button>
    </div>

    ${done ? html`<div data-tally class="flex items-center gap-2 px-1 text-xs tabular-nums text-muted">
      <span class=${`size-1.5 rounded-full ${failed ? "bg-error" : "bg-success"}`} aria-hidden="true"></span>
      <span>${done}/${ids.length}</span>${failed ? html`<span class="text-error">${failed}</span>` : null}
    </div>` : null}

    ${groups().map(([cap, ids2]) => html`<${Panel} key=${cap}>
      <div class="flex items-center gap-2 pb-1">
        ${Icon(CAP_ICON[cap] || "lucide:box", "text-base text-primary")}
        <span class="font-semibold text-sm">${T(t, `cap_${cap}`)}</span>
        <span class="font-mono text-[11px] text-base-content/45 ml-auto">${cap}</span>
      </div>
      ${ids2.map((id) => html`<${Row} key=${id} id=${id} t=${t} loc=${loc} />`)}
    <//>`)}
  </div>`;
}

// ---- report: what this device is, as text you can send ----------------------
export function report({ t, toast }) {
  const runs = useStore($runs);
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState(null);

  const load = async () => {
    try { setInfo(await shell.call("system.info", {})); setErr(null); }
    catch (e) { setErr(e?.code || ERR.failed); setInfo(null); }
  };

  const lines = () => {
    const rows = [
      ["bridge", shell.present ? String(shell.version) : "—"],
      ["catalogue", `${shell.actions.length}`],
      ["sdk", info ? String(info.sdk) : "—"],
      ["release", info?.release || "—"],
      ["model", info?.model || "—"],
      ["package", info?.pkg || "—"],
      ["missing", info?.missing?.length ? info.missing.join(",") : "—"],
    ];
    for (const [id, r] of Object.entries(runs)) rows.push([id, `${r.ok ? "ok" : "fail"} ${r.text} (${r.ms}ms)`]);
    return rows;
  };

  const copy = async () => {
    const text = lines().map(([k, v]) => `${k}: ${v}`).join("\n");
    try { await navigator.clipboard.writeText(text); toast?.(T(t, "copied")); } catch { toast?.(T(t, "copyFail")); }
  };

  return html`<div class="flex flex-col gap-3 pt-1 pb-6">
    <${Panel} title=${T(t, "reportTitle")}>
      <div data-report class="flex flex-col">
        ${lines().map(([k, v]) => html`<div key=${k} class="flex items-baseline gap-3 py-1.5 border-b border-base-content/10 last:border-0">
          <span class="font-mono text-xs text-muted w-20 shrink-0 truncate">${k}</span>
          <span class="font-mono text-sm min-w-0 flex-1 break-all">${v}</span>
        </div>`)}
      </div>
    <//>
    ${err ? html`<div class="text-xs text-error px-1">${err === ERR.unsupported ? T(t, "stNone") : err}</div>` : null}
    <div class="flex gap-2">
      <button id="rep-load" class="btn btn-sm btn-primary flex-1 gap-2" onClick=${load}>${Icon("lucide:refresh-cw")}<span>${T(t, "reload")}</span></button>
      <button id="rep-copy" class="btn btn-sm flex-1 gap-2" onClick=${copy}>${Icon("lucide:copy")}<span>${T(t, "copy")}</span></button>
    </div>
  </div>`;
}
