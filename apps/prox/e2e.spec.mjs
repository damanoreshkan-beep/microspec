export default [
  {
    name: "the grid is the taxonomy — eight protocols, most of them live",
    async run(h) {
      await h.waitFor(/Swift Pair/);
      const cards = await h.count("[data-card]");
      h.expect(cards === 8, `очікував 8 карток таксономії, знайшов ${cards}`);
      const live = await h.count('[data-card][data-live="1"]');
      h.expect(live >= 5, `засіяний ефір мав засвітити картки, живих ${live}`);
      h.expect(/\d/.test(await h.text("[data-scanner]")), "індикатор не показує число пакетів");
    },
  },
  {
    name: "the honest verdict is on the face of the grid — free vs fixed vs none",
    async run(h) {
      await h.waitFor(/Swift Pair/);
      h.expect((await h.count('[data-grid] [data-kind="free"]')) === 2, "мало би бути рівно 2 картки зі свобідним текстом");
      h.expect((await h.count('[data-grid] [data-kind="fixed"]')) === 1, "Nearby Action має бути єдиним фіксованим");
    },
  },
  {
    name: "a live card opens its byte decode, and Back closes it",
    async run(h) {
      await h.waitFor(/Swift Pair/);
      await h.tap('[data-card="swiftPair"]');
      await h.wait(200);
      await h.waitFor(/тук тук/);
      h.expect((await h.count("[data-decode]")) === 1, "деталь не показала байтовий розбір");
      h.expect((await h.count("[data-custom]")) === 1, "деталь не показала відповідь «свій напис?»");
      await h.back();
      await h.wait(200);
      h.expect((await h.count("[data-decode]")) === 0, "Back не закрив аркуш деталі");
    },
  },
  {
    name: "a reference card still opens, and says it has not been heard",
    async run(h) {
      await h.waitFor(/Swift Pair/);
      await h.tap('[data-card="easySetup"]');   
      await h.wait(200);
      h.expect((await h.count("[data-never]")) === 1, "тиха картка не показала довідковий стан");
      h.expect((await h.count("[data-custom]")) === 1, "довідкова картка все одно має пояснити текст");
      await h.back();
      await h.wait(200);
      h.expect((await h.count("[data-never]")) === 0, "Back не закрив довідкову деталь");
    },
  },
];
