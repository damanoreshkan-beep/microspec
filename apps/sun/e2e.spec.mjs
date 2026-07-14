// Headless has no GPS/compass → the view falls back to Kyiv after ~4s and renders the full compass
// (SunCalc is pure math). So the gate reviews the real compass. The live heading/permission path is
// covered on-device via ?mock.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-sun]")) > 0) break; await h.wait(500); } };

export default [
  {
    name: "компас сонця рендериться (fallback Київ)", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-sun]")) === 1, "немає позначки сонця");
      h.expect(/°/.test(await h.bodyText()), "немає азимута");
      h.expect((await h.count("#scrub")) === 1, "немає скрабера часу");
      h.expect(/схід|захід|золота|rise|set/i.test(await h.bodyText()), "немає золотої години / сходу-заходу");
    },
  },
  {
    name: "скрабер часу змінює позицію сонця", run: async (h) => {
      await ready(h);
      await h.type("#scrub", "120"); await h.wait(200);
      const a = await h.text("[data-bearing]");
      await h.type("#scrub", "780"); await h.wait(200);
      const b = await h.text("[data-bearing]");
      h.expect(a !== b, "скрабер не змінює азимут сонця");
    },
  },
  {
    name: "вибір локації на глобусі → перерахунок сонця", run: async (h) => {
      await ready(h);
      const kyiv = await h.text("[data-bearing]");
      await h.click("#open-globe"); await h.wait(300);
      h.expect((await h.count('[role="dialog"]')) === 1, "пікер не відкрився");
      h.expect((await h.count('[data-city="Tokyo"]')) === 1, "немає пресетів міст");
      await h.click('[data-city="Tokyo"]'); await h.wait(300);
      h.expect(/Tokyo/.test(await h.bodyText()), "Токіо не обрано");
      await h.click("#pick-here"); await h.wait(300);
      h.expect((await h.count('[role="dialog"]')) === 0, "пікер не закрився");
      h.expect((await h.count("#clear-pick")) === 1 && /Tokyo/.test(await h.text("#clear-pick")), "немає індикатора обраної точки");
      h.expect(kyiv !== (await h.text("[data-bearing]")), "азимут сонця не перерахувався для іншої точки");
      await h.click("#clear-pick"); await h.wait(200); // назад до GPS/Києва
    },
  },
  {
    name: "системний multi-фільтр планет", run: async (h) => {
      await ready(h);
      h.expect((await h.count("#filter-btn")) === 1, "немає кнопки фільтра");
      await h.click("#filter-btn"); await h.wait(200);
      h.expect((await h.count("#f-bodies [data-val]")) === 8, "немає 8 планет у фільтрі");
      await h.click('#f-bodies [data-val="mars"]'); await h.wait(150);
      h.expect((await h.attr('#f-bodies [data-val="mars"]', "aria-pressed")) === "false", "Марс не вимкнувся");
      await h.click("#f-apply"); await h.wait(200);
      h.expect(/\/8/.test(await h.bodyText()), "немає чипа активного фільтра планет");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Compass|Sun|Language/.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Компас|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="compass"]'); await h.wait(120);
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
