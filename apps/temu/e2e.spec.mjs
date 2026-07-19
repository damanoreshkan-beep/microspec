// temu — real AliExpress products via the /feed/shop proxy; the headless gate seeds a deterministic
// fixture (from the search query) so it renders offline and still changes when the query does. dev mode
// defaults ON (curated). Cart/starred/dev persist in localStorage; tests tolerate that. No emoji.
export default [
  {
    name: "store renders: 9 categories, dev mode ON, product grid", run: async (h) => {
      h.expect((await h.count("[data-cat]")) === 9, "має бути 9 категорій");
      h.expect((await h.count("[data-grid] [data-card]")) >= 4, "порожня сітка товарів");
      const dev = await h.text("[data-dev]");
      h.expect(/dev mode/.test(dev) && /on/i.test(dev), "dev mode не увімкнено за замовчуванням");
    },
  },
  {
    name: "dev mode toggles the catalog (curated ↔ mainstream)", run: async (h) => {
      const curated = await h.text("[data-grid]");
      await h.click("[data-dev]"); await h.wait(180);
      const mainstream = await h.text("[data-grid]");
      h.expect(mainstream !== curated, "перемикання dev mode не змінило каталог");
      const dev = await h.text("[data-dev]");
      h.expect(/dev mode/.test(dev) && /off/i.test(dev), "dev mode не вимкнувся");
      await h.click("[data-dev]"); await h.wait(150); // back to curated (ON)
    },
  },
  {
    name: "category switch changes the grid", run: async (h) => {
      const before = await h.text("[data-grid]");
      await h.click('[data-cat="rigs"]'); await h.wait(150);
      h.expect((await h.text("[data-grid]")) !== before, "зміна категорії не оновила сітку");
      await h.click('[data-cat="apparel"]'); await h.wait(120);
    },
  },
  {
    name: "add to cart → staging area (історія-backed, Back закриває)", run: async (h) => {
      await h.click("[data-add]"); await h.wait(150);
      h.expect((await h.count("[data-cart-open] span")) >= 1, "лічильник кошика не зʼявився");
      await h.click("[data-cart-open]"); await h.wait(200);
      h.expect((await h.prop("#cartsheet", "open")) === true, "стейджинг не відкрився");
      h.expect(/commit & push/i.test(await h.bodyText()), "немає кнопки commit & push");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#cartsheet", "open")) !== true, "Back не закрив стейджинг");
    },
  },
  {
    name: "product detail (історія-backed, Back закриває)", run: async (h) => {
      await h.click("[data-card]"); await h.wait(200);
      h.expect((await h.prop("#detailsheet", "open")) === true, "деталі товару не відкрились");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#detailsheet", "open")) !== true, "Back не закрив деталі");
    },
  },
  {
    name: "star → starred sheet", run: async (h) => {
      await h.click("[data-star]"); await h.wait(150);
      await h.click("[data-starred-open]"); await h.wait(200);
      h.expect((await h.prop("#starsheet", "open")) === true, "аркуш зіркованих не відкрився");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#starsheet", "open")) !== true, "Back не закрив зірковані");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Store|Apparel|staging/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Крамниця|Одяг|Ноутбуки/i.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="shop"]'); await h.wait(120);
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
