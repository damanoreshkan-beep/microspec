// The bridge does not exist in Chromium, so the gate mocks it from the same catalogue the app renders
// from. That is the point: without it every row would read "needs the app", the screen would be empty of
// anything meaningful, and a broken row would be invisible in the shot as well as in the test.
export default [
  {
    name: "matrix: every catalogue action gets a row, and the bridge reads as connected", run: async (h) => {
      const rows = await h.count("[data-action]");
      h.expect(rows >= 6, `очікував рядок на кожну дію каталогу, знайшов ${rows}`);
      const bridge = await h.text("[data-bridge]");
      h.expect(/bridge \d+/i.test(bridge), `панель мосту не показує версію: ${bridge}`);
      // The catalogue is grouped by capability, so the three that exist at bridge 1 must all be named.
      const body = await h.bodyText();
      for (const cap of ["system", "notify", "alarm"]) h.expect(body.includes(cap), `немає групи ${cap}`);
    },
  },
  {
    name: "probe: running an action records a result and a duration", run: async (h) => {
      await h.click('[data-run="alarm.set"]'); await h.wait(250);
      const out = (await h.text('[data-result="alarm.set"]')).trim();
      h.expect(out.length > 0, "проба не записала результат");
      // alarm.set must say whether the alarm is EXACT — a screen promising a time cannot hide that.
      h.expect(/exact|inexact/i.test(out), `результат не повідомляє точність: ${out}`);
      await h.click('[data-run="alarm.list"]'); await h.wait(250);
      h.expect((await h.text('[data-result="alarm.list"]')).trim().length > 0, "alarm.list без результату");
    },
  },
  {
    name: "run all: one press walks the whole checklist and tallies it", run: async (h) => {
      await h.click("#run-all"); await h.wait(900);
      const tally = (await h.text("[data-tally]")).trim();
      h.expect(/\d+\s*\/\s*\d+/.test(tally), `лічильник не показує прогін: ${tally}`);
      const results = await h.count("[data-result]");
      h.expect(results >= 6, `очікував результат на кожну дію, знайшов ${results}`);
    },
  },
  {
    name: "launcher: every permission is a tile, and a tile carries its state", run: async (h) => {
      const tiles = await h.count("[data-perm]");
      h.expect(tiles >= 6, `очікував плитку на кожен дозвіл реєстру, знайшов ${tiles}`);
      // The state lives on the tile, not in a caption — the grid must never explain itself in words.
      // Assert the attribute EXISTS on every tile rather than reading dataset: a DOMStringMap does not
      // survive serialisation, so the previous version tested the bridge to the browser, not the app.
      const stated = await h.count("[data-perm][data-state]");
      h.expect(stated === tiles, `${tiles - stated} плитк(и) без стану`);
      // The OS has a way back to where its apps come from.
      h.expect((await h.count("[data-store]")) === 1, "немає плитки магазину");
    },
  },
  {
    name: "radar: the subscribe a checklist cannot run, exercised by a screen that listens", run: async (h) => {
      await h.click(String.raw`[data-tab="radar"]`); await h.wait(300);
      h.expect((await h.count("[data-radar]")) === 1, "радар не намальовано");
      // The gate seeds a fixed field, because an empty radar photographs as a broken one.
      const devs = await h.count("[data-dev]");
      h.expect(devs >= 5, `очікував засіяне поле пристроїв, знайшов ${devs}`);
      // Stopping must be reachable: a scan left running costs battery behind a screen nobody watches.
      h.expect((await h.count("#radar-toggle")) === 1, "немає кнопки сканування");
      await h.click(String.raw`[data-tab="caps"]`); await h.wait(120);
    },
  },
  {
    name: "alarms: the shell owns the list, and scheduling reads it back", run: async (h) => {
      await h.click('[data-tab="alarms"]'); await h.wait(250);
      // The gate mock returns one pending alarm, so the tab must render it rather than the empty state.
      h.expect((await h.count("[data-alarm]")) >= 1, "список запланованого порожній під гейтом");
      h.expect((await h.count("[data-alarm-empty]")) === 0, "показано порожній стан попри наявний будильник");
      await h.click('[data-min="15"]'); await h.wait(120);
      h.expect((await h.prop('[data-min="15"]', "ariaPressed")) === "true", "вибір інтервалу не тримається");
      await h.click("#al-set"); await h.wait(300);
      h.expect((await h.count("[data-alarm]")) >= 1, "після постановки список зник");
      await h.click('[data-tab="caps"]'); await h.wait(120);
    },
  },
  {
    name: "report: reading the device fills the table", run: async (h) => {
      await h.click('[data-tab="report"]'); await h.wait(150);
      await h.click("#rep-load"); await h.wait(250);
      const text = await h.text("[data-report]");
      h.expect(/sdk/i.test(text) && /model/i.test(text), "звіт без sdk/model");
      h.expect(/\d/.test(text), "у звіті немає жодного числа — system.info не відповів");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Capabilities|Report|Language/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Можливості|Звіт|Мова/.test(await h.bodyText()), "не UA");
    },
  },
  {
    name: "routing: permissions screen opens and Back closes it", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click("#p-perms"); await h.wait(200);
      h.expect((await h.count('[role="dialog"]')) === 1, "екран дозволів не відкрився");
      await h.back(); await h.wait(250);
      h.expect((await h.count('[role="dialog"]')) === 0, "Back не закрив екран дозволів");
      await h.click('[data-tab="caps"]'); await h.wait(120);
    },
  },
];
