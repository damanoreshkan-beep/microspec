// Three tabs, one module-scope engine (dry + a shared reverb wash, built once). The pan is a circular field
// of struck voices (the 1:2:3 handpan timbre); Flow = the unit-tested /_rt/melody.js scored search. Settings
// (voice, scale, space, shimmer, drone) live in a history-backed sheet (system Back closes it).
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-field]")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "пан: поля, строї, транспорт, Flow, запис", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-scale]")) === 10, "немає 10 строїв");
      h.expect((await h.count("[data-field]")) === 9, "D Kurd має мати 9 полів (дінг + 8)");
      h.expect((await h.count("#play")) === 1, "немає програвання");
      h.expect((await h.count("#flow")) === 1, "немає Flow");
      h.expect((await h.count("[data-rec]")) === 1, "немає запису");
      h.expect((await h.count("[data-space]")) === 1, "немає простору");
    },
  },
  {
    name: "3D резонанс: фонове поле хвиль від ударів", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-ripple]")) === 1, "немає фонового поля резонансу (хвиль)");
    },
  },
  {
    name: "удар по полю + зміна строю перебудовує пан", run: async (h) => {
      await ready(h);
      await h.tap('[data-field="0"]'); await h.wait(120);
      await h.tap('[data-scale="celtic"]'); await h.wait(200);
      h.expect((await h.attr('[data-scale="celtic"]', "aria-pressed")) === "true", "стрій не обрався");
      h.expect((await h.count("[data-field]")) === 8, "Celtic Minor має мати 8 полів");
      await h.tap('[data-scale="kurd"]'); await h.wait(150);
    },
  },
  {
    name: "Flow генерує лінію", run: async (h) => {
      await ready(h);
      await h.tap("#flow"); await h.wait(1300);  // ~480ms write-on sweep (setInterval, throttles under CI load) then auto-play — give real headroom
      h.expect((await h.attr("#play", "data-playing")) === "true", "Flow не почав грати");
      await h.tap("#play"); await h.wait(150);
      h.expect((await h.attr("#play", "data-playing")) !== "true", "не зупинився");
    },
  },
  {
    name: "запис армується", run: async (h) => {
      await ready(h);
      await h.tap("[data-rec]"); await h.wait(150);
      h.expect((await h.attr("[data-rec]", "aria-pressed")) === "true", "запис не армувався");
      h.expect((await h.attr("#play", "data-playing")) === "true", "запис не запустив луп");
      await h.tap("#play"); await h.wait(150);
    },
  },
  {
    name: "сітка Weave: редагування + збереження", run: async (h) => {
      await h.click('[data-tab="weave"]'); await h.wait(200);
      h.expect((await h.count("[data-cell]")) === 9 * 16, "сітка не 9x16");
      const cell = '[data-cell="4-6"]';
      const before = await h.attr(cell, "aria-pressed");
      await h.tap(cell); await h.wait(120);
      h.expect((await h.attr(cell, "aria-pressed")) !== before, "клітинка не перемкнулась");
      await h.tap("#save"); await h.wait(250);
      await h.click('[data-tab="saved"]'); await h.wait(300);
      h.expect((await h.count("[data-saved]")) >= 1, "збережений луп не зʼявився");
    },
  },
  {
    name: "налаштування: sheet, голоси/строї, Back закриває", run: async (h) => {
      await h.click('[data-tab="weave"]'); await h.wait(200);
      await h.tap("[data-settings]"); await h.wait(200);
      h.expect((await h.prop("#setsheet", "open")) === true, "sheet не відкрився");
      h.expect((await h.count("[data-tb]")) === 5, "немає 5 голосів");
      h.expect((await h.count("[data-setscale]")) === 10, "немає 10 строїв у sheet");
      await h.tap('[data-tb="bell"]'); await h.wait(150);
      h.expect((await h.attr('[data-tb="bell"]', "aria-pressed")) === "true", "голос не обрався");
      await h.tap("[data-set='drone']"); await h.wait(150);
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#setsheet", "open")) !== true, "Back не закрив sheet");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      await h.click('[data-tab="weave"]'); await h.wait(160);
      await h.tap("[data-settings]"); await h.wait(160);
      h.expect(/Shimmer|Drone|Voice|Tempo/i.test(await h.bodyText()), "не EN");
      await h.back(); await h.wait(150);
      await h.click('[data-tab="me"]'); await h.wait(120);
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Мова|Тема/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="play"]'); await h.wait(120);
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
