// FM radio for a HackRF over WebUSB. Headless has no device, so the view runs in demo mode (gate): it seeds a
// deterministic spectrum + a connected, populated screen. These cases exercise that live UI — the tuner, the
// spectrum/waterfall, the transport, the settings sheet (history-backed, Back closes), i18n and the PWA modal.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-readout]")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "живий приймач: readout, спектр, waterfall, тюнер, транспорт", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-readout][data-live]")) === 1, "немає живого readout частоти");
      h.expect((await h.count("[data-spectrum]")) === 1, "немає спектра");
      h.expect((await h.count("[data-waterfall]")) === 1, "немає waterfall");
      h.expect((await h.count("[data-band]")) === 1, "немає band-слайдера");
      h.expect((await h.count("#play")) === 1, "немає транспорту");
      h.expect((await h.count("[data-signal]")) === 1, "немає індикатора сигналу");
      h.expect(/mhz|мгц/i.test(await h.bodyText()), "немає одиниць частоти");
    },
  },
  {
    name: "тюнінг змінює частоту", run: async (h) => {
      await ready(h);
      const before = await h.bodyText();
      await h.tap('[data-tune="up"]'); await h.wait(150);
      await h.tap('[data-tune="up"]'); await h.wait(150);
      h.expect((await h.bodyText()) !== before, "readout не змінився після підстроювання");
    },
  },
  {
    name: "транспорт перемикається (mute/listen)", run: async (h) => {
      await ready(h);
      await h.tap("#play"); await h.wait(150);
      h.expect((await h.attr("#play", "data-playing")) === "true", "не почав слухати");
      await h.tap("#play"); await h.wait(150);
      h.expect((await h.attr("#play", "data-playing")) !== "true", "не стишився");
    },
  },
  {
    name: "налаштування: sheet із gains + деемфазисом, Back закриває", run: async (h) => {
      await ready(h);
      await h.tap("[data-settings]"); await h.wait(200);
      h.expect((await h.prop("#rfsheet", "open")) === true, "sheet не відкрився");
      h.expect((await h.count("[data-tc]")) === 2, "немає двох режимів деемфазису");
      await h.tap('[data-tc="75"]'); await h.wait(150);
      h.expect((await h.attr('[data-tc="75"]', "aria-pressed")) === "true", "75 мкс не обрався");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#rfsheet", "open")) !== true, "Back не закрив sheet");
    },
  },
  {
    name: "деемфазис переживає перезапуск", run: async (h) => {
      await ready(h);
      await h.tap("[data-settings]"); await h.wait(200);
      await h.tap('[data-tc="75"]'); await h.wait(150);
      await h.back(); await h.wait(200);
      await h.reload();
      await ready(h);
      await h.tap("[data-settings]"); await h.wait(200);
      h.expect((await h.attr('[data-tc="75"]', "aria-pressed")) === "true", "деемфазис не зберігся");
      await h.tap('[data-tc="50"]'); await h.wait(120);        // restore default for later shared-page cases
      await h.back(); await h.wait(150);
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      await h.click('[data-tab="tune"]'); await h.wait(200);
      h.expect(/Signal/i.test(await h.bodyText()), "не EN");
      await h.click('[data-tab="me"]'); await h.wait(120);
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Мова|Тема/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="tune"]'); await h.wait(120);
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
