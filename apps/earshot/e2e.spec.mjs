export default [
  {
    name: "the field carries voices, loudest first",
    async run(h) {
      await h.waitFor(/привіт усім/);
      const voices = await h.count("[data-voice]");
      h.expect(voices >= 5, `очікував засіяне поле, знайшов ${voices}`);
      const first = Number(await h.attr("[data-voice]", "data-strength"));
      h.expect(Number.isFinite(first) && first > 0, "перший голос без сили сигналу");
      const field = await h.text("[data-field]");
      h.expect(/a{22}/.test(field), "найдовше легальне повідомлення обрізане на екрані");
    },
  },
  {
    name: "the counter answers before the throw, not after",
    async run(h) {
      await h.waitFor(/привіт усім/);
      h.expect((await h.text("[data-left]")) === "22", "порожнє поле має показувати весь бюджет");
      await h.type("[data-say]", "абвгдежзийк");
      await h.wait(150);
      h.expect((await h.text("[data-left]")) === "0", "11 кириличних символів мають з'їсти весь бюджет");
      await h.type("[data-say]", "абвгдежзийкл");
      await h.wait(150);
      h.expect((await h.text("[data-left]")) === "0", "лічильник пішов у мінус");
    },
  },
  {
    name: "a throw joins the chat, and can be taken back",
    async run(h) {
      await h.waitFor(/привіт усім/);
      await h.type("[data-say]", "тут");
      await h.wait(150);
      await h.tap("[data-throw]");
      await h.wait(400);
      h.expect((await h.count('[data-mine="1"]')) === 1, "кинуте повідомлення не зʼявилось у чаті");
      h.expect(/тут/.test(await h.text('[data-mine="1"]')), "в ефірі не той текст");
      await h.tap("[data-take]");
      await h.wait(400);
      h.expect((await h.count('[data-mine="1"]')) === 0, "повідомлення лишилось в ефірі після Забрати");
      h.expect((await h.count("[data-say]")) === 1, "поле вводу зникло");
    },
  },
  {
    name: "listening is a toggle, and silence says so",
    async run(h) {
      await h.waitFor(/привіт усім/);
      h.expect((await h.attr("[data-listen]", "data-listen")) === "on", "гейт має слухати одразу");
      await h.tap("[data-listen]");
      await h.wait(400);
      h.expect((await h.count('[data-voice][data-mine="0"]')) === 0, "чужі голоси лишились після вимкнення");
      h.expect((await h.count("[data-empty]")) === 1, "тиша нічого не сказала");
      await h.tap("[data-listen]");
      await h.wait(400);
      h.expect((await h.count('[data-voice][data-mine="0"]')) >= 5, "ефір не повернувся");
    },
  },
];
