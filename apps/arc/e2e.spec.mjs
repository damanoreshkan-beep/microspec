// arc — the gate seeds a fixture (no network: Wikipedia, Wikidata and the AI endpoint are all unreachable
// here) and opens the reader on top of a seeded result list, so Back has somewhere real to go.
//
// The load-bearing test is the LAST one. "Maximum three phone screens" is the owner's requirement, and a
// requirement nobody measures is a requirement that drifts — so it is measured here, off the live document,
// rather than estimated from a character count or eyeballed in a screenshot.
const ready = async (h) => { for (let i = 0; i < 25; i++) { if ((await h.count("[data-reader]")) > 0) return true; await h.wait(200); } return false; };

export default [
  {
    name: "читач відкривається з трьома діями; фінал замкнений", run: async (h) => {
      h.expect(await ready(h), "читач не змонтувався");
      h.expect((await h.count("[data-act='1']")) === 1, "немає дії «Початок»");
      h.expect((await h.count("[data-act='2']")) === 1, "немає дії «Середина»");
      // the whole spoiler contract: act 3 must NOT be in the DOM before it is unlocked — hiding it with
      // CSS would still hand the ending to anything that reads text, including a screen reader.
      h.expect((await h.count("[data-act='3']")) === 0, "фінал показано без запиту — спойлер витік");
      h.expect((await h.count("[data-reveal]")) === 1, "немає кнопки розкриття фіналу");
    },
  },
  {
    name: "кожна дія має щонайменше 4 речення", run: async (h) => {
      h.expect(await ready(h), "читач не змонтувався");
      // The owner's floor. Four sentences is what makes the retelling worth reading instead of a blurb.
      for (const n of [1, 2]) {
        const text = await h.text(`[data-act='${n}']`);
        const sentences = text.split(/(?<=[.!?…])\s+/).filter((s) => s.trim().length > 1).length;
        h.expect(sentences >= 4, `дія ${n} має ${sentences} речень — менше за домовлені 4`);
      }
    },
  },
  {
    name: "розкриття фіналу додає третю дію", run: async (h) => {
      h.expect(await ready(h), "читач не змонтувався");
      await h.tap("[data-reveal]"); await h.wait(400);
      h.expect((await h.count("[data-act='3']")) === 1, "після розкриття третьої дії не з'явилось");
      h.expect((await h.count("[data-reveal]")) === 0, "кнопка розкриття лишилась після розкриття");
      const text = await h.text("[data-act='3']");
      const sentences = text.split(/(?<=[.!?…])\s+/).filter((s) => s.trim().length > 1).length;
      h.expect(sentences >= 4, `фінал має ${sentences} речень — менше за домовлені 4`);
    },
  },
  {
    name: "повзунок довжини має три позиції й доступне ім'я", run: async (h) => {
      h.expect(await ready(h), "читач не змонтувався");
      h.expect((await h.count("[data-level]")) === 1, "немає повзунка довжини");
      h.expect(await h.attr("[data-level]", "min") === "1", "мінімум повзунка не 1");
      h.expect(await h.attr("[data-level]", "max") === "3", "максимум повзунка не 3");
      // axe `label` is critical and fires on every tab — a range with no accessible name fails the build
      const name = (await h.attr("[data-level]", "aria-label")) || (await h.attr("[data-level]", "id"));
      h.expect(!!name, "повзунок без доступного імені");
      h.expect((await h.text("[data-level-label]")).trim().length > 0, "активна позиція не підписана");
    },
  },
  {
    name: "системний Назад виходить із читача до списку, а не з апки", run: async (h) => {
      h.expect(await ready(h), "читач не змонтувався");
      await h.back(); await h.wait(500);
      h.expect((await h.count("[data-reader]")) === 0, "Назад не закрив читача");
      h.expect((await h.count("[data-book]")) > 0, "під читачем не виявилось списку результатів");
      // and back INTO a book, so the restore path is exercised too, not just the pop
      await h.tap("[data-book]"); await h.wait(500);
      h.expect((await h.count("[data-reader]")) === 1, "повторне відкриття книги не спрацювало");
    },
  },
  {
    name: "збережене: полиця рендериться і веде в той самий читач", run: async (h) => {
      h.expect(await ready(h), "читач не змонтувався");
      await h.tap('[data-tab="saved"]'); await h.wait(500);
      h.expect((await h.count("[data-book]")) > 0, "полиця збереженого порожня");
      await h.tap("[data-book]"); await h.wait(600);
      h.expect((await h.count("[data-reader]")) === 1, "зі збереженого читач не відкрився");
    },
  },
  {
    name: "увесь переказ уміщається в 3 екрани телефона", run: async (h) => {
      h.expect(await ready(h), "читач не змонтувався");
      await h.tap("[data-reveal]"); await h.wait(500);        // the longest possible state: all three acts
      const scroll = await h.prop("html", "scrollHeight");
      const view = await h.prop("html", "clientHeight");
      h.expect(view > 0, "не вдалося виміряти висоту вікна");
      const screens = scroll / view;
      // Measured, not estimated. The fixture is a real level-3 reply, which is the longest the app can
      // produce, so this bounds the worst case rather than a typical one. If this fails, the fix is the
      // ACT_BUDGET in the edge prompt (apps/arc/RESEARCH.md), not a smaller font here.
      h.expect(screens <= 3.05, `переказ займає ${screens.toFixed(2)} екрана (${scroll}px при вікні ${view}px) — понад домовлені 3`);
    },
  },
];
