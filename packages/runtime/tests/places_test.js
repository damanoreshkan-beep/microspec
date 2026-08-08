// microspec runtime — places unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { translit, isCyrillic, toPlace, placeLabel, formatCoords } from "../places.js";

Deno.test("places/translit: official Ukrainian romanisation reaches the English geocoder index", () => {
  // The geocoder holds no Ukrainian names, so Cyrillic input is romanised with the scheme that produced the
  // English names in the first place (KMU 1996/2010). Every pair below was confirmed to be a live hit.
  const pairs = [["Київ", "Kyiv"], ["Львів", "Lviv"], ["Одеса", "Odesa"], ["Харків", "Kharkiv"],
    ["Дніпро", "Dnipro"], ["Чернівці", "Chernivtsi"], ["Запоріжжя", "Zaporizhzhia"], ["Ужгород", "Uzhhorod"],
    ["Івано-Франківськ", "Ivano-Frankivsk"], ["Тернопіль", "Ternopil"], ["Вінниця", "Vinnytsia"]];
  for (const [uk, en] of pairs) assertEquals(translit(uk), en, uk);
  assertEquals(translit("Згорани"), "Zghorany", "зг is the one digraph that would otherwise collide with ж");
  assertEquals(translit("Єнакієве"), "Yenakiieve", "є romanises as ye at the start of a word, ie inside it");
  assertEquals(translit("Ялта"), "Yalta");
  assert(isCyrillic("Київ"));
  assert(!isCyrillic("Kyiv"));
  assertEquals(translit("Ulm"), "Ulm", "Latin input passes through untouched");
});

Deno.test("places/toPlace: a row without a time zone is dropped, never guessed", () => {
  const row = { id: 2820256, name: "Ulm", latitude: 48.39841, longitude: 9.99155, timezone: "Europe/Berlin",
    country: "Germany", country_code: "DE", admin1: "Baden-Wurttemberg" };
  const p = toPlace(row);
  assertEquals(p.zone, "Europe/Berlin");
  assertEquals(placeLabel(p), "Ulm · Baden-Wurttemberg, Germany");
  assertEquals(toPlace({ ...row, timezone: null }), null, "no zone means no chart — guessing one would corrupt it");
  assertEquals(toPlace({ ...row, latitude: null }), null);
  assertEquals(toPlace(null), null);
  assertEquals(placeLabel({ name: "Kyiv", region: "Kyiv", country: "Ukraine" }), "Kyiv · Ukraine",
    "a region that merely repeats the city adds nothing");
});

Deno.test("places/formatCoords: degrees and minutes the way an astrologer writes them", () => {
  assertEquals(formatCoords(48.4, 10), "48°24'N 10°00'E");
  assertEquals(formatCoords(-33.86, -70.5), "33°52'S 70°30'W");
  assertEquals(formatCoords(50.99999, 0), "51°00'N 0°00'E", "a minute that rounds to 60 carries into the degree");
});
