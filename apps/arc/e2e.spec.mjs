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
    name: "до пошуку показано полиці книг, а не порожній екран з інструкцією", run: async (h) => {
      h.expect(await list(h), "список книг не змонтувався");
      const body = await h.bodyText();
      for (const shelf of [/українськ/i, /класик/i, /жанр/i, /фільм/i])
        h.expect(shelf.test(body), `на лендингу немає полиці ${shelf}`);
      h.expect((await h.count(".aw-tap")) >= 20, `полиці майже порожні: ${await h.count(".aw-tap")} книг`);
    },
  },
  {
    name: "картка книги відкриває читача з трьома діями; фінал замкнений", run: async (h) => {
      h.expect(await openBook(h), "читач не відкрився з картки");
      h.expect((await h.count("[data-act='1']")) === 1, "немає дії «Початок»");
      h.expect((await h.count("[data-act='2']")) === 1, "немає дії «Середина»");
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
      await h.tap("[data-reveal]"); await h.wait(400);       
      for (const slot of ["1", "2", "3", "ask"]) {
        const sel = `[data-level-${slot}] input`;
        h.expect((await h.count(sel)) === 1, `блок «${slot}» без власного повзунка`);
        h.expect(await h.attr(sel, "min") === "1", `повзунок «${slot}»: мінімум не 1`);
        h.expect(await h.attr(sel, "max") === "3", `повзунок «${slot}»: максимум не 3`);
        h.expect(await h.attr(sel, "step") === "1", `повзунок «${slot}» не дискретний`);
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
      h.expect((await h.attr("[data-ask-send]", "disabled")) !== null, "кнопка активна при порожньому полі");
      await h.type("[data-ask]", "Чому Пол погоджується вести фременів?"); await h.wait(200);
      await h.tap("[data-ask-send]"); await h.wait(600);
      h.expect((await h.count("[data-ask-q]")) === 1, "запитання не показано");
      h.expect((await h.count("[data-ask-a]")) === 1, "відповідь не з'явилась");
      h.expect((await h.text("[data-ask-a]")).trim().length > 20, "відповідь порожня");
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
