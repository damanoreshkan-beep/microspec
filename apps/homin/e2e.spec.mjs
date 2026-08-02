// homin — the gate has no radio, so radio.worker.js is fed deterministic BYTES by /_rt/fixture433.js and the
// real pipeline runs on them. These assertions therefore exercise the shipped DSP path, not a stub.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-mark]")) > 0) break; await h.wait(200); } };

export default [
  {
    name: "смуга: циферблат показує сигнали на своїх каналах", run: async (h) => {
      await ready(h);
      h.expect((await h.count("svg[data-live]")) === 1, "немає циферблата з живими даними");
      h.expect((await h.count("[data-mark]")) >= 2, "на циферблаті менше двох сигналів");
      // Angle is FREQUENCY, so a device and a voice must be drawn differently — colour is the only thing
      // carrying that distinction, and a dial where everything looks alike is not readable.
      h.expect((await h.count('[data-kind="burst"]')) >= 1, "жодного сигналу пристрою (OOK)");
      h.expect((await h.count('[data-kind="voice"]')) >= 1, "жодного голосового сигналу");
    },
  },
  {
    // The routing invariant: every dismissable screen is history-backed, so system Back closes it and never
    // exits the app.
    name: "пеленг: відкривається і закривається системним Назад", run: async (h) => {
      await ready(h);
      await h.tap("[data-pick]");
      await h.wait(400);
      h.expect((await h.count("[data-bearing]")) === 1, "пеленг не відкрився");
      await h.back();
      await h.wait(400);
      h.expect((await h.count("[data-bearing]")) === 0, "системний Назад не закрив пеленг");
      h.expect((await h.count("[data-mark]")) > 0, "Назад вийшов з апки замість закрити екран");
    },
  },
  {
    // With an omnidirectional antenna the petal is a CIRCLE and no bearing may be claimed. This is the
    // app's honesty made testable: the shape says what the hardware can do.
    name: "пеленг: без напрямленої антени азимут не показується", run: async (h) => {
      await ready(h);
      await h.tap("[data-pick]");
      await h.wait(400);
      const b = await h.text("[data-bearing]");
      h.expect(b.trim() === "—", `штатна антена не дає азимута, а показано "${b}"`);
    },
  },
];
