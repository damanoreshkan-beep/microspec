// The Book of Changes casts under the gate from a FIXED line set (GATE_LINES) and a fixed journal
// (GATE_ROWS), so the populated screen renders with no interaction and no randomness. Under the gate the
// ceremony is INSTANT (no shuffle, no typewriter) and the answer is the fixed GATE_READING — so every
// answer's TEXT is identical, and the dedupe branch is proven by STATE instead: [data-asked]/[data-recast]
// appear only when a known question replayed its journal entry (g1 carries an old day on purpose).
const ready = async (h) => { for (let i = 0; i < 15; i++) { if ((await h.count("[data-reading]")) > 0) break; await h.wait(200); } };

export default [
  {
    name: "кидання: гексаграма, триграми, номер", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-reading]")) === 1, "немає кинутої гексаграми");
      h.expect((await h.count("[data-line]")) === 6, "гексаграма має рівно шість ліній");
      const n = (await h.text("[data-number]")).trim();
      h.expect(/^\d{1,2}$/.test(n) && +n >= 1 && +n <= 64, `номер гексаграми поза 1..64: ${n}`);
      h.expect((await h.count("[data-ask]")) === 1, "немає входу в церемонію питання");
    },
  },
  {
    // The fixed cast has two moving lines (9 at the bottom, 6 in the middle), so the change block must
    // show a second hexagram. A cast with no moving lines must NOT — that is asserted in the unit tests,
    // where a fixture can be chosen freely.
    name: "рухомі лінії дають другу гексаграму", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-change]")) === 1, "немає блоку зміни");
      h.expect((await h.count('[data-moving="1"]')) === 2, "очікувалось дві рухомі лінії у фіксованому киданні");
    },
  },
  {
    // The odds are the app's whole reason to exist: the two methods are different distributions, so the
    // displayed ratio MUST change when the method does.
    name: "зміна методу змінює показані шанси", run: async (h) => {
      await ready(h);
      const before = await h.text("[data-odds]");
      await h.tap('[data-method="coins"]'); await h.wait(250);
      const after = await h.text("[data-odds]");
      h.expect(before !== after, "шанси не змінились при перемиканні методу");
      h.expect((await h.attr('[data-method="coins"]', "aria-pressed")) === "true", "обраний метод без aria-pressed");
      await h.tap('[data-method="yarrow"]'); await h.wait(200);
      h.expect((await h.text("[data-odds]")) === before, "шанси не повернулись до стебел");
    },
  },
  {
    name: "церемонія: відкривається, Back закриває", run: async (h) => {
      await ready(h);
      await h.tap("[data-ask]"); await h.wait(300);
      h.expect((await h.prop("#ask", "open")) === true, "церемонія не відкрилась");
      h.expect((await h.count("#question")) === 1, "немає поля питання");
      await h.back(); await h.wait(250);
      h.expect((await h.prop("#ask", "open")) !== true, "Back не закрив церемонію");
    },
  },
  {
    // A FRESH question: cast → the answer renders (instant under the gate), and neither the replay marks
    // nor the recast button may appear — the entry was made today.
    name: "нове питання: кидок і відповідь, без перекидання", run: async (h) => {
      await ready(h);
      await h.tap("[data-ask]"); await h.wait(300);
      await h.type("#question", "Нове питання про дорогу");
      await h.tap("[data-cast]"); await h.wait(400);
      h.expect((await h.count("[data-answer-text]")) === 1, "відповідь не зʼявилась");
      h.expect((await h.text("[data-answer-text]")).trim().length > 40, "відповідь порожня");
      h.expect((await h.count("[data-asked]")) === 0, "свіжий кидок позначено як повтор");
      h.expect((await h.count("[data-recast]")) === 0, "перекидання доступне для сьогоднішнього кидка");
      await h.tap("[data-ask-done]"); await h.wait(250);
      h.expect((await h.prop("#ask", "open")) !== true, "закриття не закрило церемонію");
    },
  },
  {
    // A KNOWN question (g1 in the gate journal, cast on an OLD day): the entry replays — the hexagram is
    // g1's (40), the replay date shows, and the once-a-day recast button is offered.
    name: "повторне питання: та сама відповідь і перекидання раз на день", run: async (h) => {
      await ready(h);
      await h.tap("[data-ask]"); await h.wait(300);
      await h.type("#question", "  чи ВАРТО починати зараз ");   // normalization: case + spacing must not fork the entry
      await h.tap("[data-cast]"); await h.wait(400);
      h.expect((await h.count("[data-answer-text]")) === 1, "відповідь не зʼявилась");
      h.expect((await h.text("[data-a-number]")).trim() === "40", "повтор не повернув гексаграму запису журналу");
      h.expect((await h.count("[data-asked]")) === 1, "повтор без позначки первинного кидка");
      h.expect((await h.count("[data-recast]")) === 1, "немає кнопки перекидання для старого запису");
      await h.tap("[data-recast]"); await h.wait(400);
      h.expect((await h.count("[data-answer-text]")) === 1, "після перекидання немає відповіді");
      h.expect((await h.count("[data-recast]")) === 0, "перекидання лишилось доступним двічі на день");
      await h.back(); await h.wait(250);
    },
  },
  {
    name: "журнал: записи, відкриття запису, Back закриває", run: async (h) => {
      await h.click('[data-tab="log"]'); await h.wait(400);
      h.expect((await h.count("[data-entry]")) >= 2, "у журналі немає записів");
      h.expect((await h.count("[data-clear]")) === 1, "немає очищення журналу");
      await h.tap("[data-entry] [data-open]"); await h.wait(300);
      h.expect((await h.prop("#logsheet", "open")) === true, "запис журналу не відкрився");
      h.expect((await h.count("[data-log-text]")) === 1, "у записі немає тлумачення");
      await h.back(); await h.wait(250);
      h.expect((await h.prop("#logsheet", "open")) !== true, "Back не закрив запис журналу");
    },
  },
  {
    name: "i18n EN/UA міняє chrome", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      // Assert on strings the test is actually STANDING in front of — the profile's own labels. The first
      // version checked "Метод", which lives on the cast tab, and the dock's tab captions, which are not
      // guaranteed to be visible at every width. sonar already had this right.
      await h.click('[data-loc="en"]'); await h.wait(300);
      h.expect(/Language|Theme|Install/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(300);
      h.expect(/Мова|Тема/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="cast"]'); await h.wait(150);
    },
  },
  {
    name: "PWA: профіль → модалка встановлення, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      h.expect((await h.count("#p-install")) === 1, "немає кнопки встановлення");
      await h.click("#p-install"); await h.wait(150);
      h.expect((await h.prop("#install", "open")) === true, "модалка не відкрилась");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив модалку");
    },
  },
];
