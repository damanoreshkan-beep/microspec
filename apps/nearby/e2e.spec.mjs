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
    // The drill-down contract: a tap opens the in-app detail; the outbound link lives INSIDE it. This test
    // used to assert the opposite — that .card was an <a href> — so the gate was guarding the anti-pattern.
    name: "картка → деталі → кнопка відкрити на карті", run: async (h) => {
      await load(h);
      h.expect((await h.count(".card[href]")) === 0, "картка — зовнішнє посилання; тап має вести в деталі");
      await h.click(".aw-tap"); await h.wait(350);
      h.expect((await h.count("#detail-back")) === 1, "деталі не відкрились");
      h.expect(/google\.com\/maps|maps/.test(await h.attr("a.btn-primary", "href")), "у деталях немає кнопки відкрити джерело");
      await h.back(); await h.wait(250);
      h.expect((await h.count("#detail-back")) === 0, "Back не закрив деталі");
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
    name: "екран дозволів відкривається, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      h.expect((await h.count("#p-perms")) === 1, "немає пункту «Дозволи»");
      await h.click("#p-perms"); await h.wait(300);
      h.expect((await h.count('[role="dialog"]')) === 1, "екран дозволів не відкрився");
      h.expect(/Геолокація|Location|Дозволи|Permissions/.test(await h.bodyText()), "немає вмісту дозволів");
      await h.back(); await h.wait(250);
      h.expect((await h.count('[role="dialog"]')) === 0, "Back не закрив екран дозволів");
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
