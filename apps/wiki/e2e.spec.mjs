// searchFetch: debounce (350ms) then network. Poll on [data-fav] (real result cards), not .card.
const search = async (h, q) => {
  await h.type("#filter", q);
  for (let i = 0; i < 24; i++) { if ((await h.count("[data-fav]")) > 0) break; await h.wait(500); }
};

export default [
  {
    name: "старт: підказка пошуку, без карток", run: async (h) => {
      h.expect((await h.count(".card")) === 0, "не мало бути карток до запиту");
      h.expect(/Пошук у Вікіпедії/.test(await h.bodyText()), "немає підказки пошуку");
    },
  },
  {
    name: "кожна картка має мініатюру або плейсхолдер", run: async (h) => {
      await search(h, "Київ");
      const cards = await h.count(".card");
      h.expect(cards > 3, "пошук не повернув статей");
      // fallback letter-tile guarantees no image-less card, so imgs === cards (no flake on thumbnail-less pages)
      h.expect((await h.count(".card img")) === cards, "є картки без зображення (мініатюра/плейсхолдер)");
      h.expect(/Читати/.test(await h.bodyText()), "немає афордансу «Читати»");
    },
  },
  {
    name: "тап по картці → сторінка статті, Back закриває", run: async (h) => {
      await search(h, "Київ");
      await h.click(".aw-tap"); await h.wait(250);
      h.expect((await h.count('[role="dialog"]')) === 1, "деталі не відкрились");
      h.expect(/Про що стаття|Читати у Вікіпедії/.test(await h.bodyText()), "немає вмісту статті");
      h.expect(/wikipedia\.org/.test(await h.attr('[role="dialog"] a', "href")), "немає посилання");
      await h.back(); await h.wait(250);
      h.expect((await h.count('[role="dialog"]')) === 0, "Back не закрив деталі");
      h.expect((await h.count(".card")) > 0, "Back вийшов замість закрити деталі");
    },
  },
  {
    name: "збереження → тост + вкладка «Збережені»", run: async (h) => {
      await search(h, "Київ");
      await h.click("[data-fav]"); await h.wait(200);
      h.expect(/Збережено|Saved/.test(await h.text("[data-toast]")), "немає тосту");
      await h.click('[data-tab="saved"]'); await h.wait(200);
      h.expect((await h.count(".card")) >= 1, "у «Збережені» порожньо");
      await h.click('[data-tab="search"]'); await h.wait(150);
    },
  },
  {
    name: "фільтр мови: сегмент", run: async (h) => {
      await h.click("#filter-btn"); await h.wait(200);
      h.expect((await h.count("#f-lang")) === 1, "немає сегмента мови");
      h.expect(/EN/.test(await h.bodyText()) && /PL/.test(await h.bodyText()), "немає мовних опцій");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Search|Saved|Wikipedia/.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Пошук|Збережені/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="search"]'); await h.wait(120);
    },
  },
];
