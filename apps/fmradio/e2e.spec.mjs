// FM radio for a HackRF over WebUSB. Headless has no device, so the view runs in demo mode (gate): it seeds a
// tuned station (RDS name/genre/radiotext + stereo) and a scan list. These cases exercise that head-unit — the
// now-playing card, seek + station list, the transport, the settings sheet (history-backed, Back closes), i18n
// and the PWA modal.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-card]")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "head unit: readout, станція (RDS), жанр, стерео, сигнал, транспорт", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-nowplaying][data-live]")) === 1, "немає живого now-playing");
      h.expect((await h.count("[data-stereo]")) === 1, "немає індикатора стерео");
      h.expect((await h.count("[data-signal]")) === 1, "немає індикатора сигналу");
      h.expect((await h.count("[data-band]")) === 1, "немає band-слайдера");
      h.expect((await h.count("#play")) === 1, "немає транспорту");
      const body = await h.bodyText();
      h.expect(/HIT FM/.test(body), "немає назви станції (RDS PS)");
      h.expect(/pop music/i.test(body), "немає жанру (PTY)");
      h.expect(/mhz|мгц/i.test(body), "немає одиниць частоти");
    },
  },
  {
    name: "список станцій: тап налаштовує частоту", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-station]")) >= 4, "немає списку знайдених станцій");
      await h.tap('[data-station="96.0"]'); await h.wait(200);
      h.expect(/96\.0/.test(await h.bodyText()), "тап по станції не змінив частоту");
      h.expect((await h.attr('[data-station="96.0"]', "aria-current")) === "true", "станція не позначилась активною");
    },
  },
  {
    name: "seek змінює частоту", run: async (h) => {
      await ready(h);
      const before = await h.bodyText();
      await h.tap('[data-seek="up"]'); await h.wait(150);
      h.expect((await h.bodyText()) !== before, "seek не змінив частоту");
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
      await h.tap('[data-tc="50"]'); await h.wait(120);
      await h.back(); await h.wait(150);
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      await h.click('[data-tab="tune"]'); await h.wait(200);
      h.expect(/Signal|Stereo/i.test(await h.bodyText()), "не EN");
      await h.click('[data-tab="me"]'); await h.wait(120);
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Сигнал|Стерео|Мова/.test(await h.bodyText()), "не UA");
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
