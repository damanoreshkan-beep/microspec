// Компас — headless has no magnetometer and no GPS, so the gate seeds Kyiv and heading 0 (see isGate).
// What IS assertable: that the rose renders, that the declination is computed and non-zero for Kyiv, and
// that the app never claims "true" north when it has no position to derive one from.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-rose]")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "роза вітрів + курс", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-rose]")) === 1, "немає рози вітрів");
      h.expect(/\d+°/.test(await h.text("[data-hdg]")), "немає курсу в градусах");
    },
  },
  {
    // The whole point of the app: a real declination from the WMM, not a decorative zero.
    name: "схилення пораховано і воно НЕ нуль", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-dec]")) === 1, "схилення не показане");
      const txt = await h.text("[data-dec]");
      const m = /([+−-])\s*(\d+(?:\.\d+)?)°/.exec(txt.replace(/\s+/g, " "));
      h.expect(!!m, `не розпарсив схилення з "${txt}"`);
      const deg = Number(m[2]);
      h.expect(deg > 5 && deg < 12, `схилення для Києва поза правдоподібним діапазоном: ${deg}° — модель мовчки зламалась`);
      h.expect(m[1] === "+", "схилення для Києва має бути східним");
    },
  },
  {
    name: "курс підписаний істинним лише коли є позиція", run: async (h) => {
      await ready(h);
      const t = await h.bodyText();
      // the gate has a seeded position, so it must say TRUE — and never both
      h.expect(/Істинний|True/i.test(t), "з позицією курс має бути істинним");
      h.expect(!/Магнітний курс|Magnetic heading/i.test(t), "не можна одночасно заявляти істинний і магнітний");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Compass|Language|Declination/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Компас|Мова|Схилення/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="rose"]'); await h.wait(120);
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
