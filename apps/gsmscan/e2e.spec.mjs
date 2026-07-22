// GSM band scanner for a HackRF over WebUSB. Headless has no device, so the view runs in demo mode (gate): it
// seeds a band spectrum + a list of active carriers (ARFCNs). These cases exercise the band selector, the
// spectrum, the carrier list, the control island (settings sheet, history-backed Back), i18n and the PWA modal.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-carriers]")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "сканер: спектр, band-селектор, список несучих", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-spectrum]")) === 1, "немає спектра діапазону");
      h.expect((await h.count("[data-band]")) === 2, "немає двох бендів");
      h.expect((await h.count("[data-arfcn]")) >= 4, "немає списку активних несучих");
      h.expect((await h.count("[data-carriers][data-live]")) === 1, "список несучих не живий");
      h.expect(/ARFCN|BCCH|dBm/i.test(await h.bodyText()), "немає підписів несучих");
    },
  },
  {
    name: "перемикання банду", run: async (h) => {
      await ready(h);
      await h.tap('[data-band="dcs1800"]'); await h.wait(200);
      h.expect((await h.attr('[data-band="dcs1800"]', "aria-pressed")) === "true", "DCS 1800 не обрався");
      h.expect(/1805|1880/.test(await h.bodyText()), "спектр не показав DCS-діапазон");
      await h.tap('[data-band="gsm900"]'); await h.wait(150);
    },
  },
  {
    name: "налаштування: sheet із gains, Back закриває", run: async (h) => {
      await ready(h);
      await h.tap("[data-settings]"); await h.wait(200);
      h.expect((await h.prop("#rfsheet", "open")) === true, "sheet не відкрився");
      h.expect((await h.count('#rfsheet input[type=range]')) >= 2, "немає повзунків підсилення");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#rfsheet", "open")) !== true, "Back не закрив sheet");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      await h.click('[data-tab="scan"]'); await h.wait(200);
      h.expect(/Active carriers|Signal|Sweeping/i.test(await h.bodyText()), "не EN");
      await h.click('[data-tab="me"]'); await h.wait(120);
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Активні|Сигнал|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="scan"]'); await h.wait(120);
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
