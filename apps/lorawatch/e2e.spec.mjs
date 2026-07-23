// LoRa band watcher + decoder for a HackRF over WebUSB. Headless has no device, so the view runs in demo mode
// (gate): it seeds connected + a band waterfall + an activity indicator + a few decoded packets. Real RX/decode
// needs the device; these cases exercise the UI surface: preset selector, waterfall canvas, activity panel,
// decoded-packet list (hex/ASCII + CRC), i18n, and the PWA modal.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-waterfall]")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "lorawatch: пресети, водоспад, активність", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-preset]")) >= 3, "немає пресетів");
      h.expect((await h.count("[data-waterfall]")) === 1, "немає водоспаду");
      h.expect((await h.count("[data-activity]")) === 1, "немає панелі активності");
    },
  },
  {
    name: "перемикання пресету", run: async (h) => {
      await ready(h);
      const btns = await h.count("[data-preset]");
      h.expect(btns >= 3, "мало пресетів");
      await h.tap('[data-preset]:nth-of-type(2)'); await h.wait(200);
    },
  },
  {
    name: "декодовані пакети: hex/ASCII + CRC", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-packets]")) === 1, "немає списку пакетів");
      h.expect((await h.count("[data-packet]")) >= 3, "немає декодованих пакетів");
      h.expect(/CRC/i.test(await h.bodyText()), "немає CRC-статусу");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      await h.click('[data-tab="watch"]'); await h.wait(200);
      h.expect(/Decoded|Listening|Detected/i.test(await h.bodyText()), "не EN");
      await h.click('[data-tab="me"]'); await h.wait(120);
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Декодовані|Слухаю|виявлено|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="watch"]'); await h.wait(120);
    },
  },
  {
    name: "PWA: профіль → модалка, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click("#p-install"); await h.wait(150);
      h.expect((await h.prop("#install", "open")) === true, "модалка не відкрилась");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив");
    },
  },
];
