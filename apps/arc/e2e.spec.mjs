// arc — the gate seeds a fixture (no network: Wikipedia, Wikidata and the AI endpoint are all unreachable
// here) and opens the reader on top of a seeded result list, so Back has somewhere real to go.
//
// There is deliberately NO "fits in three screens" assertion. Three screens is the shape the length ladder
// aims at, not a contract: the owner called it soft. Gating it would have meant either trimming generated
// prose (cutting sentences off a story to satisfy a number) or chasing a target the model does not track —
// asked for 500 characters per act it returned MORE than when asked for 600. The sentence floor below is
// the promise worth gating, because it is the one that decides whether the retelling is worth reading.
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
      // `attr` lands on the kit Slider's wrapping <label>; the range itself is the input inside it. Asking
      // the label for `min` returned "" and cost a CI round — the component's own source says where it goes.
      h.expect(await h.attr("[data-level] input", "min") === "1", "мінімум повзунка не 1");
      h.expect(await h.attr("[data-level] input", "max") === "3", "максимум повзунка не 3");
      h.expect(await h.attr("[data-level] input", "step") === "1", "повзунок не дискретний");
      // axe `label` is critical and fires on every tab — a range with no accessible name fails the build
      h.expect(((await h.attr("[data-level] input", "aria-label")) || "").trim().length > 0,
        "повзунок без доступного імені");
      // the caption doubles as the value readout, so it must name the ACTIVE stop
      h.expect((await h.text("[data-level]")).trim().length > 0, "активна позиція не підписана");
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
];
