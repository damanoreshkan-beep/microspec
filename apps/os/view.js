import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom } from "nanostores";
import { T } from "/_rt/i18n.js";
import { Panel } from "/_rt/ui.js";
import { gate } from "/_rt/gate.js";
import { shell, ERR } from "/_rt/shell.js";
import { buildApk, apkFilename } from "/_rt/apk.js";
import { PERMISSIONS, GROUPS, permLabels, permState, permRequest, refreshHeld, heldPermissions } from "/_rt/permissions.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

const $runs = atom({});
const record = (id, v) => $runs.set({ ...$runs.get(), [id]: v });

const CAP_ICON = {
  system: "lucide:cpu", notify: "lucide:bell", alarm: "lucide:alarm-clock",
  background: "lucide:activity", wifi: "lucide:wifi", cell: "lucide:radio-tower",
  ble: "lucide:bluetooth", usb: "lucide:usb", location: "lucide:map-pin",
  files: "lucide:folder", server: "lucide:server", lan: "lucide:network",
};

const PROBE = {
  "system.info": () => ({}),
  "notify.show": (t) => ({ id: "os-probe", title: T(t, "probeNoteTitle"), body: T(t, "probeNoteBody") }),
  "notify.cancel": () => ({ id: "os-probe" }),
  "alarm.set": (t) => ({ id: "os-probe", at: Date.now() + 60_000, title: T(t, "probeAlarmTitle"), body: T(t, "probeAlarmBody") }),
  "alarm.cancel": () => ({ id: "os-probe" }),
  "alarm.list": () => ({}),
  "bg.start": (t) => ({ title: T(t, "probeBgTitle"), body: T(t, "probeBgBody") }),
  "bg.stop": () => ({}),
  "bg.status": () => ({}),
  "wifi.scan": () => ({}),
  "wifi.info": () => ({}),
  "cell.info": () => ({}),
  "system.grant": () => ({ permission: "READ_PHONE_STATE" }),
  "ble.state": () => ({}),
  "usb.list": () => ({}),
  "system.logs": () => ({}),
  "files.roots": () => ({}),
  "system.battery": () => ({}),
  "server.start": () => ({ port: 8080 }),
  "server.put": (t) => ({ path: "/", contentType: "text/html; charset=utf-8",
    base64: btoa(unescape(encodeURIComponent(`<!doctype html><meta charset=utf-8><title>${T(t, "title")}</title><h1>${T(t, "title")}</h1>`))) }),
  "server.status": () => ({}),
  "server.stop": () => ({}),
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
  if (id === "system.logs") return `${(v.lines || []).length}`;
  if (id === "system.battery") return `${v.level}%${v.charging ? " · charging" : ""}${v.unrestricted === false ? " · restricted" : ""}`;
  if (id === "files.roots") return `${(v.roots || []).length}`;
  if (id === "files.list") return `${(v.entries || []).length}`;
  if (id.startsWith("server.")) return v.url || (v.running === false ? "off" : v.path || String(v.running));
  if (v.id) return v.id;
  if ("ok" in v) return String(v.ok);
  return JSON.stringify(v);
}

const TILE_DOT = { granted: "bg-success", partial: "bg-warning", denied: "bg-error", needsApp: "bg-base-content/30", staleApp: "bg-warning", prompt: "", unsupported: "", unknown: "" };

function Launcher({ S, loc, t, toast }) {
  const L = permLabels(loc);
  const [states, setStates] = useState({});
  const keys = Object.keys(PERMISSIONS);

  const refresh = async () => {
    await refreshHeld();          
    const out = {};
    for (const k of keys) out[k] = (await permState(k)).state;
    setStates(out);
  };
  useEffect(() => { refresh(); }, []);

  const tap = async (k) => {
    const st = states[k];
    if (k === "files") {
      if (!shell.hasCapability("files")) { toast?.(st === "staleApp" ? L.staleAppHint : L.needsAppHint); return; }
      setFs({ open: true, root: null, trail: [], entries: [], preview: null, error: "" });
      syncStack(S);
      return;
    }
    if (PERMISSIONS[k]?.capability && shell.present) { await permRequest(k); await refresh(); return; }
    if (st === "granted") { toast?.(L.revokeHint); return; }
    if (st === "needsApp") { toast?.(L.needsAppHint); return; }
    if (st === "staleApp") { toast?.(L.staleAppHint); return; }
    if (st === "denied") {
      if (shell.has("system.settings")) { await shell.call("system.settings", { page: "app" }); return; }
      toast?.(L.deniedHint);
      return;
    }
    await permRequest(k);
    await refresh();
  };

  const ordered = GROUPS.flatMap((g) => keys.filter((k) => PERMISSIONS[k].group === g));

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

const $fs = atom({ open: false, root: null, trail: [], entries: [], preview: null, busy: false, error: "" });
const setFs = (patch) => $fs.set({ ...$fs.get(), ...patch });

const fsDepth = (fs) => (fs.open ? 1 + Math.max(0, fs.trail.length - 1) + (fs.preview ? 1 : 0) : 0);
const syncStack = (S) => {
  const want = fsDepth($fs.get());
  if (S.stack.get().length !== want) S.stack.set(Array.from({ length: want }, (_, i) => `fs${i}`));
};

const FILE_ICON = (mime, dir) => {
  if (dir) return "lucide:folder";
  const m = mime || "";
  if (m.startsWith("image/")) return "lucide:image";
  if (m.startsWith("audio/")) return "lucide:file-audio";
  if (m.startsWith("video/")) return "lucide:file-video";
  if (m.startsWith("text/") || m.includes("json") || m.includes("xml")) return "lucide:file-text";
  if (m.includes("zip") || m.includes("compressed")) return "lucide:file-archive";
  if (m.includes("pdf")) return "lucide:file-type";
  return "lucide:file";
};

const KB = 1024;
const size = (n, loc) => {
  if (!n) return "";
  const u = n < KB ? [n, "B"] : n < KB * KB ? [n / KB, "KB"] : [n / KB / KB, "MB"];
  return `${u[0].toLocaleString(loc, { maximumFractionDigits: u[0] < 10 && u[1] !== "B" ? 1 : 0 })} ${u[1]}`;
};

const ordered = (entries, loc) => [...entries].sort((a, b) =>
  a.dir === b.dir ? a.name.localeCompare(b.name, loc) : (a.dir ? -1 : 1));

const bytesOf = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const previewable = (mime) => (mime || "").startsWith("image/")
  || (mime || "").startsWith("text/") || (mime || "").includes("json") || (mime || "").includes("xml");

async function fsOpenFolder(S, root, trail) {
  setFs({ open: true, root, trail, preview: null, busy: true, error: "" });
  syncStack(S);
  try {
    const r = await shell.call("files.list", { uri: root.uri, docId: trail[trail.length - 1].docId });
    setFs({ entries: r.entries || [], busy: false });
  } catch (e) {
    setFs({ entries: [], busy: false, error: e?.code || String(e) });
  }
}

async function fsEnterRoot(S, root) {
  await fsOpenFolder(S, root, [{ docId: null, name: root.name }]);
}

async function fsGrant(S) {
  setFs({ busy: true, error: "" });
  try {
    const r = await shell.call("files.grant", {});
    if (r?.granted) { await fsEnterRoot(S, { uri: r.uri, name: r.name }); return; }
    setFs({ busy: false });
  } catch (e) { setFs({ busy: false, error: e?.code || String(e) }); }
}

function Explorer({ S, t, loc, toast }) {
  const fs = useStore($fs);
  const [roots, setRoots] = useState(null);

  const loadRoots = async () => {
    try {
      const r = await shell.call("files.roots", {});
      const list = r.roots || [];
      setRoots(list);
      if (list.length === 1) await fsEnterRoot(S, list[0]);
    } catch { setRoots([]); }
  };
  useEffect(() => { if (fs.open && !fs.root) loadRoots(); }, [fs.open, fs.root]);

  const enter = async (e) => {
    if (e.dir) { await fsOpenFolder(S, fs.root, [...fs.trail, { docId: e.docId, name: e.name }]); return; }
    setFs({ busy: true, error: "" });
    try {
      const r = await shell.call("files.read", { uri: fs.root.uri, docId: e.docId });
      const bytes = bytesOf(r.base64);
      const text = (e.mime || "").startsWith("image/") ? null : new TextDecoder().decode(bytes);
      const src = (e.mime || "").startsWith("image/") ? `data:${e.mime};base64,${r.base64}` : null;
      setFs({ busy: false, preview: { name: e.name, mime: e.mime, bytes: r.bytes, base64: r.base64, text, src } });
      syncStack(S);
    } catch (e2) { setFs({ busy: false, error: e2?.code === ERR.failed ? e2.detail : (e2?.code || String(e2)) }); }
  };

  const saveLog = async () => {
    try {
      const r = await shell.call("system.logs", {});
      const body = (r.lines || []).join("\n");
      const b64 = btoa(unescape(encodeURIComponent(body)));
      const at = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const out = await shell.call("files.write", {
        uri: fs.root.uri, docId: fs.trail[fs.trail.length - 1].docId,
        name: `microspec-${at}.log`, mime: "text/plain", base64: b64,
      });
      toast?.(`${T(t, "fsSaved")} · ${size(out.bytes, loc)}`);
      await fsOpenFolder(S, fs.root, fs.trail);
    } catch (e) { toast?.(e?.code || String(e)); }
  };

  const share = async (p) => {
    try {
      await shell.call("files.share", { name: p.name, mime: p.mime || "application/octet-stream", base64: p.base64 });
    } catch (e) { toast?.(e?.code || String(e)); }
  };

  if (fs.preview) {
    const p = fs.preview;
    return html`<${Panel}>
      <div data-fs-preview class="flex flex-col gap-2 pt-1">
        <div class="flex items-center gap-2">
          <span class="font-mono text-sm min-w-0 flex-1 truncate">${p.name}</span>
          <button data-fs-share class="btn btn-xs btn-ghost btn-circle shrink-0"
              aria-label=${T(t, "fsShare")} onClick=${() => share(p)}>
            ${Icon("lucide:share-2", "text-base")}
          </button>
        </div>
        <div class="font-mono text-xs text-muted">${p.mime || "?"} · ${size(p.bytes, loc)}</div>
        ${p.src ? html`<img src=${p.src} alt=${p.name} class="w-full rounded-[var(--ms-r-in)] bg-base-200" />`
          : p.text != null ? html`<pre class="font-mono text-xs whitespace-pre-wrap break-all max-h-[60vh] overflow-y-auto rounded-[var(--ms-r-in)] bg-base-200 p-3">${p.text}</pre>`
          : html`<div class="text-sm text-muted">${T(t, "fsNoPreview")}</div>`}
      </div>
    <//>`;
  }

  if (!fs.root) {
    return html`<${Panel} title=${T(t, "fsTitle")}>
      <div data-fs-roots class="flex flex-col gap-2 pt-1">
        ${(roots || []).map((r) => html`<button key=${r.uri} data-fs-root=${r.name}
            class="flex items-center gap-3 py-2.5 border-b border-base-content/10 last:border-0 text-left"
            onClick=${() => fsEnterRoot(S, r)}>
          ${Icon("lucide:folder", "text-xl text-primary shrink-0")}
          <span class="min-w-0 flex-1 truncate">${r.name}</span>
          ${Icon("lucide:chevron-right", "text-base text-base-content/40 shrink-0")}
        </button>`)}
        <button id="fs-grant" data-fs-grant class="btn btn-sm btn-primary w-full gap-2 mt-1"
            disabled=${fs.busy} onClick=${() => fsGrant(S)}>
          ${Icon("lucide:folder-plus")}<span>${T(t, "fsGrant")}</span>
        </button>
        ${fs.error ? html`<div class="text-xs text-error">${fs.error}</div>` : null}
      </div>
    <//>`;
  }

  const trail = fs.trail.length <= 2
    ? fs.trail.map((f) => f.name).join(" / ")
    : `… / ${fs.trail.slice(-2).map((f) => f.name).join(" / ")}`;
  return html`<${Panel}>
    <div class="flex items-center gap-2 pb-1">
      <span data-fs-trail class="font-mono text-sm min-w-0 flex-1 truncate">${trail}</span>
      <button class="btn btn-xs btn-ghost btn-circle shrink-0" aria-label=${T(t, "fsSaveLog")} onClick=${saveLog}>
        ${Icon("lucide:save", "text-base")}
      </button>
      <button class="btn btn-xs btn-ghost btn-circle shrink-0" aria-label=${T(t, "fsGrant")} onClick=${() => fsGrant(S)}>
        ${Icon("lucide:folder-plus", "text-base")}
      </button>
    </div>
    <div data-fs-list>
      ${fs.error ? html`<div class="py-3 text-xs text-error">${fs.error}</div>` : null}
      ${!fs.error && !fs.busy && !fs.entries.length ? html`<div class="py-3 text-sm text-muted">${T(t, "fsEmpty")}</div>` : null}
      ${ordered(fs.entries, loc).map((e) => html`<button key=${e.docId} data-fs-entry=${e.name}
          class="flex items-center gap-3 py-2.5 w-full border-b border-base-content/10 last:border-0 text-left"
          onClick=${() => enter(e)}>
        ${Icon(FILE_ICON(e.mime, e.dir), `text-xl shrink-0 ${e.dir ? "text-primary" : "text-muted"}`)}
        <span class="min-w-0 flex-1 truncate">${e.name}</span>
        ${e.dir ? Icon("lucide:chevron-right", "text-base text-base-content/40 shrink-0")
          : html`<span class="text-xs tabular-nums text-base-content/45 shrink-0">${size(e.size, loc)}</span>`}
      </button>`)}
    </div>
  <//>`;
}

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
      <!-- The result goes UNDER the name, across the full width. On the right it had ~8.5rem and
           truncated anything real: a LAN URL, a permission name, an exception. A result you cannot read
           is the same as no result — and this console exists to be read. -->
      ${last ? html`<div class=${`mt-1 flex items-baseline gap-2 text-xs tabular-nums ${last.ok ? "text-base-content/80" : "text-error"}`}>
        <span data-result=${id} class="font-mono break-all min-w-0">${last.text}</span>
        <span class="text-base-content/45 shrink-0">${last.ms} ms</span>
      </div>` : null}
    </div>
    <button class="btn btn-sm btn-circle btn-ghost shrink-0" disabled=${busy || !PROBE[id]}
        data-run=${id} aria-label=${`${T(t, "run")} ${id}`} onClick=${press}>
      ${Icon(PROBE[id] ? "lucide:play" : "lucide:minus", "text-base")}
    </button>
  </div>`;
}

export function caps({ S, t, toast }) {
  const loc = useStore(S.locale);
  const runs = useStore($runs);
  const [all, setAll] = useState(false);
  const fs = useStore($fs);
  const present = shell.present;

  useEffect(() => {
    if (!gate || !new URLSearchParams(location.search).has("fs")) return;
    setFs({ open: true, root: null, trail: [], entries: [], preview: null, error: "" });
    syncStack(S);
  }, []);

  useEffect(() => S.stack.listen((v) => {
    const cur = $fs.get();
    const want = fsDepth(cur);
    const now = v?.length || 0;
    if (now >= want) return;
    if (now === 0) { setFs({ open: false, root: null, trail: [], entries: [], preview: null, error: "" }); return; }
    if (cur.preview) { setFs({ preview: null }); return; }
    const trail = cur.trail.slice(0, Math.max(1, now));
    fsOpenFolder(S, cur.root, trail);
  }), []);
  const ids = shell.actions;
  const done = ids.filter((id) => runs[id]).length;
  const failed = ids.filter((id) => runs[id] && !runs[id].ok).length;

  const runAll = async () => {
    if (all) return;
    setAll(true);
    for (const id of ids) await run(id, t, loc);
    setAll(false);
    toast?.(T(t, "ranAll"));
  };

  const [upd, setUpd] = useState(false);
  const update = async () => {
    if (upd) return;
    setUpd(true);
    try {
      const url = location.href.split("#")[0].split("?")[0];
      const blob = await buildApk({ url, name: T(t, "title") });
      const b64 = await new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result).split(",")[1]); f.onerror = rej; f.readAsDataURL(blob); });
      await shell.call("system.update", { name: apkFilename(T(t, "title")), base64: b64 });
      toast?.(T(t, "updStarted"));   
    } catch (e) { toast?.(e?.code || T(t, "updFailed")); } finally { setUpd(false); }
  };

  if (fs.open) return html`<div class="flex flex-col gap-3 pt-1"><${Explorer} S=${S} t=${t} loc=${loc} toast=${toast} /></div>`;

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

    <${Launcher} S=${S} loc=${loc} t=${t} toast=${toast} />

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

const SEEN_MS = 20_000;                       
const WIFI_MS = 30_000;
const band = (freq) => (!freq ? "" : freq >= 5925 ? "6 GHz" : freq >= 5000 ? "5 GHz" : "2.4 GHz");
const cellRadius = (rssi) => {
  const clamped = Math.max(-125, Math.min(-55, rssi));
  return 12 + ((-55 - clamped) / 70) * 78;
};
const rssiRadius = (rssi) => {
  const clamped = Math.max(-100, Math.min(-30, rssi));
  return 12 + ((-30 - clamped) / 70) * 78;    
};
const angleOf = (addr) => {
  let h = 2166136261;
  for (let i = 0; i < addr.length; i++) { h ^= addr.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (((Math.imul(h >>> 0, 2654435761) >>> 0) / 4294967296) * 360) * (Math.PI / 180);
};

const GATE_DEVICES = [
  { addr: "02:00:00:00:AA:01", name: "Gate Beacon", rssi: -52 },
  { addr: "02:00:00:00:AA:02", name: "Watch", rssi: -67 },
  { addr: "02:00:00:00:AA:03", name: "", rssi: -78 },
  { addr: "02:00:00:00:AA:04", name: "Earbuds", rssi: -44 },
  { addr: "02:00:00:00:AA:05", name: "", rssi: -91 },
];

export function radar({ S, t, toast }) {
  const loc = useStore(S.locale);
  const [devices, setDevices] = useState(() => (gate ? GATE_DEVICES.map((d) => ({ ...d, at: Date.now() })) : []));
  const [scanning, setScanning] = useState(gate);
  const [err, setErr] = useState(null);
  const [held, setHeld] = useState(null);
  const [events, setEvents] = useState(0);
  const stopRef = useRef(null);
  const [nets, setNets] = useState([]);
  const [cells, setCells] = useState([]);
  const [throttled, setThrottled] = useState(false);
  const wifiRef = useRef(null);
  const [hosts, setHosts] = useState([]);
  const [sweep, setSweep] = useState(null);        
  const lanRef = useRef(null);

  const ipSort = (a, b) => {
    const n = (s) => s.split(".").reduce((v, o) => v * 256 + (parseInt(o, 10) || 0), 0);
    return n(a.ip) - n(b.ip);
  };
  const upsertHost = (h) => {
    if (!h) return;
    if (h.done) { setSweep({ scanned: h.scanned, found: h.found }); return; }
    if (h.started || h.ack || !h.ip) return;
    setHosts((prev) => {
      const at = prev.find((x) => x.ip === h.ip);
      if (!at) return [...prev, { ...h, via: [h.via] }].sort(ipSort);
      return prev.map((x) => x.ip !== h.ip ? x : {
        ...x,
        name: x.name || h.name,
        ports: x.ports || h.ports,
        via: x.via.includes(h.via) ? x.via : [...x.via, h.via],
      });
    });
  };
  const [locOn, setLocOn] = useState(null);
  useEffect(() => {
    refreshHeld().then(() => setHeld(heldPermissions()));
    if (shell.has("system.info")) shell.call("system.info", {}).then((i) => setLocOn(i.locationOn)).catch(() => {});
  }, []);
  const why = shell.whyCapability("ble");

  const [started, setStarted] = useState(false);
  const [ack, setAck] = useState(false);
  const upsert = (d) => {
    if (d && d.ack) { setAck(true); return; }            
    if (d && d.started) { setStarted(true); return; }    
    setEvents((n) => n + 1); setDevices((prev) => {
    const rest = prev.filter((x) => x.addr !== d.addr);
    return [...rest, { ...d, at: Date.now() }].sort((a, b) => b.rssi - a.rssi);
  }); };

  const sweepRadios = async () => {
    if (shell.has("wifi.scan")) {
      try {
        const r = await shell.call("wifi.scan", {});
        setNets((r.networks || []).slice().sort((a, b) => b.rssi - a.rssi));
        setThrottled(!!r.throttled);
      } catch {  }
    }
    if (shell.has("cell.info")) {
      try {
        const r = await shell.call("cell.info", {});
        setCells((r.cells || []).slice().sort((a, b) => (b.rssi || -999) - (a.rssi || -999)));
      } catch {  }
    }
  };

  const start = () => {
    if (scanning || why) return;
    setScanning(true);
    setErr(null);
    setStarted(false);
    setAck(false);
    stopRef.current = shell.subscribe("ble.scan", {}, upsert, (e) => { setErr(e?.detail || e?.code || ERR.failed); setScanning(false); });
    sweepRadios();
    wifiRef.current = setInterval(sweepRadios, WIFI_MS);
    setHosts([]); setSweep(null);
    if (shell.has("lan.scan")) lanRef.current = shell.subscribe("lan.scan", {}, upsertHost, () => {});
  };
  const stop = () => {
    setScanning(false);
    try { stopRef.current?.(); } catch {  }
    stopRef.current = null;
    clearInterval(wifiRef.current);
    wifiRef.current = null;
    try { lanRef.current?.(); } catch {  }
    lanRef.current = null;
  };
  useEffect(() => {
    if (gate) {
      sweepRadios();
      shell.subscribe("lan.scan", {}, upsertHost, () => {});
    }
    return () => {
      try { stopRef.current?.(); } catch {  }
      try { lanRef.current?.(); } catch {  }
      clearInterval(wifiRef.current);
    };
  }, []);

  useEffect(() => {
    if (gate) return;
    const id = setInterval(() => setDevices((prev) => prev.filter((d) => Date.now() - d.at < SEEN_MS)), 2000);
    return () => clearInterval(id);
  }, []);

  const fresh = (d) => Math.max(0.25, 1 - (Date.now() - d.at) / SEEN_MS);

  return html`<div class="flex flex-col gap-3 pt-1">
    <${Panel}>
      <div data-radar class="relative mx-auto w-full max-w-[20rem] aspect-square">
        <svg viewBox="0 0 200 200" class="w-full h-full text-base-content" aria-hidden="true">
          ${[30, 60, 90].map((r) => html`<circle key=${r} cx="100" cy="100" r=${r} fill="none" stroke="currentColor" stroke-width="0.6" opacity="0.16" />`)}
          <line x1="100" y1="10" x2="100" y2="190" stroke="currentColor" stroke-width="0.6" opacity="0.1" />
          <line x1="10" y1="100" x2="190" y2="100" stroke="currentColor" stroke-width="0.6" opacity="0.1" />
          ${scanning ? html`<g class="ms-sweep" style="transform-origin:100px 100px;color:var(--app-accent)">
            <line x1="100" y1="100" x2="100" y2="12" stroke="currentColor" stroke-width="1.2" opacity="0.45" />
          </g>` : null}
          <!-- Two natures, told apart WITHOUT relying on colour: an advertisement is a filled dot, a
               network is an open ring. Colour then only reinforces it — accent for the thing that streams
               at us, ink for the thing we have to ask about. A legend would be the hand-holding this
               screen does not need: the list below carries the same two icons. -->
          <!-- Cells are triangles, and the one you are REGISTERED on is filled while its neighbours are
               outlined. That distinction is the only one here a user can act on: a neighbour is what the
               phone would hand over to, the serving cell is what it is actually talking through. -->
          <g class="text-base-content">
            ${cells.map((c) => {
              const key = `${c.type}-${c.pci ?? ""}-${c.cid ?? ""}-${c.arfcn ?? ""}`;
              const a = angleOf(key), r = cellRadius(c.rssi ?? -110);
              const x = 100 + Math.cos(a) * r, y = 100 + Math.sin(a) * r;
              const pts = `${x.toFixed(1)},${(y - 4.6).toFixed(1)} ${(x - 4.2).toFixed(1)},${(y + 3.2).toFixed(1)} ${(x + 4.2).toFixed(1)},${(y + 3.2).toFixed(1)}`;
              return html`<polygon key=${key} points=${pts}
                fill=${c.serving ? "currentColor" : "none"} stroke="currentColor" stroke-width="1.2"
                stroke-linejoin="round" opacity=${c.serving ? "0.75" : "0.5"} />`;
            })}
          </g>
          <g class="text-base-content">
            ${nets.map((n) => {
              const key = n.bssid || n.ssid || String(n.rssi);
              const a = angleOf(key), r = rssiRadius(n.rssi);
              return html`<circle key=${key} cx=${(100 + Math.cos(a) * r).toFixed(1)} cy=${(100 + Math.sin(a) * r).toFixed(1)}
                r="4.2" fill="none" stroke="currentColor" stroke-width="1.3" opacity="0.55" />`;
            })}
          </g>
          <g style="color:var(--app-accent)">
            ${devices.map((d) => {
              const a = angleOf(d.addr), r = rssiRadius(d.rssi);
              return html`<circle key=${d.addr} cx=${(100 + Math.cos(a) * r).toFixed(1)} cy=${(100 + Math.sin(a) * r).toFixed(1)}
                r="3.4" fill="currentColor" opacity=${fresh(d).toFixed(2)} />`;
            })}
          </g>
        </svg>
        <div class="absolute inset-x-0 bottom-1 flex items-center justify-center gap-3 font-mono text-xs tabular-nums">
          <span class="flex items-center gap-1" style="color:var(--app-accent)">
            ${Icon("lucide:bluetooth", "text-sm")}<span>${devices.length}</span>
          </span>
          <span class="flex items-center gap-1 text-muted">
            ${Icon("lucide:wifi", "text-sm")}<span>${nets.length}</span>
          </span>
          <span class="flex items-center gap-1 text-muted">
            ${Icon("lucide:radio-tower", "text-sm")}<span>${cells.length}</span>
          </span>
        </div>
      </div>

      <button id="radar-toggle" class=${`btn btn-sm w-full gap-2 mt-2 ${scanning ? "" : "btn-primary"}`}
          disabled=${!!why} data-scanning=${scanning} onClick=${() => (scanning ? stop() : start())}>
        ${Icon(scanning ? "lucide:square" : "lucide:radar")}<span>${T(t, scanning ? "radarStop" : "radarStart")}</span>
      </button>
      ${held && shell.present ? html`<div data-ble-perms class="flex flex-wrap gap-x-3 gap-y-1 pt-2 font-mono text-[11px]">
        <!-- Both radios' permissions, deduped: fine location is shared, and listing it twice would read
             as two different facts about the same switch. -->
        ${[...new Set([...shell.androidFor("ble"), ...shell.androidFor("wifi"), ...shell.androidFor("cell")])].filter((p) => p in held).map((p) => html`<span key=${p} class=${held[p] ? "text-success" : "text-error"}>${held[p] ? "+" : "−"} ${p}</span>`)}
        ${locOn === false ? html`<span class="text-error">− LOCATION SERVICES</span>` : null}
        <!-- Only meaningful from bridge 15, which is when the shell started sending it. Showing a red
             ACK on an older APK reports a fault that does not exist — the indicator was newer than the
             app it was describing. -->
        ${shell.version >= 15 ? html`<span class=${ack ? "text-success" : "text-error"}>${ack ? "+" : "−"} ACK</span>` : null}
        <span class=${started ? "text-success" : "text-error"}>${started ? "+" : "−"} STARTED</span>
        <!-- Four scans per two minutes is the OS budget. Over it the call still succeeds and returns the
             PREVIOUS results, so without this the screen would quietly show a stale field as a live one. -->
        ${throttled ? html`<span data-wifi-throttled class="text-warning">− THROTTLED</span>` : null}
        <span class="text-muted">rx ${events}</span>
        <!-- The reason belongs NEXT TO the fact it explains. On its own line below it was missed twice,
             which left "no error was shown" and "no error happened" indistinguishable — the one
             distinction this whole diagnostic exists to make. -->
        ${err ? html`<span data-radar-reason class="text-error break-all">${String(err)}</span>` : null}
      </div>` : null}
      ${why ? html`<div class="pt-2 text-sm text-muted">${why === ERR.staleBridge ? T(t, "stStale") : T(t, "stNone")}</div>`
        : err ? html`<div data-radar-err class="pt-2 text-sm text-error">${
            err === ERR.denied ? T(t, "radarDenied")
            : err === ERR.unavailable ? T(t, "radarOff")
            : /scanFailed:6/.test(String(err)) ? T(t, "radarTooOften")
            : /scanFailed:4/.test(String(err)) ? T(t, "radarUnsupported")
            : err}</div>` : null}
    <//>

    <!-- ONE list for one radar. Sorted by signal across both radios, because "what is closest" is the
         question the screen answers and splitting it in two would make that unanswerable at a glance. -->
    ${devices.length + nets.length + cells.length ? html`<${Panel} title=${T(t, "radarSeen")}>
      ${[
        ...devices.map((d) => ({ key: d.addr, kind: "ble", name: d.name || T(t, "radarUnnamed"), sub: d.addr, rssi: d.rssi })),
        ...nets.map((n) => ({ key: n.bssid || n.ssid, kind: "wifi", name: n.ssid || T(t, "radarHidden"), rssi: n.rssi,
          sub: [band(n.freq), n.bssid].filter(Boolean).join(" · ") })),
        ...cells.map((c) => ({
          key: `${c.type}-${c.pci ?? ""}-${c.cid ?? ""}-${c.arfcn ?? ""}`, kind: "cell", strong: !!c.serving,
          name: [c.type ? c.type.toUpperCase() : "", c.mcc ? `${c.mcc}-${c.mnc ?? ""}` : ""].filter(Boolean).join(" · "),
          sub: [c.pci != null ? `PCI ${c.pci}` : "", c.cid != null ? `CID ${c.cid}` : "", c.arfcn != null ? `ARFCN ${c.arfcn}` : ""].filter(Boolean).join(" · "),
          rssi: c.rssi ?? -999,
        })),
      ].sort((a, b) => b.rssi - a.rssi).map((e) => html`<div key=${e.key} data-dev=${e.key} data-kind=${e.kind}
          class="flex items-center gap-3 py-2 border-b border-base-content/10 last:border-0">
        ${Icon(e.kind === "wifi" ? "lucide:wifi" : e.kind === "cell" ? "lucide:radio-tower" : "lucide:bluetooth",
          `text-base shrink-0 ${e.kind === "ble" ? "text-primary" : e.strong ? "text-base-content" : "text-muted"}`)}
        <div class="min-w-0 flex-1">
          <div class="text-sm truncate">${e.name}</div>
          <div class="font-mono text-[11px] text-muted truncate">${e.sub}</div>
        </div>
        <div class="font-mono text-xs tabular-nums shrink-0">${e.rssi}<span class="text-base-content/45">dBm</span></div>
      </div>`)}
    <//>` : null}
    <!-- The network is a different question from the radar above it — not "what is radiating near me" but
         "who shares this wire" — so it gets its own list rather than a shape on a circle it does not fit. -->
    ${hosts.length || sweep ? html`<${Panel}>
      <div class="flex items-center gap-2 pb-1">
        ${Icon("lucide:network", "text-base text-primary shrink-0")}
        <span class="font-semibold text-sm min-w-0 flex-1 truncate">${T(t, "radarHosts")}</span>
        <!-- "6 of 254" rather than a count alone: a sweep that ended having looked at everything and one
             that is still a third of the way through produce the same six rows otherwise. -->
        <span data-lan-sweep class="font-mono text-[11px] text-base-content/45 tabular-nums shrink-0">
          ${sweep ? `${sweep.found}/${sweep.scanned}` : hosts.length}
        </span>
      </div>
      ${hosts.map((h) => html`<div key=${h.ip} data-host=${h.ip}
          class="flex items-center gap-3 py-2 border-b border-base-content/10 last:border-0">
        ${Icon(h.via.includes("ssdp") ? "lucide:tv-minimal" : "lucide:hard-drive", "text-base text-muted shrink-0")}
        <div class="min-w-0 flex-1">
          <div class="text-sm truncate">${h.name || h.ip}</div>
          <div class="font-mono text-[11px] text-muted truncate">${h.name ? `${h.ip}${h.ports ? ` · ${h.ports}` : ""}` : (h.ports || T(t, "hostQuiet"))}</div>
        </div>
      </div>`)}
    <//>` : null}

  </div>`;
}

export function report({ S, t, toast }) {
  const loc = useStore(S.locale);
  const runs = useStore($runs);
  const [logs, setLogs] = useState([]);
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState(null);

  const load = async () => {
    try { setInfo(await shell.call("system.info", {})); setErr(null); }
    catch (e) { setErr(e?.code || ERR.failed); setInfo(null); }
    try { setLogs((await shell.call("system.logs", {})).lines || []); } catch { setLogs([]); }
  };
  useEffect(() => { load(); }, []);

  const lines = () => {
    const rows = [
      ["bridge", shell.present ? String(shell.version) : "—"],
      ["catalogue", `${shell.actions.length}`],
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
    for (const line of logs) rows.push(["log", line]);
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
