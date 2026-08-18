// tide — live currents behind a WebGL field. Under the gate the player is a mock state machine (no third-party
// stream is fetched from CI), so transport/state are asserted through the data-* atoms mirrored into the DOM.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-current]")) > 0) break; await h.wait(300); } };
const wrap = "[data-cat]";

export default [
  {
    name: "сцена: 6 течій, транспорт вмикається — стан live + трек із фікстури", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-current]")) === 6, "немає 6 течій");
      h.expect((await h.count("#play")) === 1, "немає кнопки відтворення");
      h.expect((await h.count("[data-stage]")) === 1, "немає поля");
      h.expect((await h.attr(wrap, "data-state")) === "idle", "стартовий стан не idle");
      await h.tap("#play"); await h.wait(300);
      h.expect((await h.attr("#play", "data-playing")) === "true", "не почав грати");
      h.expect((await h.attr(wrap, "data-state")) === "live", "стан не live");
      h.expect((await h.attr("[data-now]", "data-now")) === "yes", "трек із фікстури не показано");
      await h.tap("#play"); await h.wait(300);
      h.expect((await h.attr("#play", "data-playing")) !== "true", "не зупинився");
      h.expect((await h.attr(wrap, "data-state")) === "idle", "після стопу стан не idle");
    },
  },
  {
    name: "next/prev ходять усередині течії й ніколи не виходять з неї", run: async (h) => {
      await ready(h);
      const cat = await h.attr(wrap, "data-cat");
      const a = await h.attr(wrap, "data-station");
      await h.tap("#next"); await h.wait(200);
      const b = await h.attr(wrap, "data-station");
      h.expect(a !== b, "next не змінив станцію");
      h.expect((await h.attr(wrap, "data-cat")) === cat, "next змінив течію");
      await h.tap("#prev"); await h.wait(200);
      h.expect((await h.attr(wrap, "data-station")) === a, "prev не повернув назад");
    },
  },
  {
    name: "зміна течії: активна смуга, станція з нової течії", run: async (h) => {
      await ready(h);
      await h.tap('[data-current="bass"]'); await h.wait(200);
      h.expect((await h.attr('[data-current="bass"]', "aria-pressed")) === "true", "течія не стала активною");
      h.expect((await h.attr(wrap, "data-cat")) === "bass", "data-cat не оновився");
      const st = await h.attr(wrap, "data-station");
      h.expect(/bassdrive|kool|ukbass|brokenbeats|hardbase|dubstep/.test(st), `станція не з течії bass: ${st}`);
      await h.tap('[data-current="deep"]'); await h.wait(200);
      h.expect((await h.attr('[data-current="bass"]', "aria-pressed")) !== "true", "стара течія лишилась активною");
    },
  },
  {
    name: "станції: аркуш відкривається, Back закриває, вибір грає й закриває", run: async (h) => {
      await ready(h);
      await h.tap("[data-stations]"); await h.wait(300);
      h.expect((await h.prop("#stations", "open")) === true, "аркуш станцій не відкрився");
      h.expect((await h.count("[data-pick]")) >= 6, "менше 6 станцій у течії");
      await h.back(); await h.wait(300);
      h.expect((await h.prop("#stations", "open")) !== true, "Back не закрив аркуш");
      await h.tap("[data-stations]"); await h.wait(300);
      await h.tap('[data-pick="spacestation"]'); await h.wait(300);
      h.expect((await h.attr(wrap, "data-station")) === "spacestation", "вибір не змінив станцію");
      h.expect((await h.attr("#play", "data-playing")) === "true", "вибір не почав грати");
      h.expect((await h.prop("#stations", "open")) !== true, "аркуш не закрився після вибору");
    },
  },
  {
    name: "поле: де є WebGL, воно малюється саме ним (не тихий відкат)", run: async (h) => {
      await ready(h);
      for (let i = 0; i < 30; i++) { if ((await h.attr("[data-stage]", "data-render")) === "webgl") break; await h.wait(200); }
      const has = await h.attr("[data-stage]", "data-haswebgl");
      if (has === "yes") h.expect((await h.attr("[data-stage]", "data-render")) === "webgl", `WebGL є, а поле не малюється: err=${await h.attr("[data-stage]", "data-err")}`);
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Language|Dark theme/i.test(await h.bodyText()), "англійська не застосувалась");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Мова|Темна тема/.test(await h.bodyText()), "українська не застосувалась");
    },
  },
  {
    name: "PWA: профіль → модалка встановлення, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click("#p-install"); await h.wait(150);
      h.expect((await h.prop("#install", "open")) === true, "модалка не відкрилась");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив модалку");
    },
  },
];
