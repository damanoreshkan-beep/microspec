export default [
  {
    name: "the station is live on mount — an address, an audience, and the phrase on the poster",
    async run(h) {
      await h.waitFor(/192\.168\.1\.42:8080/);
      h.expect((await h.count("[data-poster]")) === 1, "немає плаката");
      h.expect(/Починаємо/.test(await h.text("[data-poster]")), "плакат не показує засіяну фразу");
      h.expect(/\d/.test(await h.text("[data-viewers]")), "не показано, скільки людей дивиться");
    },
  },
  {
    name: "typing rewrites the poster the room is looking at",
    async run(h) {
      await h.waitFor(/192\.168\.1\.42:8080/);
      h.expect(/Починаємо/.test(await h.prop("[data-phrase]", "value")), "поле не показує засіяну фразу");
      await h.type("[data-phrase]", "Антракт 10 хвилин");
      await h.wait(200);
      h.expect(/Антракт/.test(await h.text("[data-poster]")), "плакат не наздогнав те, що надрукували");
    },
  },
  {
    name: "the QR button opens the join sheet with a scannable code, and Back closes it",
    async run(h) {
      await h.waitFor(/192\.168\.1\.42:8080/);
      await h.tap("[data-qr]");
      await h.wait(200);
      h.expect((await h.count("[data-qrimg]")) === 1, "аркуш входу не показав QR-код");
      await h.back();
      await h.wait(200);
      h.expect((await h.count("[data-qrimg]")) === 0, "Back не закрив аркуш входу");
    },
  },
];
