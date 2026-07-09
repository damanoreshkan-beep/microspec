// Exchange-rates adapter (Frankfurter, ECB data — CORS *, no key). Normalises to the runtime's
// converter convention: rate = value of 1 unit of this currency expressed in the base (USD).
import { viaProxy, isJsonObject } from "/_rt/feed.js";

const NAMES = {
  EUR: "Euro", GBP: "British Pound", JPY: "Japanese Yen", CHF: "Swiss Franc", CAD: "Canadian Dollar",
  AUD: "Australian Dollar", NZD: "New Zealand Dollar", CNY: "Chinese Yuan", HKD: "Hong Kong Dollar",
  SGD: "Singapore Dollar", SEK: "Swedish Krona", NOK: "Norwegian Krone", DKK: "Danish Krone",
  PLN: "Polish Złoty", CZK: "Czech Koruna", HUF: "Hungarian Forint", RON: "Romanian Leu",
  BGN: "Bulgarian Lev", TRY: "Turkish Lira", ILS: "Israeli Shekel", INR: "Indian Rupee",
  KRW: "South Korean Won", MXN: "Mexican Peso", BRL: "Brazilian Real", ZAR: "South African Rand",
  IDR: "Indonesian Rupiah", MYR: "Malaysian Ringgit", PHP: "Philippine Peso", THB: "Thai Baht", ISK: "Icelandic Króna",
};

export async function load() {
  const d = JSON.parse(await viaProxy("https://api.frankfurter.dev/v1/latest?base=USD", isJsonObject));
  const items = Object.entries(d.rates || {})
    .map(([code, perUsd]) => ({
      code,
      name: NAMES[code] || code,
      rate: Math.round((1 / perUsd) * 10000) / 10000, // value of 1 unit in USD (base)
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
  return { items, meta: { date: d.date || "" } };
}
