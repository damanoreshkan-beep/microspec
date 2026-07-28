import { fetchJson } from "/_rt/feed.js";
import { gate } from "/_rt/gate.js";

const NAMES = {
  EUR: "Euro", GBP: "British Pound", JPY: "Japanese Yen", CHF: "Swiss Franc", CAD: "Canadian Dollar",
  AUD: "Australian Dollar", NZD: "New Zealand Dollar", CNY: "Chinese Yuan", HKD: "Hong Kong Dollar",
  SGD: "Singapore Dollar", SEK: "Swedish Krona", NOK: "Norwegian Krone", DKK: "Danish Krone",
  PLN: "Polish Złoty", CZK: "Czech Koruna", HUF: "Hungarian Forint", RON: "Romanian Leu",
  BGN: "Bulgarian Lev", TRY: "Turkish Lira", ILS: "Israeli Shekel", INR: "Indian Rupee",
  KRW: "South Korean Won", MXN: "Mexican Peso", BRL: "Brazilian Real", ZAR: "South African Rand",
  IDR: "Indonesian Rupiah", MYR: "Malaysian Ringgit", PHP: "Philippine Peso", THB: "Thai Baht", ISK: "Icelandic Króna",
};

const GATE_PER_USD = {
  EUR: 0.87974, GBP: 0.75262, JPY: 155.42, CHF: 0.81983, CAD: 1.4108, AUD: 1.435,
  CNY: 6.7713, PLN: 3.7419, SEK: 9.6428, INR: 88.126, CZK: 21.278, BRL: 5.1164,
};

export async function load() {
  const d = gate
    ? { rates: GATE_PER_USD, date: "2026-07-28" }
    : await fetchJson("https://api.frankfurter.dev/v1/latest?base=USD");
  const items = Object.entries(d.rates || {})
    .map(([code, perUsd]) => ({
      code,
      name: NAMES[code] || code,
      rate: Math.round((1 / perUsd) * 10000) / 10000, 
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
  return { items, meta: { date: d.date || "" } };
}
