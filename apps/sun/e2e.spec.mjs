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
