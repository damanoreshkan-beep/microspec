export default [
  {
    name: "the board is live on mount — an address, watchers, and a terminal you can type in",
    async run(h) {
      await h.waitFor(/192\.168\.1\.42:8080/);
      h.expect((await h.count("[data-board]")) === 1, "немає дошки-терміналу");
      h.expect(/broadcast/.test(await h.prop("[data-board]", "value")), "дошка не показує засіяний текст");
      h.expect(/192\.168/.test(await h.text("[data-bar]")), "панель не показує LAN-адресу");
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
