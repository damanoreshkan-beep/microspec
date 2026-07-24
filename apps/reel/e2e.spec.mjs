// reel — the headless gate seeds a 3-clip public-domain mock (never the network), so the reel always renders
// populated. We assert: the full-screen slide feed, the mute toggle, and the sources tab (ready channels +
// the history-backed add-URL sheet, Back closes it). We never assert a stream PLAYS — headless has no video.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-reel]")) > 0) break; await h.wait(300); } };
// the black-poster filter is async (loads the poster into a canvas) → poll until the feed settles
const settles = async (h, n) => { for (let i = 0; i < 25; i++) { if ((await h.count("[data-reel]")) === n) return true; await h.wait(200); } return false; };

export default [
  {
    name: "стрічка рендериться; биті чорні/пласкі постери й дублікати відфільтровано", run: async (h) => {
      await ready(h);
      // mock seeds 6: 3 good + a duplicate (dedupe drops) + a black-poster clip (black filter drops) +
      // a flat-grey placeholder poster (flat filter drops) → 3 clean
      h.expect(await settles(h, 3), "фільтри не звели стрічку до 3 чистих слайдів (дубль/чорний/плаский постер лишились)");
      h.expect((await h.count("video")) === 1, "активний слайд не має одного відео-елемента");
      h.expect(!/Broken clip/.test(await h.bodyText()), "битий чорний постер не відфільтрувався");
      h.expect(!/Flat placeholder/.test(await h.bodyText()), "плаский постер-заглушка не відфільтрувався");
      h.expect(!/\bdup\b/.test(await h.bodyText()), "дублікат не відфільтрувався");
    },
  },
  {
    name: "hero: дубльованої кнопки джерел нема (лишився лише таб)", run: async (h) => {
      await ready(h);
      h.expect((await h.count("#source")) === 0, "плаваюча кнопка-дубль #source не прибрана з hero");
      h.expect((await h.count('[data-tab="sources"]')) === 1, "таб «Джерела» відсутній у доку");
    },
  },
  {
    name: "джерела: готові канали + додати-URL (Back закриває)", run: async (h) => {
      await ready(h);
      await h.tap('[data-tab="sources"]'); await h.wait(300);           // reel → sources tab (dock)
      h.expect((await h.count("[data-src-row]")) >= 3, "немає готових каналів");
      await h.tap("#add-url"); await h.wait(300);
      h.expect((await h.count("#src-input")) === 1, "шит додавання URL не відкрився");
      await h.back(); await h.wait(300);
      h.expect((await h.count("#src-input")) === 0, "Back не закрив шит");
    },
  },
  {
    name: "«відкрити сайт» відкриває зовнішній браузер — жодного iframe-оверлея в апці", run: async (h) => {
      await ready(h);
      await h.tap('[data-tab="sources"]'); await h.wait(300);
      h.expect((await h.count("[data-open-site]")) >= 1, "кнопки «відкрити сайт» немає");
      await h.tap("[data-open-site]"); await h.wait(400);               // opens the external browser (window.open)
      h.expect((await h.count("[data-frame]")) === 0, "iframe-оверлей більше не має існувати в апці");
    },
  },
  {
    name: "додати-URL: поле пошуку з'являється лише коли в URL є квері-параметри", run: async (h) => {
      await ready(h);
      await h.tap('[data-tab="sources"]'); await h.wait(300);
      await h.tap("#add-url"); await h.wait(300);
      h.expect((await h.count("#sheet-search")) === 0, "поле пошуку показалось для порожнього URL");
      await h.type("#src-input", "site.com/search?q=cats"); await h.wait(200);   // resolver finds ?q= → searchable
      h.expect((await h.count("#sheet-search")) === 1, "поле пошуку не з'явилось для URL з квері-параметром");
      await h.back(); await h.wait(300);
    },
  },
  {
    name: "таб «Лайки» є в доку і порожній за замовчуванням", run: async (h) => {
      await ready(h);
      h.expect((await h.count('[data-tab="liked"]')) === 1, "таб «Лайки» відсутній у доку");
      await h.tap('[data-tab="liked"]'); await h.wait(300);
      h.expect((await h.count("[data-liked-tile]")) === 0, "на старті лайків не має бути");
    },
  },
];
