// Gate has no camera/audio/WebGL; the app seeds a played frame (Canvas2D aura fallback) so the still shows
// the instrument mid-play. Motion detection is the unit-tested /_rt/motion.js; scales are /_rt/chroma.js.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-stage]")) > 0) break; await h.wait(400); } };

export default [
  {
    name: "аура: сцена, аура, лади", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-stage]")) === 1, "немає сцени");
      h.expect((await h.count("[data-live]")) === 1, "немає живої аури");
      h.expect((await h.count("[data-scale]")) === 4, "немає 4 ладів-настроїв");
    },
  },
  {
    name: "перемикання ладу", run: async (h) => {
      await ready(h);
      await h.tap('[data-scale="minor"]'); await h.wait(150);
      h.expect((await h.attr('[data-scale="minor"]', "aria-pressed")) === "true", "лад не перемкнувся");
      await h.tap('[data-scale="penta"]'); await h.wait(120);
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Aura|Play|Language/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Аура|Гра|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="play"]'); await h.wait(120);
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
