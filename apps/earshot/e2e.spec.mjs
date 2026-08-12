export default [
  {
    name: "the room is a chat, and every line says who spoke",
    async run(h) {
      await h.waitFor(/привіт усім/);
      const lines = await h.count("[data-voice]");
      h.expect(lines >= 5, `очікував засіяну кімнату, знайшов ${lines}`);
      const field = await h.text("[data-field]");
      h.expect(/a{22}/.test(field), "найдовше легальне повідомлення обрізане на екрані");
      h.expect(/[bdfgklmnprstvz][aeiou]{1}/.test(field), "у повідомленнях немає позивного відправника");
    },
  },
  {
    name: "the counter answers before you send, not after",
    async run(h) {
      await h.waitFor(/привіт усім/);
      h.expect((await h.text("[data-left]")) === "22", "порожнє поле має показувати весь бюджет");
      await h.type("[data-say]", "абвгдежзийк");
      await h.wait(150);
      h.expect((await h.text("[data-left]")) === "0", "11 кириличних символів мають зʼїсти весь бюджет");
      await h.type("[data-say]", "абвгдежзийкл");
      await h.wait(150);
      h.expect((await h.text("[data-left]")) === "0", "лічильник пішов у мінус");
    },
  },
  {
    name: "sending puts your own line in the conversation",
    async run(h) {
      await h.waitFor(/привіт усім/);
      const before = await h.count('[data-mine="1"]');
      await h.type("[data-say]", "тут");
      await h.wait(150);
      await h.tap("[data-throw]");
      await h.wait(400);
      h.expect((await h.count('[data-mine="1"]')) === before + 1, "надіслане не зʼявилось у чаті");
      h.expect(/тут/.test(await h.text('[data-mine="1"]')), "у чаті не той текст");
      h.expect((await h.count("[data-say]")) === 1, "поле вводу зникло після надсилання");
    },
  },
  {
    name: "the scanner shows what it has pulled out of the air",
    async run(h) {
      await h.waitFor(/привіт усім/);
      h.expect((await h.count("[data-scanner]")) === 1, "немає індикатора сканування");
      h.expect(/\d/.test(await h.text("[data-scanner]")), "індикатор не показує число пакетів");
    },
  },
];
