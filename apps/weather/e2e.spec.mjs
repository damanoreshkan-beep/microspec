// Dashboard app: no fav/cards to poll — wait for the hero temperature to appear.
const load = async (h) => { await h.waitFor(/\d+°/, 14000); };

export default [
  {
    name: "герой показує температуру", run: async (h) => {
      await load(h);
      h.expect(/\d+°/.test(await h.bodyText()), "немає температури");
      h.expect(/Київ|Kyiv/.test(await h.bodyText()), "немає локації"); // place is now localised (was hard-coded "Kyiv")
    },
  },
  {
    name: "метрики: відчувається / вологість / вітер", run: async (h) => {
      await load(h);
      const t = await h.bodyText();
      // badges render uppercase (CSS text-transform → innerText is uppercased), so match case-insensitively
      h.expect(/відчувається|feels/i.test(t), "немає «відчувається»");
      h.expect(/вологість|humidity/i.test(t), "немає вологості");
      h.expect(/вітер|wind/i.test(t), "немає вітру");
    },
  },
  {
    name: "погодинна стрічка + тижневий прогноз", run: async (h) => {
      await load(h);
      const t = await h.bodyText();
      h.expect(/\d\d:\d\d/.test(t), "немає погодинних часів");
      h.expect(/Погодинно|Hourly/.test(t), "немає підпису стрічки");
      h.expect(/На тиждень|This week/.test(t), "немає прогнозу на тиждень");
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
