// persona — the gate seeds the fixture shelf (no network: the edge, GitHub and Wikipedia are unreachable
// here) and a mock session, so the shelf is populated, a person can be opened, and a message can be sent and
// answered by the fixture stream. What is systemic (cards, search, sections, back-routing) is the runtime's
// and covered by its own gates; this file tests the app's own claims — the conversation.
const shelf = async (h) => { for (let i = 0; i < 25; i++) { if ((await h.count(".aw-tap")) > 0) return true; await h.wait(200); } return false; };
const openFirst = async (h) => {
  if (!(await shelf(h))) return false;
  await h.tap(".aw-tap"); await h.wait(500);
  for (let i = 0; i < 20; i++) { if ((await h.count("[data-chat]")) > 0) return true; await h.wait(200); }
  return false;
};
const untilNoPending = async (h) => { for (let i = 0; i < 40; i++) { if ((await h.count("[data-pending]")) === 0) return true; await h.wait(150); } return false; };

export default [
  {
    name: "полиця показує людей із фото і тегом, не порожній екран", run: async (h) => {
      h.expect(await shelf(h), "полиця не змонтувалася");
      h.expect((await h.count(".aw-tap")) >= 5, `на полиці лише ${await h.count(".aw-tap")} карток`);
      h.expect(/Шерлок Холмс|Sherlock Holmes/.test(await h.bodyText()), "першої особи фікстури немає на полиці");
    },
  },
  {
    name: "картка відкриває розмову; Back закриває її, а не застосунок", run: async (h) => {
      h.expect(await openFirst(h), "розмова не відкрилася з картки");
      h.expect((await h.count("[data-intro]")) === 1, "немає картки-вступу з портретом і історією");
      h.expect((await h.count("[data-composer]")) === 1, "немає поля вводу");
      await h.back(); await h.wait(300);
      h.expect((await h.count('[role="dialog"]')) === 0, "Back не закрив розмову");
      h.expect((await h.count(".aw-tap")) > 0, "Back вийшов замість повернутися на полицю");
    },
  },
  {
    name: "надіслане повідомлення з'являється праворуч і отримує відповідь потоком", run: async (h) => {
      h.expect(await openFirst(h), "розмова не відкрилася");
      for (let i = 0; i < 20; i++) { if ((await h.count("[data-msg]")) > 0 || (await h.count("[data-opener]")) > 0) break; await h.wait(150); }
      const before = await h.count("[data-msg='assistant']");
      await h.type("[data-input]", "Де мої ключі?"); await h.wait(100);
      await h.tap("[data-send]"); await h.wait(200);
      h.expect((await h.count("[data-msg='user']")) >= 1, "репліка користувача не з'явилася");
      h.expect(await untilNoPending(h), "відповідь так і лишилася в очікуванні");
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
      // the second person has no fixture thread → the openers must show
      await h.tap('.aw-tap[aria-label*="Кало"], .aw-tap[aria-label*="Kahlo"]'); await h.wait(500);
      for (let i = 0; i < 20; i++) { if ((await h.count("[data-opener]")) > 0) break; await h.wait(150); }
      h.expect((await h.count("[data-opener]")) === 3, `входів у розмову ${await h.count("[data-opener]")}, а не три`);
      await h.tap("[data-opener='openerWho']"); await h.wait(200);
      h.expect((await h.count("[data-opener]")) === 0, "входи лишилися після першої репліки");
      h.expect(await untilNoPending(h), "відповідь на вхід не прийшла");
      h.expect((await h.count("[data-new-chat]")) === 1, "немає кнопки «Почати заново»");
      await h.tap("[data-new-chat]"); await h.wait(200);
      h.expect((await h.count("[data-msg]")) === 0, "«Почати заново» не очистило нитку");
      h.expect((await h.count("[data-opener]")) === 3, "після «Почати заново» входи не повернулися");
    },
  },
];
