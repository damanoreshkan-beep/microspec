// prox — reads the proximity-pairing beacons every phone around you broadcasts, and names what each one is
// asking a target device to do.
//
// The honest through-line, decided in docs/research/ble-air.md and encoded in packages/runtime/blesig.js:
// most of these popups carry NO text you can choose. A card says so out loud — "custom text?" is free only
// for Swift Pair, fixed-by-a-code for Apple Continuity, database-driven for Fast Pair. The grid is the
// taxonomy; a card lights up when that protocol is actually in the air, and a tap shows the raw bytes.
//
// This tab only SCANS (permission "ble"). The transmitter is a separate, consent-gated capability.
import { html } from "htm/preact";
import { useEffect, useMemo } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom } from "nanostores";
import { T } from "/_rt/i18n.js";
import { Sheet } from "/_rt/ui.js";
import { shell, ERR } from "/_rt/shell.js";
import { gate } from "/_rt/gate.js";
import { band } from "/_rt/radar.js";
import { signatures } from "/_rt/blesig.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

// A card is "live" while it has been heard this recently. A pairing beacon repeats several times a second,
// so a few seconds of silence is a real absence, not a gap between packets.
const LIVE_MS = 6000;

// The grid, in the order it reads: Apple first (the owner's iPad is the test target), then the other
// ecosystems, then the open beacon. `textKind` is the whole point of the app, so it lives on the card.
const CARDS = [
  { key: "nearbyAction", icon: "lucide:wifi", vendor: "apple", target: "ios", textKind: "fixed" },
  { key: "proximityPairing", icon: "lucide:headphones", vendor: "apple", target: "ios", textKind: "none" },
  { key: "nearbyInfo", icon: "lucide:smartphone", vendor: "apple", target: "ios", textKind: "none" },
  { key: "findMy", icon: "lucide:map-pin", vendor: "apple", target: "ios", textKind: "none" },
  { key: "swiftPair", icon: "lucide:monitor", vendor: "microsoft", target: "windows", textKind: "free" },
  { key: "fastPair", icon: "lucide:bluetooth", vendor: "google", target: "android", textKind: "db" },
  { key: "easySetup", icon: "lucide:watch", vendor: "samsung", target: "android", textKind: "none" },
  { key: "eddystone", icon: "lucide:radio", vendor: "eddystone", target: "any", textKind: "free" },
];
const CARD_KEYS = new Set(CARDS.map((c) => c.key));

/** Which grid card a decoded signature belongs to — Continuity fans out by message, the rest are 1:1. */
function cardKeyOf(sig) {
  if (sig.protocol === "continuity") {
    return CARD_KEYS.has(sig.msg) ? sig.msg : null;   // airdrop/handoff/… have no card of their own
  }
  if (sig.protocol === "fastPair") return "fastPair";
  if (sig.protocol === "eddystone") return "eddystone";
  return sig.protocol;                                // swiftPair, easySetup
}

const $seen = atom({});        // cardKey → { count, rssi, at, detail, raw, text, msg }
const $packets = atom(0);
const $listening = atom(false);
const $now = atom(Date.now());
const $err = atom(null);
const $blocked = atom(null);
const $needPerm = atom(null);
const $sel = atom(null);       // the open card key, or null

const PERM_RE = /denied:([A-Z_]+)/;
function noteError(e) {
  const code = e?.code || ERR.failed;
  const detail = e?.detail || "";
  const m = PERM_RE.exec(detail) || PERM_RE.exec(code);
  if (m) $needPerm.set(m[1]);
  $err.set(`${code}${detail ? ` · ${detail}` : ""}`);
}

async function grant() {
  const p = $needPerm.get();
  if (!p) return;
  try {
    const r = await shell.call("system.grant", { permission: p });
    if (r?.state === "granted") { $needPerm.set(null); $err.set(null); hush(); listen(); return; }
  } catch { /* the grant call failed; settings is still worth offering */ }
  try { await shell.call("system.settings", { page: "app" }); } catch { /* nothing else to offer */ }
}

// The gate has no radio, so seed the widest populated grid it will ever measure: a lit card of every text
// kind, the Cyrillic Swift Pair name that stresses the layout, and the Wi-Fi Password action byte.
const GATE_SEEN = {
  nearbyAction: { count: 42, rssi: -51, detail: { actionType: 0x08, action: "wifiPassword", popup: true }, raw: "0f05c00811223310", text: { fixed: "na_wifiPassword" }, msg: "nearbyAction" },
  proximityPairing: { count: 18, rssi: -63, detail: { model: 0x0e20, modelName: "airpodsPro" }, raw: "0719010e2055", text: null, msg: "proximityPairing" },
  nearbyInfo: { count: 77, rssi: -58, detail: { status: 3, activity: 7 }, raw: "100537008390", text: null, msg: "nearbyInfo" },
  swiftPair: { count: 9, rssi: -70, detail: { subScenario: 0, name: "тук тук" }, raw: "030080d182d183d0ba20d182d183d0ba", text: { free: "тук тук" }, msg: "swiftPair" },
  fastPair: { count: 5, rssi: -66, detail: { mode: "discoverable", modelId: "aabbcc" }, raw: "aabbcc", text: { db: "aabbcc" }, msg: "fastPairModel" },
  eddystone: { count: 3, rssi: -82, detail: { frame: "url", url: "https://www.example.com/" }, raw: "10ec016578616d706c6500", text: { free: "https://www.example.com/" }, msg: "eddystone_url" },
};

let stopScan = null;
let ageTimer = null;

function heard(frame) {
  if (frame && frame.raw) $packets.set($packets.get() + 1);
  const sigs = signatures(frame && frame.raw);
  if (!sigs.length) return;
  const now = Date.now();
  const next = { ...$seen.get() };
  for (const sig of sigs) {
    const k = cardKeyOf(sig);
    if (!k) continue;
    const prev = next[k];
    next[k] = {
      count: (prev?.count || 0) + 1,
      rssi: Number.isFinite(frame?.rssi) ? frame.rssi : (prev?.rssi ?? null),
      at: now, detail: sig.detail, raw: sig.raw, text: sig.text, msg: sig.msg,
    };
  }
  $seen.set(next);
}

async function diagnose() {
  if (gate) return;
  try {
    const info = await shell.call("system.info", {});
    if (info && info.locationOn === false) { $blocked.set("locationOff"); return; }
  } catch { /* older shell has no such field; fall through */ }
  try {
    const st = await shell.call("ble.state", {});
    if (st && st.supported === false) { $blocked.set("noBle"); return; }
    if (st && st.on === false) { $blocked.set("bleOff"); return; }
  } catch { /* the subscribe error path will say so */ }
  $blocked.set(null);
}

function listen() {
  if ($listening.get()) return;
  $listening.set(true);
  $err.set(null);
  if (gate) { $seen.set({ ...GATE_SEEN }); $packets.set(1893); return; }
  diagnose();
  ageTimer = setInterval(() => $now.set(Date.now()), 1000);
  stopScan = shell.subscribe("ble.scan", {}, heard, (e) => { noteError(e); $listening.set(false); });
}

function hush() {
  $listening.set(false);
  try { stopScan?.(); } catch { /* already gone */ }
  stopScan = null;
  clearInterval(ageTimer); ageTimer = null;
}

const isLive = (entry, now) => !!entry && (gate || now - entry.at <= LIVE_MS);

/** The decoded fields a card's sheet shows, as [labelKey, value] rows — value already display-ready. */
function detailRows(key, entry, t) {
  if (!entry) return [];
  const d = entry.detail || {};
  if (key === "nearbyAction") {
    return [
      ["dAction", d.action ? T(t, `na_${d.action}`) : "—"],
      ["dPopup", T(t, d.popup ? "yes" : "no")],
    ];
  }
  if (key === "proximityPairing") {
    return [
      ["dModel", d.modelName ? T(t, `model_${d.modelName}`) : "—"],
      ["dCode", d.model != null ? `0x${d.model.toString(16).padStart(4, "0")}` : "—"],
    ];
  }
  if (key === "nearbyInfo") return [["dStatus", `${d.status ?? "—"} / ${d.activity ?? "—"}`]];
  if (key === "swiftPair") return [["dName", d.name || "—"], ["dSub", `0x${(d.subScenario ?? 0).toString(16).padStart(2, "0")}`]];
  if (key === "fastPair") return [["dMode", T(t, `fpMode_${d.mode}`)], ["dModelId", d.modelId ? `0x${d.modelId}` : "—"]];
  if (key === "eddystone") return [["dFrame", d.frame || "—"], ...(d.url ? [["dUrl", d.url]] : [])];
  return [];
}

// One accent-tinted pill per text kind. Colour is meaning: the free-form one wears the app accent, the rest
// are neutral — a glance at the grid answers "which of these could carry my words".
function KindBadge({ kind, t }) {
  const free = kind === "free";
  return html`<span data-kind=${kind}
    class=${`shrink-0 rounded-full px-2 py-0.5 text-[0.62rem] font-mono uppercase tracking-wide ${free ? "text-[var(--app-accent)] border border-[var(--app-accent)]" : "text-muted border border-base-content/20"}`}>
    ${T(t, `kind_${kind}`)}
  </span>`;
}

function Card({ card, entry, now, t, onOpen }) {
  const live = isLive(entry, now);
  const b = live && entry?.rssi != null ? band(entry.rssi) : null;
  return html`<button data-card=${card.key} data-live=${live ? "1" : "0"} onClick=${onOpen}
    class=${`text-left rounded-2xl p-3 flex flex-col gap-2 min-w-0 transition-colors sf-raised ${live ? "sf-e2 ring-1 ring-[var(--app-accent)]" : "opacity-60"}`}>
    <div class="flex items-center gap-2 min-w-0">
      ${Icon(card.icon, `text-[1.15em] shrink-0 ${live ? "text-[var(--app-accent)]" : "text-muted"}`)}
      <span class="min-w-0 truncate font-medium text-base-content">${T(t, `name_${card.key}`)}</span>
    </div>
    <div class="flex items-center gap-1.5 min-w-0">
      <span class="shrink-0 rounded px-1.5 py-0.5 text-[0.62rem] uppercase tracking-wide bg-base-content/10 text-base-content/70">${T(t, `target_${card.target}`)}</span>
      <${KindBadge} kind=${card.textKind} t=${t} />
    </div>
    <div class="flex items-center gap-2 font-mono text-[0.7rem] text-base-content/70 min-w-0">
      ${live
        ? html`<span data-count>${entry.count}×</span>${b ? html`<span data-band>${T(t, `band_${b}`)}</span>` : null}`
        : html`<span>${T(t, "notHeard")}</span>`}
    </div>
  </button>`;
}

function CardSheet({ card, entry, t, open, onClose }) {
  const live = !!entry;
  const rows = detailRows(card?.key, entry, t);
  return html`<${Sheet} id="prox-card" open=${open} onClose=${onClose}
      title=${card ? T(t, `name_${card.key}`) : ""} icon=${card?.icon}>
    ${card ? html`<div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="rounded px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide bg-base-content/10 text-base-content/70">${T(t, `target_${card.target}`)}</span>
        <${KindBadge} kind=${card.textKind} t=${t} />
      </div>

      <p class="text-base-content/80 leading-relaxed">${T(t, `expl_${card.key}`)}</p>

      <div data-custom class="rounded-xl p-3 sf-sunken flex items-start gap-2">
        ${Icon(card.textKind === "free" ? "lucide:pencil" : "lucide:lock", "text-[1.1em] shrink-0 mt-0.5 text-base-content/70")}
        <div class="min-w-0">
          <div class="text-[0.72rem] uppercase tracking-wide text-muted">${T(t, "customText")}</div>
          <div class="text-base-content">${T(t, `custom_${card.textKind}`)}</div>
        </div>
      </div>

      ${live
        ? html`<div data-decode class="flex flex-col gap-2">
            <div class="text-[0.72rem] uppercase tracking-wide text-muted">${T(t, "decoded")}</div>
            ${rows.map(([k, v]) => html`<div class="flex items-baseline gap-3 min-w-0">
              <span class="shrink-0 w-28 text-muted text-[0.8rem]">${T(t, k)}</span>
              <span class="min-w-0 break-words text-base-content">${v}</span>
            </div>`)}
            <div class="flex items-baseline gap-3">
              <span class="shrink-0 w-28 text-muted text-[0.8rem]">${T(t, "dSignal")}</span>
              <span class="text-base-content">${entry.rssi != null ? `${entry.rssi} dBm · ${T(t, `band_${band(entry.rssi)}`)}` : "—"}</span>
            </div>
            <div class="text-[0.72rem] uppercase tracking-wide text-muted mt-1">${T(t, "rawBytes")}</div>
            <code class="block break-all font-mono text-[0.78rem] text-base-content/80 sf-sunken rounded-lg p-2">${entry.raw}</code>
          </div>`
        : html`<div data-never class="text-muted text-[0.9rem]">${T(t, "neverSeen")}</div>`}
    </div>` : null}
  </${Sheet}>`;
}

export function proxView({ S, t, openScreen, closeScreen }) {
  const seen = useStore($seen);
  const packets = useStore($packets);
  const listening = useStore($listening);
  const now = useStore($now);
  const err = useStore($err);
  const blocked = useStore($blocked);
  const needPerm = useStore($needPerm);
  const screen = useStore(S.screen);
  const selKey = useStore($sel);

  useEffect(() => {
    listen();
    return () => { if (!gate) hush(); };
  }, []);

  const liveCount = useMemo(
    () => CARDS.filter((c) => isLive(seen[c.key], now)).length, [seen, now]);

  const open = (key) => { $sel.set(key); openScreen("card"); };
  const close = () => { closeScreen(); $sel.set(null); };
  const sel = CARDS.find((c) => c.key === selKey) || null;

  return html`<div class="flex flex-col gap-3 px-[var(--ms-pad)] pb-[calc(var(--dock-h)+2rem)]">
    <div data-scanner class="flex items-center gap-2 pt-1 text-base-content/70">
      <span class=${`w-1.5 h-1.5 rounded-full ${listening ? "bg-[var(--app-accent)]" : "bg-base-content/30"} ${listening && !gate ? "animate-pulse" : ""}`}></span>
      <span class="font-mono text-[0.7rem]">${packets}</span>
      <span class="font-mono text-[0.7rem]">${T(t, "packets")}</span>
      <span class="font-mono text-[0.7rem] ml-auto" data-livecount>${liveCount}/${CARDS.length} ${T(t, "inAir")}</span>
    </div>

    ${blocked
      ? html`<div data-blocked class="flex items-start gap-2 min-w-0 rounded-xl p-3 sf-sunken">
          ${Icon("lucide:triangle-alert", "text-[1.1em] shrink-0 mt-0.5 text-[var(--app-accent)]")}
          <span class="min-w-0 text-base-content">${T(t, blocked)}</span>
        </div>`
      : null}
    ${err
      ? html`<div data-err class="flex items-start gap-2 min-w-0 rounded-xl p-3 sf-sunken">
          ${Icon("lucide:triangle-alert", "text-[1.1em] shrink-0 mt-0.5 text-[var(--app-accent)]")}
          <span class="min-w-0 break-words font-mono text-[0.8rem] text-base-content">${String(err)}</span>
          ${needPerm
            ? html`<button data-grant class="btn btn-sm btn-primary shrink-0 ml-auto" onClick=${grant}>${T(t, "allow")}</button>`
            : null}
        </div>`
      : null}

    <div data-grid class="grid grid-cols-2 gap-2">
      ${CARDS.map((card) => html`<${Card} key=${card.key} card=${card}
        entry=${seen[card.key]} now=${now} t=${t} onOpen=${() => open(card.key)} />`)}
    </div>

    <${CardSheet} card=${sel} entry=${sel ? seen[sel.key] : null} t=${t}
      open=${screen === "card" && !!sel} onClose=${close} />
  </div>`;
}
