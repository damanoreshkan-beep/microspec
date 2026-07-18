// The gate has no camera, so the view seeds a reading from a synthetic frame (real colour.js maths):
// a picked HEX + a 5-swatch palette render populated and deterministically.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-live]")) > 0) break; await h.wait(400); } };

export default [
  {
    name: "readout: hex + палітра + приціл", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-live]")) === 1, "немає readout");
      h.expect(/#[0-9A-F]{6}/.test(await h.text("[data-live]")), "hex не показано");
      h.expect((await h.count("[data-swatch]")) === 5, "немає палітри з 5 кольорів");
      h.expect((await h.count("[data-freeze]")) === 1, "немає кнопки freeze");
    },
  },
  {
    name: "freeze активує стан", run: async (h) => {
      await ready(h);
      await h.tap("[data-freeze]"); await h.wait(150);
      h.expect((await h.count("[data-freeze].btn-primary")) === 1, "freeze не активувався");
    },
  },
  {
    name: "дозволи: профіль → екран, Back закриває (історія-backed)", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click("#p-perms"); await h.wait(200);
      h.expect((await h.count("#perms-back")) > 0, "екран дозволів не відкрився");
      await h.back(); await h.wait(200);
      h.expect((await h.count("#perms-back")) === 0, "Back не закрив дозволи");
      await h.click('[data-tab="pick"]'); await h.wait(120);
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Pick|Language|Eyedropper/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Колір|Мова|Піпетка/i.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="pick"]'); await h.wait(120);
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
