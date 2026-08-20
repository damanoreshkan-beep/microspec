
export const CURRENCIES = ["UAH", "USD"];
const SYMBOL = { UAH: "₴", USD: "$" };
const SUFFIX = { UAH: true };                 
const NBSP = " ";                        

export const MODES = ["month", "shift", "day"];
export const DEFAULTS = {
  month: { pay: 30000, days: 21, hours: 8 },
  shift: { pay: 1600, days: 1, hours: 12 },
  day: { pay: 1400, days: 1, hours: 8 },
};

const num = (v) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };

export function normRate(raw) {
  const mode = MODES.includes(raw?.mode) ? raw.mode : "month";
  const d = DEFAULTS[mode];
  const pay = num(raw?.pay) > 0 ? num(raw.pay) : d.pay;
  const days = mode === "month" ? (num(raw?.days) > 0 ? num(raw.days) : d.days) : 1;
  const hours = num(raw?.hours) > 0 ? num(raw.hours) : d.hours;
  const currency = CURRENCIES.includes(raw?.currency) ? raw.currency : CURRENCIES[0];
  return { mode, pay, days, hours, currency };
}

export function perSecond(raw) {
  const { pay, days, hours } = normRate(raw);
  const seconds = days * hours * 3600;
  return seconds > 0 ? pay / seconds : 0;
}

export const earned = (perSec, ms) => Math.max(0, perSec) * Math.max(0, ms) / 1000;

export function hoardFill(amount, perSec) {
  const k = Math.max(perSec, 1e-9) * 3600 * 4;
  return 1 - Math.exp(-Math.max(0, amount) / k);
}

export function lifetimeDepth(total, perSec) {
  const k = Math.max(perSec, 1e-9) * 3600 * 8 * 21;
  return 1 - Math.exp(-Math.max(0, total) / k);
}

export const rateDp = (perSec) => (perSec >= 1 ? 2 : perSec >= 0.01 ? 3 : 4);

export function fmtAmount(n, currency, dp = 2) {
  const v = Number.isFinite(n) ? n : 0;
  const sym = SYMBOL[currency] || "";
  const neg = v < 0;
  const abs = Math.abs(v);
  const p = Math.pow(10, dp);
  const r = Math.round(abs * p) / p;
  const int = Math.floor(r);
  const grouped = String(int).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const frac = dp > 0 ? "," + String(Math.round((r - int) * p)).padStart(dp, "0") : "";
  const body = (neg ? "-" : "") + grouped + frac;
  return SUFFIX[currency] ? body + NBSP + sym : sym + body;
}

export function fmtSpan(ms) {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(2, "0"), ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function vaultTotals(list) {
  const by = {};
  for (const s of list || []) {
    const c = CURRENCIES.includes(s?.currency) ? s.currency : CURRENCIES[0];
    (by[c] || (by[c] = { currency: c, sum: 0, ms: 0, count: 0 }));
    by[c].sum += Number(s.amount) || 0;
    by[c].ms += Number(s.ms) || 0;
    by[c].count += 1;
  }
  return CURRENCIES.filter((c) => by[c]).map((c) => by[c]);
}
