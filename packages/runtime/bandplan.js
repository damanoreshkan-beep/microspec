
export const BANDS = [
  { id: "fm",      key: "bandFm",      lo: 87.5e6,  hi: 108e6,    listen: { mode: "wfm" } },
  { id: "air",     key: "bandAir",     lo: 118e6,   hi: 137e6,    listen: { mode: "am" } },
  { id: "ham2m",   key: "bandHam2m",   lo: 144e6,   hi: 146e6,    listen: { mode: "nfm" } },
  { id: "marine",  key: "bandMarine",  lo: 156e6,   hi: 162.05e6, listen: { mode: "nfm" } },
  { id: "dab",     key: "bandDab",     lo: 174e6,   hi: 240e6 },
  { id: "ism433",  key: "bandIsm433",  lo: 433.05e6, hi: 434.79e6 },   
  { id: "ham70",   key: "bandHam70",   lo: 430e6,   hi: 440e6,    listen: { mode: "nfm" } },
  { id: "pmr",     key: "bandPmr",     lo: 446.0e6, hi: 446.2e6,  listen: { mode: "nfm" } }, 
  { id: "gsmUp",   key: "bandGsmUp",   lo: 880e6,   hi: 915e6 },       
  { id: "gsmDn",   key: "bandGsmDn",   lo: 925e6,   hi: 960e6 },
  { id: "ism868",  key: "bandIsm868",  lo: 863e6,   hi: 870e6 },       
  { id: "gps",     key: "bandGps",     lo: 1574e6,  hi: 1577e6 },      
  { id: "dect",    key: "bandDect",    lo: 1880e6,  hi: 1900e6 },      
  { id: "ism24",   key: "bandIsm24",   lo: 2400e6,  hi: 2483.5e6 },    
  { id: "wifi5",   key: "bandWifi5",   lo: 5150e6,  hi: 5875e6 },
];

export const UNKNOWN = { id: "unknown", key: "bandUnknown" };

export function bandAt(hz) {
  for (const b of BANDS) if (hz >= b.lo && hz <= b.hi) return b;
  return UNKNOWN;
}

export const LISTEN_PRESETS = [
  { id: "air",    key: "listenAir",    icon: "lucide:plane",         spanMHz: [118, 137],  mode: "am" },
  { id: "pmr",    key: "listenPmr",    icon: "lucide:radio",         spanMHz: [446.0, 446.2], mode: "nfm" },
  { id: "ham",    key: "listenHam",    icon: "lucide:radio-tower",   spanMHz: [144, 146],  mode: "nfm" },
  { id: "fm",     key: "listenFm",     icon: "lucide:music",         spanMHz: [87.5, 108], mode: "wfm" },
];

export const RADAR_SPAN = [
  [430, 450],    
  [860, 960],    
  [2400, 2484],  
];

export const DEMOD_MODES = ["am", "nfm", "wfm"];
