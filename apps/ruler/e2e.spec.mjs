// GPS ruler — the gate seeds a sample path (headless has no GPS), so the canvas + readouts render.
const ready = async (h) => { for (let i = 0; i < 12; i++) { if ((await h.count("#add")) > 0) break; await h.wait(200); } };

export default [
  {
    name: "GPS-лінійка: канвас + полілінія + загальна відстань + точність", run: async (h) => {
      await ready(h); await h.wait(200);
      h.expect((await h.count("canvas")) === 1, "немає канваса з полілінією");
      h.expect((await h.count("#add")) === 1 && (await h.count("#undo")) === 1 && (await h.count("#clear")) === 1, "немає керування (додати/скасувати/очистити)");
      h.expect(/\d[\d.,]*\s*(м|км)/.test(await h.bodyText()), "немає загальної відстані по координатах");
      h.expect(/±\s*\d/.test(await h.bodyText()), "немає точності GPS");
    },
  },
  {
    // A GPS instrument that never tells you WHERE you are shipped for months — nobody noticed, because
    // every gate only ever checked the derived numbers (distance, area, accuracy), never the position itself.
    name: "показує координати позиції", run: async (h) => {
      await ready(h); await h.wait(200);
      h.expect((await h.count("[data-coords]")) === 1, "немає читача координат");
      const c = await h.text("[data-coords]");
      h.expect(/-?\d+\.\d{5}\s*,\s*-?\d+\.\d{5}/.test(c), `координати не у форматі lat, lng з 5 знаками: "${c}"`);
    },
  },
  {
    // A ruler that prints a distance and hides its error is the failure this app shipped with for months:
    // every number was ±8 m at each end and the screen said so nowhere. The ± is not decoration, it is
    // the measurement — so the gate holds it to the total, not just to the live fix readout.
    name: "загальна відстань несе свою похибку", run: async (h) => {
      await ready(h); await h.wait(200);
      h.expect((await h.count("[data-err]")) === 1, "загальна відстань без ± — число виглядає точнішим, ніж воно є");
      h.expect(/±\s*[\d.]+\s*(м|m)/.test(await h.text("[data-err]")), `похибка не у форматі ± N м: "${await h.text("[data-err]")}"`);
      await h.click("#clear"); await h.wait(150);
      h.expect((await h.count("[data-err]")) === 0, "± лишилось без жодного сегмента — похибка ні до чого");
    },
  },
  {
    name: "очистити скидає полілінію", run: async (h) => {
      await ready(h);
      await h.click("#clear"); await h.wait(150);
      h.expect((await h.prop("#undo", "disabled")) === true, "після очищення undo не задизейблився");
      h.expect(/—/.test(await h.text("main")), "загальна відстань не скинулась на —");
    },
  },
  {
    name: "додати точку працює", run: async (h) => {
      await ready(h);
      await h.click("#clear"); await h.wait(120);
      await h.click("#add"); await h.wait(150);
      h.expect((await h.prop("#undo", "disabled")) !== true, "після додавання точки undo лишився задизейбленим");
    },
  },
  {
    // The point of the feature: you measure a field by WALKING it, the OS evicts the backgrounded tab, and
    // without this every vertex is gone. "Saved" and "silently dropped" look identical until you come back —
    // which is why this reloads for real rather than trusting that a put() was called.
    name: "точки переживають перезавантаження", run: async (h) => {
      await ready(h);
      await h.click("#clear"); await h.wait(200);
      await h.click("#add"); await h.wait(250);
      h.expect((await h.prop("#undo", "disabled")) !== true, "точка не додалась перед перезавантаженням");
      await h.reload();
      await ready(h); await h.wait(300);
      h.expect((await h.prop("#undo", "disabled")) !== true, "точку втрачено після перезавантаження — вимірювання зникає разом із вкладкою");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Ruler|Language|Total distance/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Лінійка|Мова|відстань/.test(await h.bodyText()), "не UA");
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
