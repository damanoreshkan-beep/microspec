// Open apps — no view.js, so these assertions are about the `gallery` layout contract, the OS-topic filter
// and the GitHub source. Unlike the old Chocolatey catalogue this source needs NO proxy: GitHub's Search API
// sends `access-control-allow-origin: *`, so the fetch is direct.
const ready = async (h) => { await h.waitFor(/\S{6}/, 20000); await h.wait(600); };

export default [
  {
    name: "Каталог: репозиторії приходять з GitHub", run: async (h) => {
      await ready(h);
      h.expect((await h.count(".aw-tap")) > 4, "каталог порожній — GitHub Search мовчить");
      // The gallery is art-forward by contract: the owner avatar is the app's mark and must be present.
      h.expect((await h.count("main img")) > 3, "немає аватарів — сітка каталогу без арту безсенсова");
    },
  },
  {
    // What separates `gallery` from the launcher `grid`: the line that tells two similar repos apart (owner)
    // and a number that decides (stars).
    name: "gallery несе власника й зірки, не лише плитку", run: async (h) => {
      await ready(h);
      const txt = await h.text("main");
      h.expect(/[a-z]/i.test(txt), "картки без тексту");
      h.expect(/\d/.test(txt), "немає лічильника зірок у картках");
    },
  },
  {
    name: "картка відкриває деталі з посиланням на GitHub", run: async (h) => {
      await ready(h);
      await h.click(".aw-tap"); await h.wait(500);
      h.expect((await h.count("#detail-back")) === 1, "клік по плитці не відкрив деталі");
      h.expect((await h.count("a[href*='github.com']")) > 0, "у деталях немає посилання на репозиторій");
      await h.back(); await h.wait(400);
      h.expect((await h.count("#detail-back")) === 0, "Back не закрив деталі");
    },
  },
  {
    // The OS filter is the whole point of the redesign: choosing a platform must re-query GitHub, not sieve.
    name: "фільтр платформи перезапитує GitHub", run: async (h) => {
      await ready(h);
      const before = await h.text("main");
      await h.click("#filter-btn"); await h.wait(300);
      await h.select("#f-os", "android"); await h.wait(300);
      await h.click("#f-apply"); await h.wait(3000);
      const after = await h.text("main");
      h.expect(before !== after, "перемикання платформи не змінило видачу — фільтр не перезапитав");
    },
  },
  {
    // searchFetch: thousands of repos, so search must reach the server, not sieve 24 rows.
    name: "пошук іде на сервер, а не просіює екран", run: async (h) => {
      await ready(h);
      await h.type('input[type="search"]', "chatgpt"); await h.wait(3500);
      const txt = await h.text("main");
      h.expect(/chatgpt|gpt/i.test(txt), `пошук "chatgpt" нічого не знайшов: "${txt.slice(0, 120)}"`);
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(200);
      await h.click('[data-loc="en"]'); await h.wait(300);
      h.expect(/Apps|Language|Platform/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(300);
      h.expect(/Застосунк|Мова|Платформа/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="apps"]'); await h.wait(200);
    },
  },
  {
    name: "PWA: профіль → модалка, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(200);
      await h.click("#p-install"); await h.wait(200);
      h.expect((await h.prop("#install", "open")) === true, "модалка не відкрилась");
      await h.back(); await h.wait(250);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив");
    },
  },
];
