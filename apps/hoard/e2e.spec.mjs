// Hoard — the gate mounts a running three-hour session over a seeded vault (view.js FIXTURE_*), so the shot
// is the POPULATED screen. Flow covered: the field renders on WebGL; the amount ticks off a stored timestamp
// and survives a reload; the rate sheet is history-backed; Bank moves a session into the vault; a deleted
// session is gone. The amount itself is asserted through /_rt/earn.js's own unit tests, never here.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-amount]")) > 0) break; await h.wait(300); } };
const money = (s) => Number(String(s).replace(/[^\d,.-]/g, "").replace(/\s/g, "").replace(",", "."));

export default [
  {
    // regression guard: the hoard IS the field. A silent fall to a blank canvas (a shader that will not
    // compile, a fetch that 404s because hoard.frag dropped out of the build allow-list) is invisible to
    // every other check and means the app ships as a number on a grey page.
    name: "поле: WebGL-шлях активний у гейті", run: async (h) => {
      await ready(h); await h.wait(1200);
      const hw = await h.attr("[data-stage]", "data-haswebgl");
      const rm = await h.attr("[data-stage]", "data-render");
      if (hw === "yes") h.expect(rm === "webgl", `WebGL є, але поле не малюється: render=${rm} err=${await h.attr("[data-stage]", "data-err")}`);
    },
  },
  {
    name: "скарб: ставка, сума, час, кнопка", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-rate]")) === 1, "немає пігулки ставки");
      h.expect((await h.count("[data-persec]")) === 1, "немає ставки за секунду");
      h.expect((await h.count("[data-run]")) === 1, "немає кнопки старту");
      h.expect((await h.attr("[data-running]", "data-running")) === "yes", "гейт мав змонтувати активний сеанс");
      h.expect(/\d/.test(await h.text("[data-elapsed]")), "лічильник часу порожній");
    },
  },
  {
    name: "лічильник іде вперед", run: async (h) => {
      await ready(h);
      const a = money(await h.text("[data-amount]"));
      await h.wait(2500);
      const b = money(await h.text("[data-amount]"));
      h.expect(b > a, `сума не зростає: ${a} → ${b}`);
    },
  },
  {
    name: "час рахується від збереженої мітки, а не від відкриття", run: async (h) => {
      await ready(h);
      const before = money(await h.text("[data-amount]"));
      h.expect((await h.storage("hoard:startedAt")) !== "0", "мітку старту не записано в локальне сховище");
      await h.reload(); await ready(h); await h.wait(400);
      const after = money(await h.text("[data-amount]"));
      h.expect(after >= before, `перезапуск обнулив накопичене: ${before} → ${after}`);
    },
  },
  {
    name: "ставка: sheet, Back закриває", run: async (h) => {
      await ready(h);
      await h.tap("[data-rate]"); await h.wait(300);
      h.expect((await h.prop("#ratesheet", "open")) === true, "sheet ставки не відкрився");
      h.expect((await h.count("[data-pay]")) === 1, "немає поля суми");
      await h.back(); await h.wait(300);
      h.expect((await h.prop("#ratesheet", "open")) !== true, "Back не закрив sheet ставки");
    },
  },
  {
    name: "зміна ставки міняє суму за секунду", run: async (h) => {
      await ready(h);
      const before = await h.text("[data-persec]");
      await h.tap("[data-rate]"); await h.wait(300);
      await h.type("[data-pay]", "90000"); await h.wait(200);
      await h.tap("[data-save-rate]"); await h.wait(400);
      h.expect((await h.prop("#ratesheet", "open")) !== true, "збереження не закрило sheet");
      h.expect((await h.text("[data-persec]")) !== before, "ставка за секунду не змінилась");
    },
  },
  {
    name: "«Забрати» кладе сеанс у скарбницю", run: async (h) => {
      await ready(h);
      await h.click('[data-tab="vault"]'); await h.wait(500);
      const before = await h.count("[data-session]");
      await h.click('[data-tab="flow"]'); await h.wait(400);
      await h.tap("[data-run]"); await h.wait(600);
      h.expect((await h.attr("[data-running]", "data-running")) === "no", "після «Забрати» сеанс усе ще активний");
      h.expect((await h.storage("hoard:startedAt")) === "0", "мітку старту не скинуто");
      await h.click('[data-tab="vault"]'); await h.wait(600);
      h.expect((await h.count("[data-session]")) === before + 1, "сеанс не потрапив у скарбницю");
      h.expect((await h.count("[data-total]")) >= 1, "немає підсумку");
    },
  },
  {
    name: "старт після забирання", run: async (h) => {
      await h.click('[data-tab="flow"]'); await h.wait(400);
      await h.tap("[data-run]"); await h.wait(400);
      h.expect((await h.attr("[data-running]", "data-running")) === "yes", "кнопка не запустила новий сеанс");
      h.expect((await h.storage("hoard:startedAt")) !== "0", "новий старт не записано");
    },
  },
  {
    name: "видалення сеансу", run: async (h) => {
      await h.click('[data-tab="vault"]'); await h.wait(600);
      const before = await h.count("[data-session]");
      await h.tap("[data-session] [aria-label]"); await h.wait(600);
      h.expect((await h.count("[data-session]")) === before - 1, "сеанс не зник зі списку");
    },
  },
  {
    name: "мови", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(300);
      await h.click('[data-loc="en"]'); await h.wait(400);
      await h.click('[data-tab="flow"]'); await h.wait(400);
      h.expect(/\/ s/.test(await h.text("[data-persec]")), "англійська локаль не застосувалась");
      await h.click('[data-tab="me"]'); await h.wait(300);
      await h.click('[data-loc="uk"]'); await h.wait(400);
    },
  },
];
