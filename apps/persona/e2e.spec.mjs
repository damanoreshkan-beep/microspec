// persona — the gate seeds the fixture shelf + a mock session (no network here), so the shelf is populated, a
// person opens, and a line sent gets a streamed fixture reply. Systemic parts (cards, search, sections,
// back-routing) are the runtime's; this file tests the app's own claims — the conversation.
const shelf = async (h) => { for (let i = 0; i < 25; i++) { if ((await h.count(".aw-tap")) > 0) return true; await h.wait(200); } return false; };
const openFirst = async (h) => {
  if (!(await shelf(h))) return false;
  await h.tap(".aw-tap"); await h.wait(500);
  for (let i = 0; i < 20; i++) { if ((await h.count("[data-chat]")) > 0) return true; await h.wait(200); }
  return false;
};
const settled = async (h) => { for (let i = 0; i < 40; i++) { if ((await h.count("[data-pending]")) === 0) return true; await h.wait(150); } return false; };

export default [
  {
    name: "полиця показує людей із портретами, не порожній екран", run: async (h) => {
      h.expect(await shelf(h), "полиця не змонтувалася");
      h.expect((await h.count(".aw-tap")) >= 5, `на полиці лише ${await h.count(".aw-tap")} карток`);
      h.expect(/Шерлок Холмс|Sherlock Holmes/.test(await h.bodyText()), "першої особи фікстури немає на полиці");
    },
  },
  {
    name: "картка відкриває розмову; Back закриває її, а не застосунок", run: async (h) => {
      h.expect(await openFirst(h), "розмова не відкрилася з картки");
      h.expect((await h.count("[data-intro]")) === 1, "немає картки особи");
      h.expect((await h.count("[data-composer]")) === 1, "немає поля вводу");
      await h.back(); await h.wait(300);
      h.expect((await h.count('[role="dialog"]')) === 0, "Back не закрив розмову");
      h.expect((await h.count(".aw-tap")) > 0, "Back вийшов замість повернутися на полицю");
    },
  },
  {
    name: "надіслана репліка стає рядком читача і отримує відповідь потоком", run: async (h) => {
      h.expect(await openFirst(h), "розмова не відкрилася");
      for (let i = 0; i < 20; i++) { if ((await h.count("[data-msg]")) > 0 || (await h.count("[data-opener]")) > 0) break; await h.wait(150); }
      const before = await h.count("[data-msg='assistant']");
      await h.type("[data-input]", "Де мої ключі?"); await h.wait(100);
      await h.tap("[data-send]"); await h.wait(200);
      h.expect((await h.count("[data-msg='user']")) >= 1, "репліка читача не з'явилася");
      h.expect(await settled(h), "відповідь так і лишилася в очікуванні");
      h.expect((await h.count("[data-msg='assistant']")) === before + 1, "відповіді не додалося");
      const turns = await h.count("[data-turn]");
      const last = await h.text(`[data-turn='${turns - 1}'] [data-msg='assistant']`);
      h.expect(last.length > 40, `відповідь надто коротка: «${last}»`);
      h.expect((await h.count("[data-composer]")) === 1, "поле вводу зникло після відповіді");
    },
  },
  {
    name: "порожня розмова пропонує три входи; «Почати заново» повертає їх", run: async (h) => {
      h.expect(await shelf(h), "полиця не змонтувалася");
      await h.tap('.aw-tap[aria-label*="Кало"], .aw-tap[aria-label*="Kahlo"]'); await h.wait(500);
      for (let i = 0; i < 20; i++) { if ((await h.count("[data-opener]")) > 0) break; await h.wait(150); }
      h.expect((await h.count("[data-opener]")) === 3, `входів у розмову ${await h.count("[data-opener]")}, а не три`);
      await h.tap("[data-opener='openerWho']"); await h.wait(200);
      h.expect((await h.count("[data-opener]")) === 0, "входи лишилися після першої репліки");
      h.expect(await settled(h), "відповідь на вхід не прийшла");
      h.expect((await h.count("[data-new-chat]")) === 1, "немає кнопки «Почати заново»");
      await h.tap("[data-new-chat]"); await h.wait(200);
      h.expect((await h.count("[data-msg]")) === 0, "«Почати заново» не очистило нитку");
      h.expect((await h.count("[data-opener]")) === 3, "після «Почати заново» входи не повернулися");
    },
  },
  {
    name: "розмови з особою: аркуш історії відкривається, Back закриває аркуш, а не особу", run: async (h) => {
      h.expect(await openFirst(h), "розмова не відкрилася");
      for (let i = 0; i < 20; i++) { if ((await h.count("[data-history]")) > 0) break; await h.wait(150); }
      h.expect((await h.count("[data-history]")) === 1, "немає кнопки історії при двох розмовах у фікстурі");
      await h.tap("[data-history]"); await h.wait(300);
      h.expect((await h.count("#persona-history[open]")) === 1, "аркуш історії не відкрився");
      h.expect((await h.count("[data-history-row]")) === 2, `у списку ${await h.count("[data-history-row]")} розмов, а не дві`);
      await h.back(); await h.wait(300);
      h.expect((await h.count("#persona-history[open]")) === 0, "Back не закрив аркуш історії");
      h.expect((await h.count('[role="dialog"]')) === 1, "Back закрив особу замість аркуша");
      await h.tap("[data-history]"); await h.wait(300);
      await h.tap("[data-history-row='2']"); await h.wait(400);
      h.expect((await h.count("#persona-history[open]")) === 0, "вибір розмови не закрив аркуш");
      h.expect((await h.count("[data-msg]")) > 0, "вибрана розмова не завантажилась у нитку");
    },
  },
  {
    name: "присутність: де є WebGL, поле малюється саме ним (не тихий відкат)", run: async (h) => {
      h.expect(await openFirst(h), "розмова не відкрилася");
      h.expect((await h.count("[data-stage]")) === 1, "немає полотна присутності");
      for (let i = 0; i < 30; i++) { if ((await h.attr("[data-stage]", "data-render")) === "webgl") break; await h.wait(200); }
      const has = await h.attr("[data-stage]", "data-haswebgl");
      if (has === "yes") h.expect((await h.attr("[data-stage]", "data-render")) === "webgl", `WebGL є, а поле не малюється: err=${await h.attr("[data-stage]", "data-err")}`);
    },
  },
];
