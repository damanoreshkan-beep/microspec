export default [
  {
    name: "лінійка рендериться (tool-view)", run: async (h) => {
      h.expect((await h.count("[data-ruler]")) === 1, "немає лінійки");
      h.expect((await h.count("#ruler-calib")) === 1, "немає кнопки калібрування");
    },
  },
  {
    name: "калібрування: під-екран відкривається, Back закриває (routing-інваріант)", run: async (h) => {
      await h.click("#ruler-calib"); await h.wait(200);
      h.expect((await h.count("[data-calib]")) === 1, "калібрування не відкрилось");
      h.expect((await h.count("#calib-range")) === 1, "немає повзунка");
      await h.back(); await h.wait(200);
      h.expect((await h.count("[data-calib]")) === 0, "Back не закрив калібрування");
      h.expect((await h.count("[data-ruler]")) === 1, "Back вийшов замість повернути до лінійки");
    },
  },
  {
    name: "калібрування зберігається", run: async (h) => {
      await h.click("#ruler-calib"); await h.wait(200);
      await h.type("#calib-range", "45"); await h.wait(150);
      await h.click("#calib-done"); await h.wait(200);
      h.expect((await h.storage("ruler:pxPerCm")) === "45", "калібрування не збереглось");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Ruler|Calibrate|Language/.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Лінійка|Калібрувати|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="ruler"]'); await h.wait(120);
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
