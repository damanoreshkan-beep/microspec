// The gate seeds the field itself (view.js starts listening under `gate`), so these poll on a marker
// rather than on a network settle. Text regexes stay off the localised strings — the locale under test is
// not ours to assume — and read the seeded MESSAGES instead, which are the same in both.
export default [
  {
    name: "the field carries voices, loudest first",
    async run(h) {
      await h.waitFor(/привіт усім/);
      const voices = await h.count("[data-voice]");
      h.expect(voices >= 5, `очікував засіяне поле, знайшов ${voices}`);
      // Strength orders the field; without it two throws swap places while people are still speaking.
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
      // 11 Cyrillic characters is 22 bytes — the budget the whole product rests on.
      await h.type("[data-say]", "абвгдежзийк");
      await h.wait(150);
      h.expect((await h.text("[data-left]")) === "0", "11 кириличних символів мають з'їсти весь бюджет");
      // A 12th must not overflow the packet — it is refused at the encoder, so the counter stays at 0.
      await h.type("[data-say]", "абвгдежзийкл");
      await h.wait(150);
      h.expect((await h.text("[data-left]")) === "0", "лічильник пішов у мінус");
    },
  },
  {
    name: "a throw is held in the air, and can be taken back",
    async run(h) {
      await h.waitFor(/привіт усім/);
      await h.type("[data-say]", "тут");
      await h.wait(150);
      await h.tap("[data-throw]");
      await h.wait(400);
      h.expect((await h.count("[data-holding]")) === 1, "кинуте повідомлення не втримали в ефірі");
      h.expect(/тут/.test(await h.text("[data-holding]")), "в ефірі не той текст");
      await h.tap("[data-take]");
      await h.wait(400);
      h.expect((await h.count("[data-holding]")) === 0, "повідомлення лишилось в ефірі після Забрати");
      h.expect((await h.count("[data-say]")) === 1, "поле вводу не повернулось");
    },
  },
  {
    name: "listening is a toggle, and silence says so",
    async run(h) {
      await h.waitFor(/привіт усім/);
      h.expect((await h.attr("[data-listen]", "data-listen")) === "on", "гейт має слухати одразу");
      await h.tap("[data-listen]");
      await h.wait(400);
      h.expect((await h.count("[data-field]")) === 0, "поле лишилось після вимкнення");
      h.expect((await h.count("[data-empty]")) === 1, "тиша нічого не сказала");
      await h.tap("[data-listen]");
      await h.wait(400);
      h.expect((await h.count("[data-voice]")) >= 5, "ефір не повернувся");
    },
  },
];
