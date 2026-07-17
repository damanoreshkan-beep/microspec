// Каталог програм — no view.js, so these assertions are really about the `gallery` layout contract and the
// proxy path. Two things here exist nowhere else in the farm: a source with no CORS (our proxy) and a source
// that speaks XML.
const ready = async (h) => { await h.waitFor(/\S{6}/, 20000); await h.wait(400); };

export default [
  {
    name: "Каталог: пакети приходять через наш проксі (XML)", run: async (h) => {
      await ready(h);
      h.expect((await h.count(".aw-tap")) > 4, "каталог порожній — проксі або парсер XML мовчить");
      // The gallery is art-forward by contract: an icon-less catalogue is the failure this layout exists to
      // avoid, and it is what killed winget.run as a source.
      h.expect((await h.count("main img")) > 3, "немає іконок — сітка каталогу без арту безсенсова");
    },
  },
  {
    // What separates `gallery` from the launcher `grid`: the line that tells two similar packages apart.
    name: "gallery несе видавця й версію, не лише плитку", run: async (h) => {
      await ready(h);
      const txt = await h.text("main");
      h.expect(/Google|Adobe|Chocolatey|Microsoft|Oracle|Python/i.test(txt), `немає видавця у картках: "${txt.slice(0, 120)}"`);
      h.expect(/\d+\.\d+/.test(txt), "немає версії у картках");
    },
  },
  {
    name: "картка відкриває деталі з командою встановлення", run: async (h) => {
      await ready(h);
      await h.click(".aw-tap"); await h.wait(400);
      h.expect((await h.count("#detail-back")) === 1, "клік по плитці не відкрив деталі");
      h.expect(/choco install/.test(await h.bodyText()), "у деталях немає команди встановлення — заради неї каталог і відкривають");
      await h.back(); await h.wait(300);
      h.expect((await h.count("#detail-back")) === 0, "Back не закрив деталі");
    },
  },
  {
    // searchFetch: the catalogue is thousands of packages, so this must reach the server, not sieve 24 rows.
    name: "пошук іде на сервер, а не просіює екран", run: async (h) => {
      await ready(h);
      await h.type('input[type="search"]', "vlc"); await h.wait(3000);
      const txt = await h.text("main");
      h.expect(/vlc/i.test(txt), `пошук "vlc" нічого не знайшов: "${txt.slice(0, 120)}"`);
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(200);
      await h.click('[data-loc="en"]'); await h.wait(300);
      h.expect(/Apps|Language|Windows/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(300);
      h.expect(/Програми|Мова|Каталог/.test(await h.bodyText()), "не UA");
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
