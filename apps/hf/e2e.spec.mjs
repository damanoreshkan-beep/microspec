// HF catalog — live data via the CORS proxy. Poll on [data-fav] (real model cards); the loading Skeleton
// also renders .card divs, so never gate on .card alone.
const load = async (h) => { for (let i = 0; i < 24; i++) { if ((await h.count("[data-fav]")) > 0) break; await h.wait(500); } };

export default [
  {
    name: "каталог нейронок вантажиться з бейджами", run: async (h) => {
      await load(h);
      h.expect((await h.count(".card")) > 3, "немає карток моделей");
      h.expect((await h.count('iconify-icon[icon="lucide:download"]')) >= 3, "немає бейджів завантажень");
    },
  },
  {
    name: "картка → деталі з описом і посиланням на HF, Back закриває", run: async (h) => {
      await load(h);
      await h.click(".aw-tap"); await h.wait(250);
      h.expect((await h.count("#detail-back")) === 1, "деталі не відкрились");
      const t = await h.bodyText();
      h.expect(/Опис|Задача|Бібліотека/.test(t), "немає полів деталей");
      h.expect((await h.count('a[href^="https://huggingface.co/"]')) >= 1, "немає посилання на Hugging Face");
      await h.back(); await h.wait(200);
      h.expect((await h.count("#detail-back")) === 0, "Back не закрив деталі");
    },
  },
  {
    name: "пошук звужує до 0 і відновлює", run: async (h) => {
      await load(h);
      const base = await h.count(".card");
      await h.type("#filter", "zzzz-нема-такого"); await h.wait(250);
      h.expect((await h.count(".card")) < base, "пошук не звузив");
      await h.type("#filter", ""); await h.wait(250);
      h.expect((await h.count(".card")) >= base, "пошук не відновив список");
    },
  },
  {
    name: "фільтр сортування перемикається й перезавантажує", run: async (h) => {
      await load(h);
      await h.click("#filter-btn"); await h.wait(150);
      await h.click('#f-sort [data-val="downloads"]'); await h.wait(120);
      await h.click("#f-apply"); await h.wait(400);
      await load(h);
      h.expect((await h.count(".card")) > 3, "після зміни сортування немає карток");
    },
  },
  {
    name: "категорія: локалізовані інлайн-опції + фільтр не ламає каталог", run: async (h) => {
      await load(h);
      // inline select options localize via T — textContent holds every option regardless of visibility
      const opts = await h.prop("#f-category", "textContent");
      h.expect(/Генерація зображень/.test(opts) && /Розпізнавання мови/.test(opts), "інлайн-опції категорії не локалізовані");
      await h.click("#filter-btn"); await h.wait(150);
      await h.select("#f-category", "text-to-image"); await h.wait(120);   // select value = pipeline_tag
      await h.click("#f-apply"); await h.wait(500);
      await load(h);
      h.expect((await h.count(".card")) > 2, "після вибору категорії немає карток");
    },
  },
  {
    name: "збереження: закладка додає в Збережені", run: async (h) => {
      await load(h);
      await h.click("[data-fav]"); await h.wait(150);   // the star button carries data-fav (z-[2], above the drill-down overlay)
      await h.click('[data-tab="saved"]'); await h.wait(200);
      h.expect((await h.count("[data-fav]")) >= 1, "збережена модель не зʼявилась");
      await h.click('[data-tab="catalog"]'); await h.wait(150);
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Catalog|Language|Popular/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Каталог|Мова|Популярні/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="catalog"]'); await h.wait(120);
    },
  },
  {
    name: "PWA: профіль → модалка встановлення, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click("#p-install"); await h.wait(150);
      h.expect((await h.prop("#install", "open")) === true, "модалка не відкрилась");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив");
    },
  },
];
