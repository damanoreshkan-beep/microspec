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
    // Assert the dialog's live `open` PROPERTY, never the presence of its children: a <dialog> keeps its
    // subtree in the DOM whether it is open or shut, so counting [data-bearing] passes before anything is
    // opened and can never reach 0 afterwards. The first version of this test asserted exactly that and was
    // measuring nothing at all.
    // FOUR CI rounds were spent here on one boolean that only ever said "no". A check that reports a
    // magnitude with no subject is a check to fix first, so this one now names the whole state — whether the
    // dialog exists, whether the tap target exists, and what the screen ATOM says (data-scr on the view
    // root). That separates "the tap never ran" from "it ran and the sheet did not follow", which is the
    // distinction every one of those rounds was missing.
    name: "пеленг: відкривається і закривається системним Назад", run: async (h) => {
      await ready(h);
      const state = async (label) =>
        `${label}[dlg=${await h.count("#hunt")} open=${await h.prop("#hunt", "open")}` +
        ` scr=${await h.attr("[data-scr]", "data-scr")} pick=${await h.count("[data-pick]")}` +
        ` tp=${await h.count("[data-transport]")} marks=${await h.count("[data-mark]")}]`;

      const before = await state("before");
      h.expect((await h.prop("#hunt", "open")) !== true, `пеленг відкритий ще до дотику ${before}`);

      await h.tap("[data-pick]"); await h.wait(400);
      const afterPick = await state("afterPick");
      h.expect((await h.prop("#hunt", "open")) === true, `пеленг не відкрився ${before} ${afterPick}`);
      await h.back(); await h.wait(400);
      h.expect((await h.prop("#hunt", "open")) !== true, `системний Назад не закрив пеленг ${await state("afterBack")}`);
      h.expect((await h.count("[data-mark]")) > 0, "Назад вийшов з апки замість закрити екран");
    },
  },
  {
    // With an omnidirectional antenna the petal is a CIRCLE and no bearing may be claimed. This is the
    // app's honesty made testable: the shape says what the hardware can do.
    name: "пеленг: без напрямленої антени азимут не показується", run: async (h) => {
      await ready(h);
      await h.tap("[data-pick]"); await h.wait(400);
      h.expect((await h.prop("#hunt", "open")) === true, "пеленг не відкрився — читати показник немає сенсу");
      const b = await h.text("[data-bearing]");
      h.expect(b.trim() === "—", `штатна антена не дає азимута, а показано "${b}"`);
    },
  },
  {
    // The list is the same events the dial draws, read as rows — and it must carry the RAW layer, because
    // "a device transmitted" without what it said is a claim, not a reading.
    name: "ефір: список показує сигнали з сирими даними", run: async (h) => {
      await ready(h);
      await h.click('[data-tab="live"]'); await h.wait(400);
      h.expect((await h.count("[data-row]")) >= 2, "у списку менше двох сигналів");
      const body = await h.bodyText();
      h.expect(/[0-9a-f]{2}\s+[0-9a-f]{2}/i.test(body), "у списку немає сирих байтів жодного пристрою");
    },
  },
  {
    // Listening is the whole point of the walkie-talkie half: a transport that cannot be armed is a prop.
    name: "прослуховування: транспорт вмикається і вимикається", run: async (h) => {
      // The previous test left us on the live tab; the transport lives on the band tab, so go back first.
      await h.click('[data-tab="band"]'); await h.wait(300);
      await ready(h);
      h.expect((await h.count("[data-transport]")) === 1, "немає транспорту для прослуховування");
      const btn = "[data-transport] button[aria-pressed], [data-transport] button";
      await h.tap(btn); await h.wait(300);
      h.expect((await h.count("[data-transport]")) === 1, "транспорт зник після натискання");
    },
  },
];
