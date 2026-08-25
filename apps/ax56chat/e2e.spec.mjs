// ax56chat — the gate seeds a populated room; test the message list, sending, and leave -> join.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-msg]")) > 0) break; await h.wait(200); } };

export default [
  {
    name: "seeded room renders messages + composer", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-msg]")) >= 4, "no seeded messages");
      h.expect((await h.count("[data-list]")) === 1, "no message list");
      h.expect((await h.count("[data-send]")) === 1, "no composer");
      h.expect((await h.count("[data-leave]")) === 1, "no leave control");
    },
  },
  {
    name: "sending adds a message", run: async (h) => {
      await ready(h);
      const before = await h.count("[data-msg]");
      await h.type("[data-draft]", "copy that, moving out");
      await h.tap("[data-send]"); await h.wait(250);
      h.expect((await h.count("[data-msg]")) > before, "message not added");
    },
  },
  {
    name: "leave returns to the join screen", run: async (h) => {
      await ready(h);
      await h.tap("[data-leave]"); await h.wait(200);
      h.expect((await h.count("[data-join]")) === 1, "did not return to join");
      h.expect((await h.count("[data-room]")) === 1, "no room field on join");
    },
  },
];
