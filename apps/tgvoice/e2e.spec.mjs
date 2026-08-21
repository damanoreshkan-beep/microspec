// Under the gate the engine and network are mocked (stt.js returns a fixed Ukrainian transcript), so the
// screen opens on a POPULATED result — that is what the shots review and what these assertions read.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-transcript]")) > 0) break; await h.wait(400); } };

export default [
  {
    name: "розшифровка: результат показано + мовний перемикач + дії", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-transcript]")) === 1, "немає розшифровки на екрані");
      h.expect((await h.count('[data-lang="auto"]')) === 1, "немає перемикача мови (Авто)");
      h.expect((await h.count("[data-copy]")) === 1, "немає кнопки копіювання");
      h.expect((await h.count("[data-share]")) === 1, "немає кнопки поділитися");
    },
  },
  {
    name: "нова: очищає результат і показує порожній стан з вибором файлу", run: async (h) => {
      await ready(h);
      await h.tap("[data-again]"); await h.wait(200);
      h.expect((await h.count("[data-empty]")) === 1, "не показано порожній стан після «Нова»");
      h.expect((await h.count("[data-pick]")) === 1, "немає кнопки вибору файлу в порожньому стані");
      h.expect((await h.count("[data-transcript]")) === 0, "розшифровка не зникла");
    },
  },
  {
    name: "мова: фіксований вибір ховає рядок «Розпізнано», Авто показує", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-detected]")) === 1, "Авто має показувати визначену мову");
      await h.tap('[data-lang="uk"]'); await h.wait(200);
      h.expect((await h.count("[data-detected]")) === 0, "фіксована мова не має показувати «Розпізнано»");
    },
  },
];
