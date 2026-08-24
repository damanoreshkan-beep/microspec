// AX56 bring-up viewer. Headless has no adapter, so the view runs in demo mode (gate): startDemo({instant})
// seeds the booted end state — full register lattice, all six bring-up stages lit. These cases exercise the
// lattice, the stage stepper, the register readout, the mode badge, i18n and the PWA modal.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-lattice]")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "чип: ґратка, шість стадій, прошивка завантажена", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-lattice]")) === 1, "немає ґратки регістрів");
      h.expect((await h.count("[data-stages]")) === 1, "немає stepper бринг-апу");
      h.expect((await h.count("[data-stage]")) === 6, "немає шести стадій");
      h.expect((await h.attr("[data-stages]", "data-done")) === "6", "не всі стадії пройдені у демо");
      h.expect((await h.count("[data-booted]")) === 1, "немає стану firmware booted");
      h.expect((await h.attr("[data-mode]", "data-mode")) === "demo", "режим не demo");
      h.expect(/0x[0-9A-F]{4}/.test(await h.bodyText()), "немає читання регістрів");
    },
  },
  {
    name: "cut та readout показані", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-cut]")) === 1, "немає бейджа ревізії");
      h.expect((await h.count("[data-readout]")) === 1, "немає рядка readout");
      h.expect(/0x[0-9A-F]{8}/.test(await h.bodyText()), "readout без 32-бітного значення");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      await h.click('[data-tab="chip"]'); await h.wait(200);
      h.expect(/Firmware|Live|Demo|Register/i.test(await h.bodyText()), "не EN");
      await h.click('[data-tab="me"]'); await h.wait(120);
      await h.click('[data-loc="uk"]'); await h.wait(250);
      await h.click('[data-tab="chip"]'); await h.wait(200);
      h.expect(/Прошивк|Наживо|Демо|Ревізія|Ґратка/.test(await h.bodyText()), "не UA");
    },
  },
  {
    name: "PWA: профіль → модалка, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click("#p-install"); await h.wait(150);
      h.expect((await h.prop("#install", "open")) === true, "модалка не відкрилась");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив");
    },
  },
];
