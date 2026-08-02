import { gate } from "/_rt/gate.js";
import { collection } from "/_rt/db.js";
import { atom } from "nanostores";
import { usbSupported, USB_FILTERS, VENDOR_ID, PRODUCT_ID } from "/_rt/hackrf.js";

const clamp = (v) => Math.max(0.05, Math.min(1, v));
const nowSafe = () => { try { return Date.now(); } catch { return 0; } };
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

function pseudoRaw(id, n, len) {
  let s = 0; const key = id + ":" + n; for (let i = 0; i < key.length; i++) s = (s * 131 + key.charCodeAt(i)) >>> 0;
  const out = [];
  for (let i = 0; i < len; i++) { s = (s * 1664525 + 1013904223) >>> 0; out.push((s >>> 16 & 0xff).toString(16).padStart(2, "0")); }
  return out.join(" ");
}

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
    store.put(p.id, { kind: p.kind, band: p.band, bandLabel: p.band, name: p.name, detail: p.detail, freqLabel: p.freqLabel, payload: p.payload, strength: row.strength, firstSeen, count, samples, positioned: p.positioned, lat: p.lat, lon: p.lon }).catch(() => {});
  };

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
    SEED.forEach((s) => sight({ ...s }, true));                       
    emit();
    let k = 0;
    setInterval(() => {                                               
      const s = SEED[k % SEED.length];
      const jitter = 0.12 * Math.sin(k * 1.7);
      sight({ ...s, strength: clamp(s.strength + jitter) }, true);
      k++;
      emit();
    }, 1100);
    return;
  }

  const w = new Worker(new URL("./decoders.worker.js", import.meta.url), { type: "module" });
  _worker = w;
  w.onmessage = (e) => {
    const d = e.data;
    if (d && d.type === "packet") { sight(d, true); emit(); }
    else if (d && d.type === "error") { $connected.set(false); }
  };
  if (S && S.toggles) S.toggles.subscribe((tog) => { try { w.postMessage({ type: "configure", scan: tog || {} }); } catch {  } });
  try {
    navigator.usb && navigator.usb.getDevices && navigator.usb.getDevices().then((ds) => {
      if (ds && ds.some((d) => d.vendorId === VENDOR_ID && d.productId === PRODUCT_ID)) { $connected.set(true); w.postMessage({ type: "start" }); }
    }).catch(() => {});
  } catch {  }
  addEventListener("pagehide", () => { try { w.postMessage({ type: "stop" }); w.terminate(); } catch {  } });
}
