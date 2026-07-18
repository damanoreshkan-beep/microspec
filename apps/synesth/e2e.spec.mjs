// The gate has no camera and no audio gesture, so the view seeds a palette (real chroma maths) and shows
// the note-orbs; sound only starts on a tap. Everything below asserts the visual/interaction, not the audio.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-orb]")) > 0) break; await h.wait(400); } };

export default [
  {
    name: "сцена: орби з нотами + лади + play", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-live]")) === 1, "немає сцени");
      h.expect((await h.count("[data-orb]")) === 5, "немає 5 нот-орбів");
      h.expect((await h.count("[data-scale]")) === 3, "немає 3 ладів");
      h.expect((await h.count("[data-play]")) === 1, "немає play");
    },
  },
  {
    name: "play → pause стан", run: async (h) => {
      await ready(h);
      await h.tap("[data-play]"); await h.wait(200);
      h.expect((await h.count("[data-play].btn-secondary")) === 1, "play не запустився");
      await h.tap("[data-play]"); await h.wait(200);
      h.expect((await h.count("[data-play].btn-primary")) === 1, "pause не зупинив");
    },
  },
  {
    name: "зміна ладу", run: async (h) => {
      await ready(h);
      await h.tap('[data-scale="minor"]'); await h.wait(150);
      h.expect((await h.count('[data-scale="minor"].btn-primary')) === 1, "лад не перемкнувся");
      await h.tap('[data-scale="penta"]'); await h.wait(120);
    },
  },
  {
    name: "дозволи: профіль → екран, Back закриває (історія-backed)", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click("#p-perms"); await h.wait(200);
      h.expect((await h.count("#perms-back")) > 0, "екран дозволів не відкрився");
      await h.back(); await h.wait(200);
      h.expect((await h.count("#perms-back")) === 0, "Back не закрив дозволи");
      await h.click('[data-tab="live"]'); await h.wait(120);
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Live|Language|Synesthesia|Calm/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Наживо|Мова|Синестезія|Спокій/i.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="live"]'); await h.wait(120);
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
