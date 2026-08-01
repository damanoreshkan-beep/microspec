// microspec runtime — the band atlas that turns a raw frequency into a HUMAN thing. This is where "no
// frequencies on the surface" is enforced: the Radar and the Listen tab render the `key` (an i18n string the
// app supplies in en+uk), never the Hz. Region 1 (Europe / Ukraine) allocations. Pure + unit-tested; the Hz
// live here, not in the view.
//
// A band carries: id (stable), key (i18n key the app renders), and optional `listen` = how to demodulate it
// ({ mode, marginDb? }). `demystifies` a peak → a named source; `LISTEN_PRESETS` drives the tap-and-play tiles.

// Ordered narrow→wide so the FIRST match wins (ISM 433 sits inside nothing, but keep specific before generic).
export const BANDS = [
  { id: "fm",      key: "bandFm",      lo: 87.5e6,  hi: 108e6,    listen: { mode: "wfm" } },
  { id: "air",     key: "bandAir",     lo: 118e6,   hi: 137e6,    listen: { mode: "am" } },
  { id: "ham2m",   key: "bandHam2m",   lo: 144e6,   hi: 146e6,    listen: { mode: "nfm" } },
  { id: "marine",  key: "bandMarine",  lo: 156e6,   hi: 162.05e6, listen: { mode: "nfm" } },
  { id: "dab",     key: "bandDab",     lo: 174e6,   hi: 240e6 },
  { id: "ism433",  key: "bandIsm433",  lo: 433.05e6, hi: 434.79e6 },   // car remotes, TPMS, sensors
  { id: "ham70",   key: "bandHam70",   lo: 430e6,   hi: 440e6,    listen: { mode: "nfm" } },
  { id: "pmr",     key: "bandPmr",     lo: 446.0e6, hi: 446.2e6,  listen: { mode: "nfm" } }, // walkie-talkies
  { id: "gsmUp",   key: "bandGsmUp",   lo: 880e6,   hi: 915e6 },       // phone → tower (your handset)
  { id: "gsmDn",   key: "bandGsmDn",   lo: 925e6,   hi: 960e6 },
  { id: "ism868",  key: "bandIsm868",  lo: 863e6,   hi: 870e6 },       // LoRa, meters, sensors
  { id: "gps",     key: "bandGps",     lo: 1574e6,  hi: 1577e6 },      // L1 — famously invisible (below noise)
  { id: "dect",    key: "bandDect",    lo: 1880e6,  hi: 1900e6 },      // cordless phones
  { id: "ism24",   key: "bandIsm24",   lo: 2400e6,  hi: 2483.5e6 },    // Wi-Fi + Bluetooth + microwave leak
  { id: "wifi5",   key: "bandWifi5",   lo: 5150e6,  hi: 5875e6 },
];

export const UNKNOWN = { id: "unknown", key: "bandUnknown" };

// Classify a peak frequency (Hz) → the named band it falls in, or UNKNOWN. First match in BANDS order wins.
export function bandAt(hz) {
  for (const b of BANDS) if (hz >= b.lo && hz <= b.hi) return b;
  return UNKNOWN;
}

// The Listen tab's tap-and-play tiles: openly-receivable ANALOG voice only (see RESEARCH.md §7). Each names a
// band to narrow-sweep for the strongest active channel, then demodulate. `spanMHz` is the search range; the
// engine tunes to the strongest bin inside it (sweep.js strongestBin).
export const LISTEN_PRESETS = [
  { id: "air",    key: "listenAir",    icon: "lucide:plane",         spanMHz: [118, 137],  mode: "am" },
  { id: "pmr",    key: "listenPmr",    icon: "lucide:radio",         spanMHz: [446.0, 446.2], mode: "nfm" },
  { id: "ham",    key: "listenHam",    icon: "lucide:radio-tower",   spanMHz: [144, 146],  mode: "nfm" },
  { id: "fm",     key: "listenFm",     icon: "lucide:music",         spanMHz: [87.5, 108], mode: "wfm" },
];

// The bands the Radar sweeps by default — the ones a phone-carrying person actually has around them. Kept
// small so the byte rate stays a fraction of a full 1M–6G pass (RESEARCH.md §4). Each entry is [startMHz, stopMHz].
export const RADAR_SPAN = [
  [430, 450],    // remotes / ham / PMR
  [860, 960],    // LoRa / meters / your phone / GSM
  [2400, 2484],  // Wi-Fi / Bluetooth / microwave
];

export const DEMOD_MODES = ["am", "nfm", "wfm"];
