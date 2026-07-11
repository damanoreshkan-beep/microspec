// Headless has no GPS → data.js falls back to Kyiv and queries Overpass there, so the gate reviews a
// real, populated nearby list. (On-device it uses the user's location once granted.)
const load = async (h) => { for (let i = 0; i < 26; i++) { if ((await h.count("[data-fav]")) > 0) break; await h.wait(500); } };

export default [
  {
    name: "список поблизу з відстанями (fallback Київ)", run: async (h) => {
      await load(h);
      h.expect((await h.count(".card")) > 3, "немає точок поблизу");
      h.expect(/\d+\s?(м|км)/i.test(await h.bodyText()), "немає відстаней");
    },
  },
  {
    name: "картка веде на карту", run: async (h) => {
      await load(h);
      h.expect(/google\.com\/maps|maps/.test(await h.attr(".card", "href")), "поганий href");
    },
  },
  {
    name: "фільтр категорій (аптеки/банкомати/кава…)", run: async (h) => {
      await load(h);
      await h.click("#filter-btn"); await h.wait(200);
      h.expect((await h.count("#f-category")) === 1, "немає селекта категорії");
      h.expect(/Аптеки|Банкомати|Кав|АЗС/.test(await h.bodyText()), "немає категорій");
      await h.click("#f-apply"); await h.wait(150);
    },
  },
  {
    name: "пошук звужує і відновлює", run: async (h) => {
      await load(h);
      const base = await h.count(".card");
      await h.type("#filter", "zzz-нема"); await h.wait(250);
      h.expect((await h.count(".card")) === 0, "очікував 0");
      await h.type("#filter", ""); await h.wait(250);
      h.expect((await h.count(".card")) === base, "не відновилось");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Nearby|Saved|Language/.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Поруч|Збережені|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="list"]'); await h.wait(120);
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
