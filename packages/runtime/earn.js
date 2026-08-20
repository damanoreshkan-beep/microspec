// microspec runtime — earnings maths (apps/hoard). Pure: no DOM, no storage, no fetch. The app is the
// surface; every number it shows and every channel it feeds the shader is computed here and unit-tested.
//
// The accrual model is the WORK CLOCK, not the calendar: a monthly salary is divided by the seconds you
// actually work in a month (days x hours), never by the ~2.6M seconds a month contains. That is why the
// screen has a start/stop at all — a calendar rate would tick while you sleep and the button would be a lie.

export const CURRENCIES = ["UAH", "USD"];
const SYMBOL = { UAH: "₴", USD: "$" };
const SUFFIX = { UAH: true };                 // symbol trails the number (12 480,25 ₴ / $1 240,25)
const NBSP = " ";                        // groups thousands and holds the symbol; never breaks

// The three ways a person is actually paid. `shift` and `day` share one formula and differ in the default
// block length, which is the honest difference: the label frames what the number in the field means.
export const MODES = ["month", "shift", "day"];
export const DEFAULTS = {
  month: { pay: 30000, days: 21, hours: 8 },
  shift: { pay: 1600, days: 1, hours: 12 },
  day: { pay: 1400, days: 1, hours: 8 },
};

const num = (v) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };

// normRate(raw) → a rate object safe to compute with. Unknown mode falls back to `month`; blanks fall back
// to that mode's default, so a half-filled form still produces a field that moves instead of a NaN.
export function normRate(raw) {
  const mode = MODES.includes(raw?.mode) ? raw.mode : "month";
  const d = DEFAULTS[mode];
  const pay = num(raw?.pay) > 0 ? num(raw.pay) : d.pay;
  const days = mode === "month" ? (num(raw?.days) > 0 ? num(raw.days) : d.days) : 1;
  const hours = num(raw?.hours) > 0 ? num(raw.hours) : d.hours;
  const currency = CURRENCIES.includes(raw?.currency) ? raw.currency : CURRENCIES[0];
  return { mode, pay, days, hours, currency };
}

// perSecond(rate) → money earned per second of work. 0 where the rate cannot be resolved (a zero pay or a
// zero-length block), so a caller never divides by it.
export function perSecond(raw) {
  const { pay, days, hours } = normRate(raw);
  const seconds = days * hours * 3600;
  return seconds > 0 ? pay / seconds : 0;
}

// earned(perSec, ms) → the amount accrued over an elapsed span. Milliseconds because the only honest source
// of elapsed time is (now - startedAt): a counter that adds a tick per frame drifts every time the tab is
// backgrounded, and this app's whole premise is that it keeps earning while the screen is off.
export const earned = (perSec, ms) => Math.max(0, perSec) * Math.max(0, ms) / 1000;

// hoardFill(amount, perSec) → 0..1, how high the molten mass stands. Saturating rather than linear: a
// working day must read as a full hoard whatever the salary is, so the scale is the WORK, not the sum.
// k = four hours of this rate → 4h ≈ 0.63, 8h ≈ 0.86, 12h ≈ 0.95, and it can never overflow the frame.
export function hoardFill(amount, perSec) {
  const k = Math.max(perSec, 1e-9) * 3600 * 4;
  return 1 - Math.exp(-Math.max(0, amount) / k);
}

// lifetimeDepth(total, perSec) → 0..1, everything ever banked on the same saturating curve but over a
// month of work (21 days x 8 h). It deepens the field's colour and gem density: the hoard remembers.
export function lifetimeDepth(total, perSec) {
  const k = Math.max(perSec, 1e-9) * 3600 * 8 * 21;
  return 1 - Math.exp(-Math.max(0, total) / k);
}

// rateDp(perSec) → decimals a per-second rate needs to be readable. 0,0231 ₴/s carries information;
// 0,02 ₴/s has thrown half of it away, and 0,023100 is noise.
export const rateDp = (perSec) => (perSec >= 1 ? 2 : perSec >= 0.01 ? 3 : 4);

// fmtAmount(12480.25, "UAH") → "12 480,25 ₴" (spaces are NBSP). Decimals are FIXED, unlike wish.js's
// fmtMoney which drops an empty fraction — a live ticker whose width changes every whole unit jitters.
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

// fmtSpan(ms) → "12:04" under an hour, "3:12:04" over one. Not player.js's clock(), which is m:ss and would
// print a nine-hour shift as "540:00".
export function fmtSpan(ms) {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(2, "0"), ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// vaultTotals(list) → [{ currency, sum, ms, count }] in CURRENCIES order. Mixed currencies cannot be added,
// so they are grouped — the same call wish.js's wishTotals makes, for the same reason.
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
