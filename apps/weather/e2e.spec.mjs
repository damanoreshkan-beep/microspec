// Dashboard app: no fav/cards to poll — wait for the hero temperature to appear.
const load = async (h) => { await h.waitFor(/-?\d+°/, 14000); };

export default [
  {
    name: "герой показує температуру та місце", run: async (h) => {
      await load(h);
      h.expect(/-?\d+°/.test(await h.bodyText()), "немає температури");
      h.expect(/Київ|Kyiv/.test(await h.bodyText()), "немає локації");
      // The place line is the app's [data-live]: preflight demands a sensor app render one, and the gate
      // fixture seeds the GRANTED branch so this is the located screen, not "still locating".
      h.expect(await h.count("[data-live]") >= 1, "немає [data-live] — виміряно порожній екран очікування");
    },
  },
  {
    name: "метрики: відчуття / вітер / опади", run: async (h) => {
      await load(h);
      const t = await h.bodyText();
      // Labels render uppercase (CSS text-transform → innerText is uppercased), so match case-insensitively.
      h.expect(/відчуття|feels/i.test(t), "немає «відчуття»");
      h.expect(/вітер|wind/i.test(t), "немає вітру");
      h.expect(/опади|rain/i.test(t), "немає опадів");
      h.expect(/сніг|snow/i.test(t), "немає словесного опису погоди");   // fixture: WMO 73
    },
  },
  {
    name: "погодинна крива + тижневий прогноз зі смугами", run: async (h) => {
      await load(h);
      const t = await h.bodyText();
      h.expect(/\d\d:\d\d/.test(t), "немає погодинних часів");
      h.expect(/Погодинно|Hourly/.test(t), "немає підпису стрічки");
      h.expect(/На тиждень|This week/.test(t), "немає прогнозу на тиждень");
      // The curve is the strip's whole point — a row of numbers would pass every text assertion above.
      h.expect(await h.count("[data-curve] path") === 2, "немає кривої (лінія + площа)");
      h.expect(await h.count("[data-daybar]") === 5, "немає смуг діапазону на 5 днів");
    },
  },
  {
    name: "живе небо змонтоване", run: async (h) => {
      await load(h);
      await h.wait(400);                                    // hero.js is a dynamic import
      // Headless has no GPU, so this asserts the WIRING (spec.stage → the lazy import → the canvas), which
      // nothing else in the farm covers. The scene itself is judged offline via tools/art/hero.mjs.
      h.expect(await h.count("[data-stage]") === 1, "сцена не змонтувалась");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await load(h);
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Now|Weather|Language/.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Зараз|Погода|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="now"]'); await h.wait(120);
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
