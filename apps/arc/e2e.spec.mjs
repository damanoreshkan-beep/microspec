// arc — the gate seeds a fixture (no network: Wikipedia, Wikidata and the AI endpoint are all unreachable
// here) so the list renders populated and a card can be opened.
//
// Everything except the reader is systemic, so this file tests the app's OWN claims and trusts the runtime
// for the rest: the card list, the search box, the favourite star, the empty states and the drill-down
// routing are the runtime's components, already covered by its own gates. What is bespoke — and therefore
// what is tested here — is the three-act body, the length slider and the spoiler lock.
//
// There is deliberately NO "fits in three screens" assertion. Three screens is the shape the length ladder
// aims at, not a contract: the owner called it soft. Gating it would have meant either trimming generated
// prose or chasing a target the model does not track — asked for 500 characters per act it returned MORE
// than when asked for 600. The sentence floor below is the promise worth gating.
const list = async (h) => { for (let i = 0; i < 25; i++) { if ((await h.count(".aw-tap")) > 0) return true; await h.wait(200); } return false; };
const openBook = async (h) => {
  if (!(await list(h))) return false;
  await h.tap(".aw-tap"); await h.wait(600);
  for (let i = 0; i < 20; i++) { if ((await h.count("[data-reader]")) > 0) return true; await h.wait(200); }
  return false;
};
const sentences = (s) => s.split(/(?<=[.!?…])\s+/).filter((x) => x.trim().length > 1).length;

export default [
  {
    name: "картка книги відкриває читача з трьома діями; фінал замкнений", run: async (h) => {
      h.expect(await openBook(h), "читач не відкрився з картки");
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
      h.expect(await openBook(h), "читач не відкрився з картки");
      for (const n of [1, 2]) {
        const got = sentences(await h.text(`[data-act='${n}']`));
        h.expect(got >= 4, `дія ${n} має ${got} речень — менше за домовлені 4`);
      }
    },
  },
  {
    name: "розкриття фіналу додає третю дію", run: async (h) => {
      h.expect(await openBook(h), "читач не відкрився з картки");
      await h.tap("[data-reveal]"); await h.wait(400);
      h.expect((await h.count("[data-act='3']")) === 1, "після розкриття третьої дії не з'явилось");
      h.expect((await h.count("[data-reveal]")) === 0, "кнопка розкриття лишилась після розкриття");
      const got = sentences(await h.text("[data-act='3']"));
      h.expect(got >= 4, `фінал має ${got} речень — менше за домовлені 4`);
    },
  },
  {
    name: "КОЖЕН блок має власний повзунок на три дискретні позиції", run: async (h) => {
      h.expect(await openBook(h), "читач не відкрився з картки");
      await h.tap("[data-reveal]"); await h.wait(400);       // the third act must have one too
      // The whole point of per-block dials: the ending can be read in full while the setup stays brief.
      for (const slot of ["1", "2", "3", "ask"]) {
        const sel = `[data-level-${slot}] input`;
        h.expect((await h.count(sel)) === 1, `блок «${slot}» без власного повзунка`);
        // `attr` lands on the kit Slider's wrapping <label>; the range is the input inside it. Asking the
        // label for `min` returned "" and cost a CI round — the component's own source says where it goes.
        h.expect(await h.attr(sel, "min") === "1", `повзунок «${slot}»: мінімум не 1`);
        h.expect(await h.attr(sel, "max") === "3", `повзунок «${slot}»: максимум не 3`);
        h.expect(await h.attr(sel, "step") === "1", `повзунок «${slot}» не дискретний`);
        // axe `label` is critical and fires on every tab — a range with no accessible name fails the build
        h.expect(((await h.attr(sel, "aria-label")) || "").trim().length > 0,
          `повзунок «${slot}» без доступного імені`);
      }
    },
  },
  {
    name: "запитання про сюжет: поле, відповідь, і жодного спойлера в замкненому стані", run: async (h) => {
      h.expect(await openBook(h), "читач не відкрився з картки");
      h.expect((await h.count("[data-ask]")) === 1, "немає поля запитання");
      h.expect(((await h.attr("[data-ask]", "placeholder")) || "").trim().length > 0, "поле без плейсхолдера");
      h.expect(((await h.attr("[data-ask]", "aria-label")) || "").trim().length > 0, "поле без доступного імені");
      // the send control must be inert until there is something to send
      h.expect((await h.attr("[data-ask-send]", "disabled")) !== null, "кнопка активна при порожньому полі");
      await h.type("[data-ask]", "Чому Пол погоджується вести фременів?"); await h.wait(200);
      await h.tap("[data-ask-send]"); await h.wait(600);
      h.expect((await h.count("[data-ask-q]")) === 1, "запитання не показано");
      h.expect((await h.count("[data-ask-a]")) === 1, "відповідь не з'явилась");
      h.expect((await h.text("[data-ask-a]")).trim().length > 20, "відповідь порожня");
      // the block sits BELOW the ending, continuing the same column — not floating somewhere else
      h.expect((await h.count("[data-reader] [data-ask]")) === 1, "блок запитання поза колонкою читача");
    },
  },
  {
    name: "системний Назад закриває читача до списку, а не виходить з апки", run: async (h) => {
      h.expect(await openBook(h), "читач не відкрився з картки");
      await h.back(); await h.wait(500);
      h.expect((await h.count("[data-reader]")) === 0, "Назад не закрив читача");
      h.expect((await h.count(".aw-tap")) > 0, "під читачем не виявилось списку книг");
    },
  },
  {
    name: "збережене: зірка кладе книгу на полицю, і звідти теж відкривається читач", run: async (h) => {
      h.expect(await list(h), "список книг не змонтувався");
      await h.tap("[data-fav]"); await h.wait(400);
      await h.tap('[data-tab="saved"]'); await h.wait(600);
      h.expect((await h.count(".aw-tap")) > 0, "збережена книга не з'явилась на полиці");
      await h.tap(".aw-tap"); await h.wait(600);
      h.expect((await h.count("[data-reader]")) === 1, "зі збереженого читач не відкрився");
    },
  },
];
