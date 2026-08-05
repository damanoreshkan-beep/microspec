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

// Last outcome per action id: { ok, text, ms }. One atom so a run shows up on every tab at once.
const $runs = atom({});
const record = (id, v) => $runs.set({ ...$runs.get(), [id]: v });

const CAP_ICON = {
  system: "lucide:cpu", notify: "lucide:bell", alarm: "lucide:alarm-clock",
  background: "lucide:activity", wifi: "lucide:wifi", cell: "lucide:radio-tower",
  ble: "lucide:bluetooth", usb: "lucide:usb", location: "lucide:map-pin",
  files: "lucide:folder", server: "lucide:server", lan: "lucide:network",
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
  "system.logs": () => ({}),
  // Only roots is probeable: grant opens a system picker (a checklist walk must never do that), and
  // list/read/write need a folder the user has actually handed over. The explorer is their real test.
  "files.roots": () => ({}),
  "system.battery": () => ({}),
  // system.settings and files.share both leave the app — a checklist walk must never launch a settings
  // screen or a share sheet. They are pressed deliberately, from the tile and from the explorer.
  // start, publish a page, read it back, stop — in catalogue order, so a run proves the station comes
  // up AND goes away rather than leaving a socket listening after the checklist ends.
  "server.start": () => ({ port: 8080 }),
  "server.put": (t) => ({ path: "/", contentType: "text/html; charset=utf-8",
    base64: btoa(unescape(encodeURIComponent(`<!doctype html><meta charset=utf-8><title>${T(t, "title")}</title><h1>${T(t, "title")}</h1>`))) }),
  "server.status": () => ({}),
  "server.stop": () => ({}),
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
  if (id === "system.logs") return `${(v.lines || []).length}`;
  if (id === "system.battery") return `${v.level}%${v.charging ? " · charging" : ""}${v.unrestricted === false ? " · restricted" : ""}`;
  if (id === "files.roots") return `${(v.roots || []).length}`;
  if (id === "files.list") return `${(v.entries || []).length}`;
  if (id.startsWith("server.")) return v.url || (v.running === false ? "off" : v.path || String(v.running));
  if (v.id) return v.id;
  if ("ok" in v) return String(v.ok);
  return JSON.stringify(v);
}

// ---- the launcher: every permission as a home-screen tile -------------------
// A permission is a thing you grant, so the honest shape is the one the OS itself uses for things you
// own: an icon grid. State is a dot on the tile — the badge language a launcher already speaks — never a
// caption, because a grid that explains itself in words is a list wearing a costume.
// Colour is the whole readout here: full access, some of it, none. A tile that shows green while the
// action behind it is refused is worse than no dot at all.
const TILE_DOT = { granted: "bg-success", partial: "bg-warning", denied: "bg-error", needsApp: "bg-base-content/30", staleApp: "bg-warning", prompt: "", unsupported: "", unknown: "" };

function Launcher({ S, loc, t, toast }) {
  const L = permLabels(loc);
  const [states, setStates] = useState({});
  const keys = Object.keys(PERMISSIONS);

  const refresh = async () => {
    await refreshHeld();          // ask the shell what the OS actually granted, then colour from that
    const out = {};
    for (const k of keys) out[k] = (await permState(k)).state;
    setStates(out);
  };
  useEffect(() => { refresh(); }, []);

  const tap = async (k) => {
    const st = states[k];
    // Files is the one tile that opens something instead of asking for something — SAF has no permission
    // to grant up front, so the grant IS the first screen of the explorer.
    if (k === "files") {
      if (!shell.hasCapability("files")) { toast?.(st === "staleApp" ? L.staleAppHint : L.needsAppHint); return; }
      setFs({ open: true, root: null, trail: [], entries: [], preview: null, error: "" });
      syncStack(S);
      return;
    }
    // A shell capability reports "granted" as soon as the bridge carries it — which says nothing about
    // the Android permission underneath. cell.info sat refused while its tile showed green, because the
    // tap answered "revoke it in settings" instead of asking. In the shell the tap always asks; an
    // already-held permission answers instantly, so there is no dialog to annoy anyone with.
    if (PERMISSIONS[k]?.capability && shell.present) { await permRequest(k); await refresh(); return; }
    if (st === "granted") { toast?.(L.revokeHint); return; }
    if (st === "needsApp") { toast?.(L.needsAppHint); return; }
    if (st === "staleApp") { toast?.(L.staleAppHint); return; }
    if (st === "denied") {
      // Denied twice is denied forever — requestPermissions returns instantly and no dialog can ever
      // appear again. A toast saying "blocked" was a dead end; in the shell the tap now opens the page
      // that holds the switch. In a browser there is nothing to open, so the hint stands.
      if (shell.has("system.settings")) { await shell.call("system.settings", { page: "app" }); return; }
      toast?.(L.deniedHint);
      return;
    }
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

// ---- the file explorer -----------------------------------------------------
// It opens from the Files tile, because a launcher icon opening a thing IS the metaphor this screen is
// built on — and the dock is full at five tabs.
//
// There is no storage permission behind any of this. MANAGE_EXTERNAL_STORAGE would hand over the whole
// device in one declaration and read as spyware; SAF asks the user for a folder instead, and what we can
// walk is exactly what they picked. So the empty state is not an error — it is the permission model.
const $fs = atom({ open: false, root: null, trail: [], entries: [], preview: null, busy: false, error: "" });
const setFs = (patch) => $fs.set({ ...$fs.get(), ...patch });

// One number decides every history question: how many levels are showing. Folders and a preview are both
// levels, so Back walks out of a preview, up the tree, and finally out of the explorer — one press each.
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

// Folders first, then by name — the order every file manager has, and the one that makes a deep tree
// walkable. The shell returns whatever the provider's cursor happened to hold.
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

// The one place the folder is chosen. It resolves granted:false when the user backs out of the system
// picker, which is a normal answer and not a failure — nothing is recorded and the screen does not move.
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
      // One folder is the normal case, and a list of one is a tap that asks nothing. Straight in.
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

  // Writing needs to prove itself on something real. The bridge log is the one thing this app owns that
  // is worth having outside it — and it lands in the folder you are looking at, not a Downloads dead-drop.
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

  // Out of the app entirely — the half of files a browser cannot do at all, since WebView has no
  // navigator.share. The bytes are already in hand from the read, so nothing is fetched twice.
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

  // No folder yet: the grant button IS the screen. Nothing to explain — the system picker says the rest.
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

  // Where you are is the heading of this screen, so it reads as one: left-aligned next to the entries it
  // describes, at their weight. A right-aligned path (dir=rtl, to keep the tail of a deep one) left a
  // 370px hole between the icon and the text on every shallow folder — the gap WAS the layout.
  // Deep paths keep their last two segments instead: the tail is what tells you where you are, and a full
  // breadcrumb never fits a phone anyway.
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

// ---- the console: the catalogue, live, and every row runnable ---------------
// Capabilities and probes were two tabs of the same list — one of them with a button. Merging them is
// what makes this an instrument instead of two thirds of a screen listing the same six lines twice.
export function caps({ S, t, toast }) {
  const loc = useStore(S.locale);
  const runs = useStore($runs);
  const [all, setAll] = useState(false);
  const fs = useStore($fs);
  const present = shell.present;

  // A screen that only exists after a tap cannot be photographed, and an unphotographed screen is one
  // nobody has looked at. Under the gate ?fs opens it at mount, so the breakpoint and contrast matrix can
  // reach the explorer the same way it reaches a tab. Gate-only: it must never be a URL a user can land on.
  useEffect(() => {
    if (!gate || !new URLSearchParams(location.search).has("fs")) return;
    setFs({ open: true, root: null, trail: [], entries: [], preview: null, error: "" });
    syncStack(S);
  }, []);

  // ONE reaction for every way back — the system button, a gesture, the runtime popping the stack. The
  // explorer never pops its own levels; it changes state and lets this listener bring the screen along,
  // which is why a folder, a preview and the whole explorer all close with one press each.
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

  // A launcher icon opens a thing and the thing takes the screen. Rendering the explorer over the console
  // rather than under it is what keeps that true — a file manager wedged into a page of probe rows would
  // be a panel, not an app.
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

// ---- radar: the subscribe a checklist can never run -------------------------
// `Run all` executes calls; a subscribe never settles, so location.watch and ble.scan were the only two
// actions that shipped unproven. This screen is their test, and the thing Web Bluetooth cannot be: it
// shows EVERYTHING advertising nearby, as it appears, instead of the one device a chooser returns.
//
// Angle is a hash of the address, so a device keeps its place between frames instead of jumping; radius
// is signal strength, which is the only distance a radio can honestly claim.
const SEEN_MS = 20_000;                       // older than this and it is gone, not "maybe still there"
// Android throttles a foreground app to four scans per two minutes, so 30s is the fastest honest cadence —
// anything quicker just returns the previous results with `throttled` set. Networks are NOT aged out like
// advertisements: a scan is a statement about right now, so each result REPLACES the field rather than
// decaying into it. An access point that stops being listed is gone the moment the next scan says so.
const WIFI_MS = 30_000;
const band = (freq) => (!freq ? "" : freq >= 5925 ? "6 GHz" : freq >= 5000 ? "5 GHz" : "2.4 GHz");
// A cell's number is NOT the same physical quantity as an advertisement's. RSRP runs roughly -50 (on top
// of the mast) to -125 (about to drop the call), so pushing it through the -30…-100 scale would pin every
// neighbour to the rim and pretend a -104 and a -120 are the same place. The gate mock alone has a -104.
const cellRadius = (rssi) => {
  const clamped = Math.max(-125, Math.min(-55, rssi));
  return 12 + ((-55 - clamped) / 70) * 78;
};
const rssiRadius = (rssi) => {
  const clamped = Math.max(-100, Math.min(-30, rssi));
  return 12 + ((-30 - clamped) / 70) * 78;    // -30dBm hugs the centre, -100 sits at the rim
};
// Addresses that differ only in the last byte — most of them, since a vendor gets a contiguous block —
// must not land on the same bearing. Measured across seven such addresses: h*31 %360 and FNV %360 both
// collapse them into two clusters (min gap 0–2°); FNV mixed through the golden ratio spreads them around
// the whole circle (min gap 5°). Bearing is cosmetic, but a radar where every device shares one spoke
// reads as broken, and that is a defect no gate can see.
const angleOf = (addr) => {
  let h = 2166136261;
  for (let i = 0; i < addr.length; i++) { h ^= addr.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (((Math.imul(h >>> 0, 2654435761) >>> 0) / 4294967296) * 360) * (Math.PI / 180);
};

// The gate has no radio, so seed a fixed field — an empty radar photographs as a broken one, and the
// e2e would be asserting nothing.
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
  // Wi-Fi is a CALL where BLE is a subscribe, so the two halves of this screen are driven differently: one
  // is pushed at us, the other has to be asked. Both answer the same question — what is radiating here —
  // which is why they share one radar instead of getting a tab each.
  const [nets, setNets] = useState([]);
  const [cells, setCells] = useState([]);
  const [throttled, setThrottled] = useState(false);
  const wifiRef = useRef(null);
  // LAN hosts stay OFF the radar on purpose. The radius there means one thing — how far a signal
  // travelled — and a host has no signal strength at all. Placing it by round-trip would make the same
  // ring mean "far away" for a beacon and "behind a slower switch" for a laptop, which is exactly the kind
  // of number that looks like a measurement and is not one. They get a list; the radar keeps its meaning.
  const [hosts, setHosts] = useState([]);
  const [sweep, setSweep] = useState(null);        // { scanned, found } once the sweep finishes
  const lanRef = useRef(null);

  const ipSort = (a, b) => {
    const n = (s) => s.split(".").reduce((v, o) => v * 256 + (parseInt(o, 10) || 0), 0);
    return n(a.ip) - n(b.ip);
  };
  // The same host usually arrives twice — once from the sweep, once from SSDP — and each sighting knows
  // something the other does not: one has the open ports, the other the model name. Merge, never replace.
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
  // A scan that is refused and a scan that finds nothing look identical on an empty radar, so the screen
  // shows which permissions the OS actually granted and how many advertisements have arrived.
  const [locOn, setLocOn] = useState(null);
  useEffect(() => {
    refreshHeld().then(() => setHeld(heldPermissions()));
    // Location services OFF is the one failure that looks like success everywhere else.
    if (shell.has("system.info")) shell.call("system.info", {}).then((i) => setLocOn(i.locationOn)).catch(() => {});
  }, []);
  const why = shell.whyCapability("ble");

  // One entry per address: a beacon advertising ten times a second is one device, not ten.
  const [started, setStarted] = useState(false);
  const [ack, setAck] = useState(false);
  const upsert = (d) => {
    if (d && d.ack) { setAck(true); return; }            // the bridge received the call
    if (d && d.started) { setStarted(true); return; }    // the scan began; neither is a device
    setEvents((n) => n + 1); setDevices((prev) => {
    const rest = prev.filter((x) => x.addr !== d.addr);
    return [...rest, { ...d, at: Date.now() }].sort((a, b) => b.rssi - a.rssi);
  }); };

  // The two asked-for radios, swept together on one timer. Each failure is swallowed on its own: one radio
  // being refused must never blank the other two, which is the whole reason they are not one call.
  const sweepRadios = async () => {
    if (shell.has("wifi.scan")) {
      try {
        const r = await shell.call("wifi.scan", {});
        setNets((r.networks || []).slice().sort((a, b) => b.rssi - a.rssi));
        setThrottled(!!r.throttled);
      } catch { /* the BLE half still works */ }
    }
    if (shell.has("cell.info")) {
      try {
        const r = await shell.call("cell.info", {});
        setCells((r.cells || []).slice().sort((a, b) => (b.rssi || -999) - (a.rssi || -999)));
      } catch { /* a phone with no SIM answers nothing, which is not an error */ }
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
    // A sweep is a one-shot that ENDS, so it is started once here and not on the radio timer — restarting
    // it every 30s would keep a hundred sockets busy for a list that barely changes.
    setHosts([]); setSweep(null);
    if (shell.has("lan.scan")) lanRef.current = shell.subscribe("lan.scan", {}, upsertHost, () => {});
  };
  const stop = () => {
    setScanning(false);
    // Always cancel: a scan left running costs battery behind a screen nobody is looking at.
    try { stopRef.current?.(); } catch { /* already gone */ }
    stopRef.current = null;
    clearInterval(wifiRef.current);
    wifiRef.current = null;
    try { lanRef.current?.(); } catch { /* already gone */ }
    lanRef.current = null;
  };
  useEffect(() => {
    // Under the gate the screen opens already scanning, so nothing ever presses start — sweep once here or
    // the radar photographs with its wifi half empty and the e2e asserts nothing about it.
    if (gate) {
      sweepRadios();
      shell.subscribe("lan.scan", {}, upsertHost, () => {});
    }
    return () => {
      try { stopRef.current?.(); } catch { /* */ }
      try { lanRef.current?.(); } catch { /* */ }
      clearInterval(wifiRef.current);
    };
  }, []);

  // Drop what has gone quiet, so the screen states what is there NOW rather than what ever was.
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
        // Sorted by signal across all three, because "what is closest" is the question the radar answers
        // and three separate lists would make it unanswerable at a glance. dBm is comparable enough for
        // an ordering even where the underlying quantity is not the same.
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

// ---- report: what this device is, as text you can send ----------------------
export function report({ S, t, toast }) {
  const loc = useStore(S.locale);
  const runs = useStore($runs);
  const [logs, setLogs] = useState([]);
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState(null);

  const load = async () => {
    try { setInfo(await shell.call("system.info", {})); setErr(null); }
    catch (e) { setErr(e?.code || ERR.failed); setInfo(null); }
    // What the bridge DID, not just what it returned. Copy takes it along, so one paste carries the
    // whole chain instead of one bit per reinstall.
    try { setLogs((await shell.call("system.logs", {})).lines || []); } catch { setLogs([]); }
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
