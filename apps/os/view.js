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
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom } from "nanostores";
import { T } from "/_rt/i18n.js";
import { Panel } from "/_rt/ui.js";
import { shell, ERR } from "/_rt/shell.js";
import { buildApk, apkFilename } from "/_rt/apk.js";
import { PERMISSIONS, GROUPS, permLabels, permState, permRequest } from "/_rt/permissions.js";

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
  // start then stop, in catalogue order, so the checklist proves the service both comes up and goes away
  // rather than leaving a notification pinned to the status bar after a run.
  "bg.start": (t) => ({ title: T(t, "probeBgTitle"), body: T(t, "probeBgBody") }),
  "bg.stop": () => ({}),
  "bg.status": () => ({}),
  "wifi.scan": () => ({}),
  "wifi.info": () => ({}),
  "cell.info": () => ({}),
  // Asking for a permission the shell already holds answers instantly and shows no dialog, so this is
  // safe inside a checklist run — and it is the one probe that can UNBLOCK the two rows above it.
  "system.grant": () => ({ permission: "READ_PHONE_STATE" }),
  "ble.state": () => ({}),
  "usb.list": () => ({}),
  // ble.scan is a subscribe — no probe, same as location.watch.
  // location.watch is a subscribe, not a call — it has no probe by design; the row says so.
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
  if (id === "wifi.scan") return `${(v.networks || []).length}${v.throttled ? " · throttled" : ""}`;
  if (id === "wifi.info") return v.connected ? `${v.ssid || "?"} ${v.rssi}dBm` : "—";
  if (id === "cell.info") return `${(v.cells || []).length}`;
  if (id === "system.grant") return v.state;
  if (id === "ble.state") return v.supported ? (v.on ? "on" : "off") : "—";
  if (id === "usb.list") return `${(v.devices || []).length}`;
  if (v.id) return v.id;
  if ("ok" in v) return String(v.ok);
  return JSON.stringify(v);
}

// ---- the launcher: every permission as a home-screen tile -------------------
// A permission is a thing you grant, so the honest shape is the one the OS itself uses for things you
// own: an icon grid. State is a dot on the tile — the badge language a launcher already speaks — never a
// caption, because a grid that explains itself in words is a list wearing a costume.
const TILE_DOT = { granted: "bg-success", denied: "bg-error", needsApp: "bg-base-content/30", staleApp: "bg-warning", prompt: "", unsupported: "", unknown: "" };

function Launcher({ loc, t, toast }) {
  const L = permLabels(loc);
  const [states, setStates] = useState({});
  const keys = Object.keys(PERMISSIONS);

  const refresh = async () => {
    const out = {};
    for (const k of keys) out[k] = (await permState(k)).state;
    setStates(out);
  };
  useEffect(() => { refresh(); }, []);

  const tap = async (k) => {
    const st = states[k];
    // A shell capability reports "granted" as soon as the bridge carries it — which says nothing about
    // the Android permission underneath. cell.info sat refused while its tile showed green, because the
    // tap answered "revoke it in settings" instead of asking. In the shell the tap always asks; an
    // already-held permission answers instantly, so there is no dialog to annoy anyone with.
    if (PERMISSIONS[k]?.capability && shell.present) { await permRequest(k); await refresh(); return; }
    if (st === "granted") { toast?.(L.revokeHint); return; }
    if (st === "needsApp") { toast?.(L.needsAppHint); return; }
    if (st === "staleApp") { toast?.(L.staleAppHint); return; }
    if (st === "denied") { toast?.(L.deniedHint); return; }
    await permRequest(k);
    await refresh();
  };

  // Grouped the way a home screen is: sections, not a wall. An empty group renders nothing, so the grid
  // grows itself as capabilities land rather than needing a layout decision each time.
  const ordered = GROUPS.flatMap((g) => keys.filter((k) => PERMISSIONS[k].group === g));

  // ONE grid, no section headings: with seven icons the groups left two of four columns empty in every
  // row, which reads as a broken layout rather than a home screen. A launcher groups into folders once it
  // has enough to fill them; until then the registry order carries the grouping on its own.
  return html`<${Panel} title=${L.title}>
    <div data-launcher class="grid grid-cols-4 @min-[520px]:grid-cols-6 gap-x-3 gap-y-4 pt-2">
      <a data-store href="../store/" class="flex flex-col items-center gap-1.5 min-w-0">
        <span class="grid place-items-center aspect-square w-full rounded-[var(--ms-r-in)] sf-raised sf-e2">
          ${Icon("lucide:layout-grid", "text-2xl text-primary")}
        </span>
        <span class="text-[11px] leading-tight text-center line-clamp-2 text-base-content/80">${T(t, "storeTile")}</span>
      </a>
      ${ordered.map((k) => {
        const st = states[k] || "unknown";
        const dim = st === "needsApp" || st === "unsupported";
        return html`<button key=${k} data-perm=${k} data-state=${st} onClick=${() => tap(k)}
            class="flex flex-col items-center gap-1.5 min-w-0 transition-opacity"
            aria-label=${`${L[k]} — ${L[st] || st}`}>
          <span class=${`relative grid place-items-center aspect-square w-full rounded-[var(--ms-r-in)] sf-raised sf-e2 ${dim ? "opacity-45" : ""}`}>
            ${Icon(PERMISSIONS[k].icon, "text-2xl text-base-content")}
            ${TILE_DOT[st] ? html`<span class=${`absolute -top-1 -right-1 size-2.5 rounded-full ring-2 ring-base-100 ${TILE_DOT[st]}`} aria-hidden="true"></span>` : null}
          </span>
          <span class=${`text-[11px] leading-tight text-center line-clamp-2 ${dim ? "text-base-content/50" : "text-base-content/80"}`}>${L[k]}</span>
        </button>`;
      })}
    </div>
  <//>`;
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

  // The installed shell can be older than the page — normal after a bridge bump, since the web deploys in
  // minutes and an APK when the user reinstalls. Rebuilding this app produces the SAME package (a digest
  // of the start URL), so Android treats it as an update rather than a second copy.
  const [upd, setUpd] = useState(false);
  const update = async () => {
    if (upd) return;
    setUpd(true);
    try {
      const url = location.href.split("#")[0].split("?")[0];
      const blob = await buildApk({ url, name: T(t, "title") });
      const b64 = await new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result).split(",")[1]); f.onerror = rej; f.readAsDataURL(blob); });
      await shell.call("system.update", { name: apkFilename(T(t, "title")), base64: b64 });
      toast?.(T(t, "updStarted"));   // Android confirms it; we never claim it is installed
    } catch (e) { toast?.(e?.code || T(t, "updFailed")); } finally { setUpd(false); }
  };

  return html`<div class="flex flex-col gap-3 pt-1">
    ${shell.updateAvailable ? html`<div data-update class="flex items-center gap-3 rounded-[var(--ms-r)] border border-warning/40 bg-warning/10 p-4">
      ${Icon("lucide:download", "text-xl text-warning shrink-0")}
      <div class="min-w-0 flex-1">
        <div class="font-medium truncate">${T(t, "updTitle")}</div>
        <div class="font-mono text-xs text-muted truncate">bridge ${shell.version} → ${shell.catalogueVersion}</div>
      </div>
      <button id="do-update" class="btn btn-sm btn-warning shrink-0" disabled=${upd} onClick=${update}>${T(t, "updBtn")}</button>
    </div>` : null}
    <div data-bridge class="flex flex-col gap-3 rounded-[var(--ms-r)] sf-raised sf-e2 p-4">
      <div class="flex items-center gap-3">
        <span class=${`size-2.5 rounded-full shrink-0 ${present ? "bg-success" : "bg-base-content/25"}`} aria-hidden="true"></span>
        <div class="min-w-0 flex-1">
          <div class="font-medium truncate">${present ? T(t, "bridgeOn") : T(t, "bridgeOff")}</div>
          <div class="font-mono text-xs text-muted truncate">${present ? `bridge ${shell.version}` : T(t, "bridgeOffHint")}</div>
        </div>
      </div>
      <!-- The checklist walk is the whole point of the app, so it gets its own full-width row rather than
           competing with the status line for it — which truncated the status on a 360px phone. -->
      <button id="run-all" class="btn btn-sm btn-primary w-full gap-2" disabled=${all} data-run-all onClick=${runAll}>
        ${Icon("lucide:list-checks")}<span>${T(t, "runAll")}</span>
      </button>
    </div>

    ${done ? html`<div data-tally class="flex items-center gap-2 px-1 text-xs tabular-nums text-muted">
      <span class=${`size-1.5 rounded-full ${failed ? "bg-error" : "bg-success"}`} aria-hidden="true"></span>
      <span>${done}/${ids.length}</span>${failed ? html`<span class="text-error">${failed}</span>` : null}
    </div>` : null}

    <${Launcher} loc=${loc} t=${t} toast=${toast} />

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

// ---- alarms: the capability the web cannot have, as something you can actually use ----
// A checklist proves an action returns ok. It cannot show that an alarm SURVIVES — that it is still
// pending a minute later, still there after the app is closed, still listed after a reboot. The shell
// owns that state, so this tab reads it back rather than trusting what the page remembers.
const MINUTES = [1, 5, 15, 60];

export function alarms({ S, t, toast }) {
  const loc = useStore(S.locale);
  const [list, setList] = useState(null);
  const [mins, setMins] = useState(5);
  const [busy, setBusy] = useState(false);
  const why = shell.whyCapability("alarm");

  const refresh = async () => {
    if (why) { setList([]); return; }
    try { const r = await shell.call("alarm.list", {}); setList(r.alarms || []); }
    catch { setList([]); }
  };
  useEffect(() => { refresh(); }, []);

  const schedule = async () => {
    if (busy || why) return;
    setBusy(true);
    try {
      const at = Date.now() + mins * 60_000;
      const r = await shell.call("alarm.set", { id: `os-${at}`, at, title: T(t, "probeAlarmTitle"), body: T(t, "probeAlarmBody") });
      // exact is the one field worth surfacing: an inexact alarm may drift by minutes under Doze, and a
      // screen that shows a time must not quietly promise precision it did not get.
      toast?.(r.exact ? T(t, "alExact") : T(t, "alInexact"));
      await refresh();
    } catch (e) { toast?.(e?.code || T(t, "alFailed")); } finally { setBusy(false); }
  };

  const drop = async (id) => {
    try { await shell.call("alarm.cancel", { id }); await refresh(); } catch { toast?.(T(t, "alFailed")); }
  };

  return html`<div class="flex flex-col gap-3 pt-1">
    ${why ? html`<div data-alarm-blocked class="flex items-center gap-3 rounded-[var(--ms-r)] sf-raised sf-e2 p-4">
      ${Icon("lucide:smartphone", "text-xl text-base-content/50")}
      <span class="text-sm text-muted">${why === ERR.staleBridge ? T(t, "stStale") : T(t, "stNone")}</span>
    </div>` : html`<${Panel} title=${T(t, "alNew")}>
      <div class="flex items-center gap-2 pt-1">
        ${MINUTES.map((m) => html`<button key=${m} data-min=${m} aria-pressed=${mins === m}
            class=${`btn btn-sm flex-1 tabular-nums ${mins === m ? "btn-primary" : "btn-ghost"}`}
            onClick=${() => setMins(m)}>${m} ${T(t, "alMin")}</button>`)}
      </div>
      <button id="al-set" class="btn btn-sm btn-primary w-full gap-2 mt-3" disabled=${busy} onClick=${schedule}>
        ${Icon("lucide:alarm-clock-plus")}<span>${T(t, "alSet")}</span>
      </button>
    <//>`}

    <${Panel} title=${T(t, "alPending")}>
      ${list === null ? null
        : list.length === 0 ? html`<div data-alarm-empty class="py-3 text-sm text-muted">${T(t, "alNone")}</div>`
        : list.map((a) => html`<div key=${a.id} data-alarm=${a.id} class="flex items-center gap-3 py-2.5 border-b border-base-content/10 last:border-0">
            ${Icon("lucide:alarm-clock", "text-base text-primary shrink-0")}
            <div class="min-w-0 flex-1">
              <div class="text-sm truncate">${a.title}</div>
              <div class="font-mono text-xs text-muted tabular-nums">${new Date(a.at).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })}</div>
            </div>
            <button class="btn btn-sm btn-circle btn-ghost shrink-0" data-drop=${a.id}
                aria-label=${`${T(t, "alDrop")} ${a.title}`} onClick=${() => drop(a.id)}>
              ${Icon("lucide:x", "text-base")}
            </button>
          </div>`)}
    <//>
  </div>`;
}

// ---- report: what this device is, as text you can send ----------------------
export function report({ S, t, toast }) {
  const loc = useStore(S.locale);
  const runs = useStore($runs);
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState(null);

  const load = async () => {
    try { setInfo(await shell.call("system.info", {})); setErr(null); }
    catch (e) { setErr(e?.code || ERR.failed); setInfo(null); }
  };
  // Read on open. A report that greets you with five em-dashes and a button is asking the user to press
  // something to see the obvious; the button stays, for re-reading after a probe changed something.
  useEffect(() => { load(); }, []);

  const lines = () => {
    const rows = [
      ["bridge", shell.present ? String(shell.version) : "—"],
      ["catalogue", `${shell.actions.length}`],
      // Which build is in your hand, and what it grants. A capability refused by the gate and one that
      // was never implemented look identical without these two lines — that cost a device round-trip.
      ["version", info ? `${info.version || "?"} (${info.build ?? "?"})` : "—"],
      ["installed", info?.installed ? new Date(info.installed).toLocaleString(loc) : "—"],
      ["granted", info?.caps || "—"],
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

  return html`<div class="flex flex-col gap-3 pt-1">
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
