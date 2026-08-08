// Interactive globe (canvas + d3-geo, runtime component). The world topology loads from /_rt/, then the
// canvas renders; search flies to a country and shows its facts.
const seed = async (h) => { for (let i = 0; i < 26; i++) { if ((await h.count("canvas")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "глобус рендериться (canvas)", run: async (h) => {
      await seed(h);
      h.expect((await h.count("canvas")) === 1, "немає глобуса");
      h.expect(/globe|глобус|крути|spin/i.test(await h.bodyText()), "немає підказки/чрому");
    },
  },
  {
    name: "пошук країни → факти (столиця, населення)", run: async (h) => {
      await seed(h);
      await h.type("#country-search", "Ukraine"); await h.wait(300);
      h.expect((await h.count('#matches [data-id="804"]')) === 1, "немає збігу Ukraine");
      await h.click('#matches [data-id="804"]'); await h.wait(400);
      const t = await h.bodyText();
      h.expect(/Ukraine/.test(t), "немає назви країни");
      h.expect(/Kyiv/.test(t), "немає столиці");
      h.expect(/Столиця|Capital/i.test(t) && /Населення|Population/i.test(t), "немає полів фактів"); // labels uppercased by CSS
    },
  },
  {
    name: "i18n EN/UA міняє chrome", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Earth|Language|Me/.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Земля|Мова|Я/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="earth"]'); await h.wait(150);
    },
  },
  {
    name: "PWA: профіль → модалка встановлення, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      h.expect((await h.count("#p-install")) === 1, "немає кнопки встановлення");
      await h.click("#p-install"); await h.wait(150);
      h.expect((await h.prop("#install", "open")) === true, "модалка не відкрилась");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив модалку");
    },
  },

  // ── ISS + Quakes layers (were apps/iss and apps/quakes, merged in as tabs) ─────────────────────────
  // Their own e2e files went with the folders. These keep the coverage: each layer mounts, and each one
  // renders its own readout rather than an empty globe.
  {
    name: "шар МКС: глобус + телеметрія", run: async (h) => {
      await h.click('[data-tab="track"]'); await h.wait(600);
      h.expect((await h.count("canvas")) >= 1, "немає глобуса у вкладці МКС");
      const txt = await h.bodyText();
      h.expect(/км|km|\d/.test(txt), "немає читання позиції/висоти МКС");
    },
  },
  {
    name: "шар землетрусів: глобус + список подій", run: async (h) => {
      await h.click('[data-tab="map"]'); await h.wait(600);
      h.expect((await h.count("canvas")) >= 1, "немає глобуса у вкладці землетрусів");
      h.expect(/\d/.test(await h.bodyText()), "немає читання магнітуди/подій");
    },
  },
];
