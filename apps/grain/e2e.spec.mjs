// Grain — a recorded sample played as grain clouds. The gate has NO microphone, so the view seeds a
// deterministic synthetic take (syntheticSample, 220 Hz) and everything below measures the POPULATED screen:
// the waveform, the fields, the read head. Capture itself cannot be exercised headless — the mic prime and
// the permission states are structure only.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-field]")) > 0 && (await h.count("[data-wave]")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "гра: хвиля семпла, поля, лади, транспорт", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-live]")) >= 1, "немає живого читання (хвилі семпла)");
      h.expect((await h.count("[data-field]")) === 8, "пентатоніка має дати 8 полів");
      h.expect((await h.count("[data-scale]")) === 4, "немає 4 ладів");
      h.expect((await h.count("#play")) === 1, "немає транспорту");
      h.expect((await h.count("[data-rec]")) === 1, "немає кнопки запису");
      // the gate's take is a struck 220 Hz bowl, so the pitch line must name a note, not "unpitched"
      h.expect(/A3/i.test(await h.text("[data-pitch]")), "детектор висоти не назвав ноту семпла");
    },
  },
  {
    name: "удар по полю + зміна ладу перебудовує поля", run: async (h) => {
      await ready(h);
      await h.tap('[data-field="0"]'); await h.wait(150);
      await h.tap('[data-scale="wide"]'); await h.wait(200);
      h.expect((await h.attr('[data-scale="wide"]', "aria-pressed")) === "true", "лад не обрався");
      h.expect((await h.count("[data-field]")) === 8, "у широкому ладі теж 8 полів");
      await h.tap('[data-scale="pent"]'); await h.wait(150);
    },
  },
  {
    name: "Flow генерує фразу і запускає її", run: async (h) => {
      await ready(h);
      await h.tap("#flow");
      let playing = false;
      for (let i = 0; i < 20; i++) { await h.wait(250); if ((await h.attr("#play", "data-playing")) === "true") { playing = true; break; } }
      h.expect(playing, "Flow не почав грати");
      await h.tap("#play"); await h.wait(150);
      h.expect((await h.attr("#play", "data-playing")) !== "true", "не зупинився");
    },
  },
  {
    name: "форма: ручки зерна, сітка лупа, пресети в sheet, Back закриває", run: async (h) => {
      await h.click('[data-tab="shape"]'); await h.wait(250);
      for (const k of ["size", "spray", "density", "drift", "tone", "bpm"]) {
        h.expect((await h.count(`[data-${k}]`)) === 1, `немає ручки ${k}`);
      }
      h.expect((await h.count("[data-cell]")) === 8 * 16, "сітка лупа не 8x16");
      const cell = '[data-cell="3-4"]';
      const before = await h.attr(cell, "aria-pressed");
      await h.tap(cell); await h.wait(150);
      h.expect((await h.attr(cell, "aria-pressed")) !== before, "клітинка не перемкнулась");
      await h.tap("#shelp"); await h.wait(250);
      h.expect((await h.prop("#presetsheet", "open")) === true, "sheet пресетів не відкрився");
      h.expect((await h.count("[data-preset]")) === 4, "немає 4 пресетів");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#presetsheet", "open")) !== true, "Back не закрив sheet");
    },
  },
  {
    name: "пресет змінює розмір зерна і щільність", run: async (h) => {
      await h.click('[data-tab="shape"]'); await h.wait(200);
      const rateBefore = await h.text("[data-rate]");
      await h.tap("#shelp"); await h.wait(200);
      await h.tap('[data-preset="cloud"]'); await h.wait(250);
      h.expect((await h.text("[data-rate]")) !== rateBefore, "пресет не змінив щільність потоку зерен");
    },
  },
  {
    name: "збереження запису → вкладка Записи", run: async (h) => {
      await h.click('[data-tab="play"]'); await h.wait(200);
      await ready(h);
      await h.tap("#keep"); await h.wait(400);
      await h.click('[data-tab="takes"]'); await h.wait(400);
      // the gate seeds one fixture take, so a SAVE must make it two — >=1 would pass without saving anything
      h.expect((await h.count("[data-take]")) >= 2, "збережений запис не зʼявився поряд із фікстурою");
      h.expect((await h.count("[data-share]")) >= 1, "немає експорту WAV");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      await h.click('[data-tab="shape"]'); await h.wait(200);
      h.expect(/Grain|Spray|Density|Drift/i.test(await h.bodyText()), "не EN");
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Мова|Тема/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="play"]'); await h.wait(150);
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
