// Gate has no camera; enabled=useState(gate)=true, so the console renders with a seeded viewfinder gradient
// (no getUserMedia under gate). getUserMedia is called directly (torch/zoom need the raw track), so this is
// not a sensors.js reading app. Filters/aspect/mirror are pure CSS + a canvas capture; no unit math here.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-screen]")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "камера: екран, затвор, 8 фільтрів", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-screen]")) === 1, "немає видошукача");
      h.expect((await h.count("[data-shutter]")) === 1, "немає затвора");
      h.expect((await h.count("[data-fx]")) === 8, "немає 8 фільтрів");
    },
  },
  {
    name: "вибір фільтра", run: async (h) => {
      await ready(h);
      await h.tap('[data-fx="3"]'); await h.wait(150);
      h.expect((await h.attr('[data-fx="3"]', "aria-pressed")) === "true", "фільтр не обрався");
      await h.tap('[data-fx="0"]'); await h.wait(120);
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Camera|Shoot|Language/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Камера|Кадр|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="shoot"]'); await h.wait(120);
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
