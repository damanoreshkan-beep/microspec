import { assertEquals } from "jsr:@std/assert@1";
import { taglineProblems } from "../../../deploy/listing.mjs";

Deno.test("listing: a description for a person passes", () => {
  assertEquals(taglineProblems("Погода зараз і прогноз"), []);
  assertEquals(taglineProblems("Компас, що показує справжню північ, а не магнітну. Точний у будь-якій точці світу й працює без інтернету."), []);
  assertEquals(taglineProblems("Record two seconds of the world — a door, a cup, rain — and play it like an instrument."), []);
});

Deno.test("listing: how-it-is-built words are named, in both languages", () => {
  const en = taglineProblems("Live prices in real time — WebSocket, no polling. Rendered by a WebAssembly synth.");
  assertEquals(en.length, 1);
  assertEquals(/WebSocket, Rendered, WebAssembly, synth/.test(en[0]), true, en[0]);
  const uk = taglineProblems("Тон 19 кГц синтезується наживо, без семплів.");
  assertEquals(/кГц, синтезується, семплів/.test(uk[0]), true, uk[0]);
  assertEquals(taglineProblems("Синтаксис української мови."), [], "a word that merely starts like one is not jargon");
  assertEquals(taglineProblems("A sample of calm for a rapid mind."), [], "an ordinary English word stays allowed");
});

Deno.test("listing: the first sentence is the store subtitle, so it has a size", () => {
  assertEquals(taglineProblems(""), ["missing"]);
  assertEquals(taglineProblems("Коротко"), ["first sentence is 7 characters (12–90: the store shows it alone)"]);
  const long = "Слово ".repeat(20).trim();
  assertEquals(taglineProblems(long)[0], `first sentence is ${long.length} characters (12–90: the store shows it alone)`);
  assertEquals(taglineProblems("Перше речення нормальної довжини. " + "ще ".repeat(80))[0].includes("(max 240)"), true);
});
