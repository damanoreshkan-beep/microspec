// The gate has no GitHub and no session, so /_rt/auth.js seeds a deterministic one (MOCK_REPOS / MOCK_RUNS /
// MOCK_JOBS) — three repositories, one of them failing. That fixture is the whole point: the shot must show a
// board with something WRONG on it, because a failing row is the row this app exists for.
const ready = async (h) => { for (let i = 0; i < 24; i++) { if ((await h.count("[data-repo]")) > 0) break; await h.wait(400); } };

export default [
  {
    name: "дошка: репозиторії, стан останнього запуску, червоні зверху", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-repo]")) === 3, "немає трьох репозиторіїв");
      // The board's one real decision: a failing repository is pulled to the top, because hunting for the red
      // row in a time-sorted list is exactly what makes the GitHub app annoying on a phone.
      const first = await h.attr("[data-repo]", "data-repo");
      h.expect(first === "octocat/microspec", `червоний репозиторій не зверху: ${first}`);
      h.expect(/1|Needs attention|Потребує уваги/.test(await h.bodyText()), "немає підсумку про падіння");
    },
  },
  {
    name: "занурення: репо → запуски → роботи, і Back виводить назад по одному рівню", run: async (h) => {
      await ready(h);
      await h.tap('[data-repo="octocat/microspec"]'); await h.wait(400);
      h.expect((await h.count("[data-run]")) === 3, "не показались запуски репозиторію");

      await h.tap("[data-run]"); await h.wait(400);
      h.expect((await h.count("[data-step]")) > 0, "не показались кроки робіт");

      // The routing invariant: every level is one history entry, so system Back walks out of the dive rather
      // than out of the app.
      await h.back(); await h.wait(300);
      h.expect((await h.count("[data-run]")) === 3, "Back не повернув до списку запусків");
      await h.back(); await h.wait(300);
      h.expect((await h.count("[data-repo]")) === 3, "Back не повернув до дошки");
    },
  },
  {
    name: "кнопка назад у шапці робить те саме, що системна", run: async (h) => {
      await ready(h);
      await h.tap('[data-repo="octocat/microspec"]'); await h.wait(400);
      h.expect((await h.count("[data-back]")) === 1, "немає кнопки назад");
      await h.tap("[data-back]"); await h.wait(300);
      h.expect((await h.count("[data-repo]")) === 3, "кнопка назад не повернула на дошку");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Board|Language|Account/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Збірки|Мова|Акаунт/i.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="board"]'); await h.wait(150);
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
