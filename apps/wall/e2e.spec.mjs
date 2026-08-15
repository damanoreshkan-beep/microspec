// The gate has no LAN socket, so view.js seeds the LIVE station on mount: an address, an audience and a
// phrase already on the wall. These poll that populated state, the typing path, and the join sheet.
// The address is NOT on the main screen (it lives in the join sheet), so the tests wait for the phrase.
export default [
  {
    name: "the station is live on mount — an address, an audience, and the phrase on the poster",
    async run(h) {
      await h.waitFor(/Починаємо/);
      h.expect((await h.count("[data-poster]")) === 1, "немає плаката");
      h.expect(/Починаємо/.test(await h.text("[data-poster]")), "плакат не показує засіяну фразу");
      // The head count is derived from the request rate, never the raw hit counter.
      h.expect(/\d/.test(await h.text("[data-viewers]")), "не показано, скільки людей дивиться");
    },
  },
  {
    // The owner's screen IS the room's screen: the stage takes the whole view and the phrase gets most of the
    // stage. Overflow gates are one-sided (too big fails, too small never does), so the SHARE is asserted.
    name: "the stage fills the view and the phrase gets the stage",
    async run(h) {
      await h.waitFor(/Починаємо/);
      const view = await h.prop("#view", "clientHeight");
      const stage = await h.prop("[data-stage]", "clientHeight");
      const box = await h.prop("[data-fitbox]", "clientHeight");
      h.expect(stage / view >= 0.85, `сцена займає ${Math.round(stage / view * 100)}% екрана, треба ≥85%`);
      h.expect(box / stage >= 0.5, `плакат отримує ${Math.round(box / stage * 100)}% сцени, треба ≥50%`);
    },
  },
  {
    name: "typing rewrites the poster the room is looking at",
    async run(h) {
      await h.waitFor(/Починаємо/);
      // A textarea's content is its .value, not textContent — read the property.
      h.expect(/Починаємо/.test(await h.prop("[data-phrase]", "value")), "поле не показує засіяну фразу");
      await h.type("[data-phrase]", "Антракт 10 хвилин");
      await h.wait(200);
      h.expect(/Антракт/.test(await h.text("[data-poster]")), "плакат не наздогнав те, що надрукували");
    },
  },
  {
    name: "the QR button opens the join sheet with a scannable code, and Back closes it",
    async run(h) {
      await h.waitFor(/Починаємо/);
      await h.tap("[data-qr]");
      await h.wait(200);
      h.expect((await h.count("[data-qrimg]")) === 1, "аркуш входу не показав QR-код");
      await h.back();
      await h.wait(200);
      h.expect((await h.count("[data-qrimg]")) === 0, "Back не закрив аркуш входу");
    },
  },
];
