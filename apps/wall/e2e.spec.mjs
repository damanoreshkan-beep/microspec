// The gate has no server socket, so view.js seeds a LIVE board on mount: an address, watchers, and terminal
// text. These poll on that populated state and the join-QR path, which read the same in both locales.
export default [
  {
    name: "the board is live on mount — an address, watchers, and a terminal you can type in",
    async run(h) {
      await h.waitFor(/192\.168\.1\.42:8080/);
      h.expect((await h.count("[data-board]")) === 1, "немає дошки-терміналу");
      h.expect(/broadcast/.test(await h.text("[data-board]")), "дошка не показує засіяний текст");
      // The address is on the face of the bar, not hidden behind a probe.
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
