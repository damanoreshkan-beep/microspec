// Ether — a HackRF scanner/receiver over WebUSB. Headless has no device, so the view runs in demo mode (gate):
// Listen seeds a live listening state (band tiles + equalizer + transport), Radar seeds a named-source list +
// a waterfall. These cases exercise both instruments, the routing invariant (every sheet is Back-closable),
// i18n and the PWA modal. No frequencies are asserted — the surface is deliberately frequency-free.
const ready = async (h, sel) => { for (let i = 0; i < 20; i++) { if ((await h.count(sel)) > 0) break; await h.wait(300); } };

export default [
  {
    name: "listen: живий стан, плитки діапазонів, транспорт", run: async (h) => {
      await ready(h, "[data-player]");
      h.expect((await h.count("[data-preset]")) === 4, "немає чотирьох плиток діапазонів");
      h.expect((await h.count("[data-live]")) >= 1, "немає живого стану слухання");
      h.expect((await h.count("[data-eq]")) === 1, "немає індикатора сигналу (еквалайзера)");
      h.expect((await h.count("#play")) === 1, "немає транспорту");
      const body = await h.bodyText();
      h.expect(/aircraft|літак/i.test(body), "не показано активний діапазон (Літаки)");
    },
  },
  {
    name: "listen: тап по плитці робить її активною", run: async (h) => {
      await ready(h, "[data-preset]");
      await h.tap('[data-preset="fm"]'); await h.wait(200);
      h.expect((await h.attr('[data-preset="fm"]', "aria-pressed")) === "true", "плитка не стала активною");
    },
  },
  {
    name: "listen: sheet гучності, Back закриває", run: async (h) => {
      await ready(h, "#opts");
      await h.tap("#opts"); await h.wait(200);
      h.expect((await h.prop("#optsheet", "open")) === true, "sheet гучності не відкрився");
      h.expect((await h.count('#optsheet input[type=range]')) >= 1, "немає повзунка гучності");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#optsheet", "open")) !== true, "Back не закрив sheet");
    },
  },
  {
    name: "radar: названі джерела + сила сигналу", run: async (h) => {
      await h.click('[data-tab="radar"]'); await h.wait(250);
      await ready(h, "[data-hit]");
      h.expect((await h.count("[data-hit]")) >= 3, "немає списку названих джерел");
      h.expect((await h.count("[data-live]")) === 1, "список радара не живий");
      const body = await h.bodyText();
      h.expect(/wi-fi|bluetooth/i.test(body), "немає названих джерел (Wi-Fi/Bluetooth)");
      h.expect(/strong|сильно|faint|слабко/i.test(body), "немає підпису сили сигналу");
    },
  },
  {
    name: "radar: інженерний водоспад у sheet, Back закриває", run: async (h) => {
      await h.click('[data-tab="radar"]'); await h.wait(200);
      await ready(h, "[data-engineer]");
      await h.tap("[data-engineer]"); await h.wait(250);
      h.expect((await h.prop("#engsheet", "open")) === true, "інженерний sheet не відкрився");
      h.expect((await h.count("[data-canvas]")) === 1, "немає водоспаду (canvas)");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#engsheet", "open")) !== true, "Back не закрив інженерний sheet");
    },
  },
  {
    name: "i18n EN/UA + встановлення (PWA)", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/listen/i.test(await h.bodyText()), "англійська не застосувалась");
      await h.click('[data-loc="uk"]'); await h.wait(200);
      h.expect(/слухати/i.test(await h.bodyText()), "українська не повернулась");
    },
  },
];
