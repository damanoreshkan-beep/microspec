// microspec runtime — wish unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assertEquals } from "jsr:@std/assert@1";
import { parsePrice, parseWishMeta, toNumber, sortWishes, wishTotals, fmtMoney } from "../wish.js";

// ---- wish (wishlist logic) --------------------------------------------------

Deno.test("toNumber: normalises grouped/decimal forms", () => {
  assertEquals(toNumber("1 299,00"), 1299);
  assertEquals(toNumber("1,299.00"), 1299);
  assertEquals(toNumber("14 200"), 14200);
  assertEquals(toNumber("199,90"), 199.9);
  assertEquals(toNumber("14 200"), 14200);   // NBSP thousands (how many sites print UAH)
  assertEquals(toNumber("nope"), null);
});

Deno.test("parsePrice: anchors a number to a currency, ignores bare numbers", () => {
  assertEquals(parsePrice("Ціна 14 200 ₴ зі знижкою"), { price: 14200, currency: "UAH" });
  assertEquals(parsePrice("$1,299.00 today"), { price: 1299, currency: "USD" });
  assertEquals(parsePrice("199 zł"), { price: 199, currency: "PLN" });
  assertEquals(parsePrice("тільки 990 грн"), { price: 990, currency: "UAH" });
  assertEquals(parsePrice("iPhone 15 Pro"), null, "a model number is not a price");
  assertEquals(parsePrice(""), null);
});

Deno.test("parseWishMeta: pulls title + price + first image, all fail-open", () => {
  const data = {
    title: "  Sony WH-1000XM5  ",
    description: "Найкращі навушники — 13 999 ₴",
    content: "spec spec ![alt](https://img.example/x.jpg) more",
  };
  const m = parseWishMeta(data, "https://shop/x");
  assertEquals(m.title, "Sony WH-1000XM5");
  assertEquals(m.price, 13999);
  assertEquals(m.currency, "UAH");
  assertEquals(m.image, "https://img.example/x.jpg");
  // empty data → empty fields, never throws
  const e = parseWishMeta({}, "u");
  assertEquals(e.title, ""); assertEquals(e.price, null); assertEquals(e.image, "");
});

Deno.test("sortWishes: most-wanted first, then newest; non-mutating", () => {
  const src = [
    { id: "a", want: 1, createdAt: 100 },
    { id: "b", want: 3, createdAt: 50 },
    { id: "c", want: 3, createdAt: 90 },
  ];
  assertEquals(sortWishes(src).map((w) => w.id), ["c", "b", "a"]);
  assertEquals(src[0].id, "a", "input array not mutated");
});

Deno.test("wishTotals: groups non-granted by currency, skips granted/priceless", () => {
  const t = wishTotals([
    { price: 100, currency: "USD" },
    { price: 50, currency: "USD", granted: true },   // granted → excluded
    { price: 14200, currency: "UAH" },
    { price: null, currency: "UAH" },                 // no price → excluded
    { price: 200, currency: "USD" },
  ]);
  assertEquals(t, [{ currency: "UAH", sum: 14200, count: 1 }, { currency: "USD", sum: 300, count: 2 }]);
});

Deno.test("fmtMoney: grouped thousands, symbol side per currency", () => {
  const NB = " ";
  assertEquals(fmtMoney(14200, "UAH"), `14${NB}200${NB}₴`);
  assertEquals(fmtMoney(1299, "USD"), `$1${NB}299`);
  assertEquals(fmtMoney(199, "PLN"), `199${NB}zł`);
  assertEquals(fmtMoney(199.9, "EUR"), "€199,90");
  assertEquals(fmtMoney(null, "UAH"), "");
});
