// dovkola — the LIVE source for the `list` tab (index.js calls stream(push, S)). It keeps the signals now
// on the air in a Map, and PERSISTS every distinct entity to IndexedDB (/_rt/db.js) so the list survives
// across sessions: each record accumulates a sighting `count`, `firstSeen`, the latest reading, and a capped
// ring of RAW payload samples (the "matrix"). Come back a day later and known devices are still here with
// their history; genuinely new ones are flagged. Rows flush on a cadence — never per-packet.
//
// Under `gate` (localhost without ?live) there is no HackRF, so a deterministic feed re-speaks on a timer —
// which is exactly what exercises the count/persistence path. With ?live the same rows come from
// ./decoders.worker.js. Mock and real are kept in separate collections so a demo never pollutes real finds.
import { gate } from "/_rt/gate.js";
import { collection } from "/_rt/db.js";
import { atom } from "nanostores";
import { usbSupported, USB_FILTERS, VENDOR_ID, PRODUCT_ID } from "/_rt/hackrf.js";

const clamp = (v) => Math.max(0.05, Math.min(1, v));
const nowSafe = () => { try { return Date.now(); } catch { return 0; } };
// which accordion group a signal belongs to → a boolean flag `g_<group>` the section filters test().
const groupOf = (p) => {
  const k = p.kind, b = p.band;
  if (k === "fm") return "fm";
  if (k === "ble" || b === "Bluetooth") return "bt";
  if (b === "2.4 ГГц" || b === "5 ГГц" || b === "Wi-Fi") return "wifi";
  if (k === "gsm" || b === "GSM") return "gsm";
  if (k === "ads" || b === "ADS-B") return "ads";
  if (k === "tpms" || k === "weather" || k === "remote" || b === "433 МГц" || b === "868 МГц") return "ism";
  return "other";
};
const SESSION_START = nowSafe();
const store = collection(gate ? "dovkola-demo" : "dovkola");

// Shared HackRF connection state (read by the Space view's connect button). The worker only starts scanning
// once a device is granted — either a persisted grant (auto, no gesture) or via connectHackRF() (a tap).
export const $connected = atom(false);
export const usbOk = () => usbSupported();
let _worker = null;
export async function connectHackRF() {
  if (!usbSupported()) return false;
  let dev; try { dev = await navigator.usb.requestDevice({ filters: USB_FILTERS }); } catch { return false; }
  if (!dev) return false;
  $connected.set(true);
  if (_worker) _worker.postMessage({ type: "start" });
  return true;
}

// Deterministic pseudo-hex for a raw sample, varied per (id,count) so the matrix moves but screenshots are
// stable. Real decoders will pass p.raw (actual bytes) instead.
function pseudoRaw(id, n, len) {
  let s = 0; const key = id + ":" + n; for (let i = 0; i < key.length; i++) s = (s * 131 + key.charCodeAt(i)) >>> 0;
  const out = [];
  for (let i = 0; i < len; i++) { s = (s * 1664525 + 1013904223) >>> 0; out.push((s >>> 16 & 0xff).toString(16).padStart(2, "0")); }
  return out.join(" ");
}

// Base roster. `name` is the human label; `detail` is the DISAMBIGUATOR (address fragment / model / mode) —
// this is what tells three Apple devices apart. `raw` = bytes per sample (0 = analog, no raw payload).
const SEED = [
  { id: "fm-1025", kind: "fm",      band: "FM",        name: "Радіо Промінь",  detail: "102.5 МГц · RDS",     freqLabel: "102.5 MHz", payload: "♪ Океан Ельзи — Обійми", strength: 0.82, raw: 0 },
  { id: "fm-960",  kind: "fm",      band: "FM",        name: "Хіт FM",         detail: "96.0 МГц · RDS",      freqLabel: "96.0 MHz",  payload: "♪ у прямому ефірі",      strength: 0.58, raw: 0 },
  { id: "tpms-8a", kind: "tpms",    band: "TPMS",      name: "Шина авто",      detail: "Toyota · 0x8A3F",     freqLabel: "433.9 MHz", payload: "2.3 бар · 24 °C",        strength: 0.44, raw: 9, value: 2.3 },
  { id: "wx-wh2",  kind: "weather", band: "433 МГц",   name: "Метеостанція",   detail: "Fine Offset · WH2",   freqLabel: "433.9 MHz", payload: "21.4 °C · 60 %",         strength: 0.36, raw: 5, value: 21.4 },
  { id: "rc-pt",   kind: "remote",  band: "433 МГц",   name: "Дзвінок / пульт",detail: "PT2262 · fixed",      freqLabel: "433.9 MHz", payload: "спрацював",              strength: 0.5,  raw: 3 },
  { id: "ble-ip",  kind: "ble",     band: "Bluetooth", name: "Apple",          detail: "iPhone · e2:a4",      freqLabel: "2.4 GHz",   payload: "Continuity",             strength: 0.55, raw: 12 },
  { id: "ble-ap",  kind: "ble",     band: "Bluetooth", name: "Apple",          detail: "AirPods · 7f:c1",     freqLabel: "2.4 GHz",   payload: "nearby-info",            strength: 0.4,  raw: 12 },
  { id: "ble-mi",  kind: "ble",     band: "Bluetooth", name: "Xiaomi",         detail: "Mi Band · 9d:03",     freqLabel: "2.4 GHz",   payload: "смуга / годинник",       strength: 0.3,  raw: 10 },
  { id: "ble-sm",  kind: "ble",     band: "Bluetooth", name: "Samsung",        detail: "Galaxy · 22:be",      freqLabel: "2.4 GHz",   payload: "Fast Pair",              strength: 0.34, raw: 11 },
  { id: "gsm-900", kind: "gsm",     band: "GSM",       name: "Мобільна вежа",  detail: "GSM900 · downlink",   freqLabel: "942 MHz",   payload: "активна",                strength: 0.62, raw: 0 },
  { id: "wifi-24", kind: "presence",band: "Wi-Fi",     name: "Wi-Fi поруч",    detail: "2.4 ГГц",             freqLabel: "2.4 GHz",   payload: "активність",             strength: 0.7,  raw: 0 },
  { id: "ads-752", kind: "ads",     band: "ADS-B",     name: "Літак PS-752",   detail: "ICAO 508035",         freqLabel: "1090 MHz",  payload: "10 700 м · 780 км/год",  strength: 0.5,  raw: 14, positioned: true, lat: 50.9, lon: 30.12 },
];

export function stream(push, S) {
  const rows = new Map();
  const emit = () => push([...rows.values()]);

  // A sighting: merge with what we already have (in-memory + persisted), bump count, ring the raw samples.
  const sight = (p, fresh) => {
    const t = nowSafe();
    const prev = rows.get(p.id) || {};
    const firstSeen = prev.firstSeen ?? t;
    const count = (prev.count ?? 0) + (fresh ? 1 : 0);
    const raw = p.raw && p.raw > 0 ? (p.rawHex || pseudoRaw(p.id, count, p.raw)) : null;
    const samples = raw ? [...(prev.samples || []), raw].slice(-16) : (prev.samples || []);
    const row = {
      ...p,
      firstSeen, count,
      countLabel: "×" + count,
      isNew: firstSeen >= SESSION_START,
      lastSeen: t,
      strength: clamp(p.strength),
      samples,
    };
    row["g_" + groupOf(p)] = true;
    rows.set(p.id, row);
    // persist the durable shape (not lastSeen churn beyond ts) — fail-open where IndexedDB is absent
    store.put(p.id, { kind: p.kind, band: p.band, bandLabel: p.band, name: p.name, detail: p.detail, freqLabel: p.freqLabel, payload: p.payload, strength: row.strength, firstSeen, count, samples, positioned: p.positioned, lat: p.lat, lon: p.lon }).catch(() => {});
  };

  // Hydrate known entities from previous sessions so returning users see them immediately (with their count).
  store.all().then((saved) => {
    for (const r of saved) {
      if (rows.has(r.id)) continue;
      const hr = { ...r, bandLabel: r.band, countLabel: "×" + (r.count || 1), isNew: false, lastSeen: r._ts || r.firstSeen || nowSafe() };
      hr["g_" + groupOf(r)] = true;
      rows.set(r.id, hr);
    }
    emit();
  }).catch(() => {});

  if (gate) {
    SEED.forEach((s) => sight({ ...s }, true));                       // first sighting of each
    emit();
    let k = 0;
    setInterval(() => {                                               // a rotating signal re-speaks
      const s = SEED[k % SEED.length];
      const jitter = 0.12 * Math.sin(k * 1.7);
      sight({ ...s, strength: clamp(s.strength + jitter) }, true);
      k++;
      emit();
    }, 1100);
    return;
  }

  // Real hardware: the worker multiplexes decoders and posts uniform packets. It idles until a device is
  // granted — auto if the grant persists from a previous visit, otherwise via connectHackRF() (Space tab).
  const w = new Worker(new URL("./decoders.worker.js", import.meta.url), { type: "module" });
  _worker = w;
  w.onmessage = (e) => {
    const d = e.data;
    if (d && d.type === "packet") { sight(d, true); emit(); }
    else if (d && d.type === "error") { $connected.set(false); }
  };
  // pinned scan-band toggles → tell the worker which phases to run (fires now with current value + on change)
  if (S && S.toggles) S.toggles.subscribe((tog) => { try { w.postMessage({ type: "configure", scan: tog || {} }); } catch { /* */ } });
  try {
    navigator.usb && navigator.usb.getDevices && navigator.usb.getDevices().then((ds) => {
      if (ds && ds.some((d) => d.vendorId === VENDOR_ID && d.productId === PRODUCT_ID)) { $connected.set(true); w.postMessage({ type: "start" }); }
    }).catch(() => {});
  } catch { /* */ }
  addEventListener("pagehide", () => { try { w.postMessage({ type: "stop" }); w.terminate(); } catch { /* */ } });
}
