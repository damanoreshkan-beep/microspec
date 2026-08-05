// The radio does not exist in Chromium, so the app seeds a deterministic field under the gate — an empty
// screen photographs exactly like a broken one, and a test against it asserts nothing.
//
// Every test names the tab it needs first: they share one page, and a test that inherits wherever the
// previous one stopped fails for reasons unrelated to what it checks.
export default [
  {
    name: "hive: every radio is a cell, and each one is counted on its own", run: async (h) => {
      await h.click('[data-tab="hive"]'); await h.wait(500);
      h.expect((await h.count("[data-mark]")) === 1, "соти не змонтувались");
      h.expect((await h.count("[data-live]")) >= 1, "немає елемента, який не існує без показань");
      // BLE, Wi-Fi and cell must be tallied SEPARATELY — one total hides a radio that stopped answering.
      for (const k of ["ble", "wifi", "lte"]) {
        h.expect((await h.count(`[data-legend-kind="${k}"]`)) === 1, `у легенді немає ${k}`);
      }
      const legend = await h.text("[data-legend]");
      h.expect(/\d/.test(legend), `легенда без чисел: ${legend}`);
    },
  },
  {
    name: "list: rows carry a percentage, and a vendor only where the address has one", run: async (h) => {
      await h.click('[data-tab="list"]'); await h.wait(900);   // the 519 KB registry loads once, here
      const rows = await h.count("[data-dev]");
      h.expect(rows >= 8, `очікував усі три радіо у списку, знайшов ${rows}`);
      for (const k of ["ble", "wifi", "lte"]) {
        h.expect((await h.count(`[data-dev][data-kind="${k}"]`)) >= 1, `у списку немає ${k}`);
      }
      // Every row states a percentage of its OWN radio's range.
      h.expect((await h.count("[data-pct]")) === rows, "є рядки без відсотка");
      h.expect(/%/.test(await h.text("[data-pct]")), "відсоток без знака");

      // The honesty rule, asserted both ways: registered prefixes resolve, rotating addresses do not.
      const vendors = await h.count("[data-vendor]");
      h.expect(vendors >= 2, `виробника не показано для жодної справжньої адреси (${vendors})`);
      h.expect(vendors < rows, "виробника показано навіть для ротаційних адрес — це вигадка");

      // No distance, anywhere. Bands and dBm only.
      const body = await h.text("[data-live]");
      h.expect(/dBm/.test(body), "немає вимірювання в dBm");
      h.expect(!/метр|metre|meter/i.test(body), `список заявив відстань: ${body.slice(0, 160)}`);
    },
  },
  {
    name: "list: the order is systemic, persisted, and does not reshuffle", run: async (h) => {
      await h.click('[data-tab="list"]'); await h.wait(400);
      // The rendered text carries the order, so no new helper is needed to see a reshuffle.
      const before = await h.text("[data-live]");
      await h.wait(900);
      const after = await h.text("[data-live]");
      h.expect(before === after, "список пересортувався сам, без жодної зміни в даних");
      // Order and radio filtering are the runtime's, not a hand-rolled control: spec.filters renders the
      // header button and the sheet, and the sheet is history-backed like every other screen.
      h.expect((await h.count("#filter-btn")) === 1, "спека не дала системної кнопки фільтра");
      await h.click("#filter-btn"); await h.wait(300);
      h.expect((await h.count("#sheet[open]")) === 1, "аркуш фільтрів не відкрився");
      const sheet = await h.text("#sheet");
      h.expect(/сигнал|появ|радіо|signal|seen|radio/i.test(sheet), `у фільтрах немає керування порядком: ${sheet.slice(0, 160)}`);
      await h.back(); await h.wait(300);
      h.expect((await h.count("#sheet[open]")) === 0, "Back не закрив аркуш фільтрів");
    },
  },
  {
    name: "hunt: a target earns a lobe, and the readout says how much was swept", run: async (h) => {
      await h.click('[data-tab="hunt"]'); await h.wait(400);
      h.expect((await h.count("[data-petal]")) === 0, "пелюстка з'явилась без обраної цілі");
      await h.click("[data-pick]"); await h.wait(300);
      h.expect((await h.count("#pick[open]")) === 1, "аркуш вибору цілі не відкрився");
      h.expect((await h.count("[data-pick-dev]")) >= 4, "у виборі цілі немає BLE-пристроїв");
      await h.click("[data-pick-dev]"); await h.wait(400);
      // A closed <dialog> stays in the DOM, so only the `open` attribute actually changes.
      h.expect((await h.count("#pick[open]")) === 0, "вибір цілі не закрив аркуш");
      h.expect((await h.count("[data-petal]")) === 1, "обмахування не намалювало пелюстку");
      h.expect((await h.count("[data-bearing]")) === 1, "пелюстка стягнулась, але азимут не показано");
    },
  },
  {
    name: "guard: it names what is missing instead of going quiet", run: async (h) => {
      await h.click('[data-tab="guard"]'); await h.wait(400);
      h.expect((await h.count("[data-watch]")) >= 4, "список нагляду порожній");
      h.expect(/\d/.test(await h.text("[data-policy]")), "політика без чисел");
      // Nothing has travelled under the gate, so the guard must stay quiet AND explain itself.
      h.expect((await h.count("[data-flag]")) === 0, "вартовий підняв тривогу без пройденого шляху");
      h.expect((await h.count("[data-sep]")) >= 1, "пристрій, що заявив про відділення, не позначено");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Hive|Hunt|Guard/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      // Case-insensitive: the dock uppercases in CSS and bodyText reads innerText, which applies
      // text-transform, so a cased regex never matches "СОТИ".
      h.expect(/Соти|Пошук|Вартовий/i.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="hive"]'); await h.wait(150);
    },
  },
  {
    name: "routing: the permissions screen opens and Back closes it", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click("#p-perms"); await h.wait(250);
      h.expect((await h.count('[role="dialog"]')) === 1, "екран дозволів не відкрився");
      await h.back(); await h.wait(300);
      h.expect((await h.count('[role="dialog"]')) === 0, "Back не закрив екран дозволів");
      await h.click('[data-tab="hive"]'); await h.wait(150);
    },
  },
];
