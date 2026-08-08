// Sonar — the gate has no speaker and no microphone, so the view runs a DETERMINISTIC synthetic spectrum
// (view.js `gateFrame`): a still room long enough to calibrate, then a hand crossing the beam, frozen 25
// frames into a wave. Every assertion below therefore measures the POPULATED, moving screen — the state a
// real room only reaches with a hand in front of the phone. Capture itself is structure only: permission
// prompts, an oscillator and a live analyser cannot exist headless.
const ready = async (h) => {
  for (let i = 0; i < 20; i++) { if ((await h.count("[data-live]")) > 0) break; await h.wait(250); }
};

export default [
  {
    name: "кімната: живе читання, стан «Рух», метрики, транспорт", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-live]")) >= 1, "немає живого читання");
      h.expect((await h.count("canvas")) === 1, "немає водоспаду");
      h.expect((await h.count("#play")) === 1, "немає транспорту");
      h.expect((await h.count("[data-cal]")) === 1, "немає перекалібрування");
      const body = await h.bodyText();
      // the frozen gate frame is mid-wave and decisive, so the screen must say motion AND name a direction
      h.expect(/Рух|Motion/i.test(body), `гейт показує не рух: ${body.slice(0, 120)}`);
      h.expect(/Наближається|Approaching/i.test(body), "напрямок не названо, хоча кадр однозначний");
      // the signal metric is a real number from analyzeFrame, not a placeholder
      h.expect(/-?\d+\.\d/.test(await h.text("[data-live]")), "метрика сигналу порожня");
    },
  },
  {
    name: "транспорт спиняє прослуховування і вмикає знову", run: async (h) => {
      await ready(h);
      h.expect((await h.attr("#play", "data-playing")) === "true", "гейт має слухати одразу");
      await h.tap("#play"); await h.wait(250);
      h.expect((await h.attr("#play", "data-playing")) !== "true", "не спинилось");
      h.expect(/Не слухає|Idle/i.test(await h.bodyText()), "стан не став «не слухає»");
      await h.tap("#play"); await h.wait(400);
      h.expect((await h.attr("#play", "data-playing")) === "true", "не запустилось знову");
      h.expect((await h.count("[data-live]")) >= 1, "після перезапуску немає читання");
    },
  },
  {
    name: "журнал: події, напрямок, видалення", run: async (h) => {
      await h.click('[data-tab="log"]'); await h.wait(300);
      h.expect((await h.count("[data-event]")) === 3, "гейт має три записи руху");
      const body = await h.bodyText();
      h.expect(/дБ|dB/i.test(body), "запис не показує піковий сигнал");
      h.expect(/с$|с\b|\ss\b/i.test(body) || /\d+\.\d/.test(body), "запис не показує тривалість");
      await h.tap("[data-del]"); await h.wait(300);
      h.expect((await h.count("[data-event]")) === 2, "видалення не прибрало саме один запис");
    },
  },
  {
    name: "журнал: очищення — конфірм, і Back його закриває", run: async (h) => {
      await h.click('[data-tab="log"]'); await h.wait(300);
      await h.tap("[data-clear]"); await h.wait(300);
      h.expect((await h.prop("#confirm", "open")) === true, "конфірм не відкрився");
      await h.back(); await h.wait(300);
      h.expect((await h.prop("#confirm", "open")) !== true, "Back не закрив конфірм");
    },
  },
  {
    name: "сигнал: несуча перемикається, діагностика справжня", run: async (h) => {
      await h.click('[data-tab="signal"]'); await h.wait(300);
      h.expect((await h.count("[data-carrier]")) === 3, "немає трьох несучих");
      h.expect((await h.count("[data-macro]")) === 1, "немає гучності");
      h.expect((await h.attr('[data-carrier="19000"]', "aria-pressed")) === "true", "19 kHz не обрана за замовчуванням");
      await h.tap('[data-carrier="18000"]'); await h.wait(300);
      h.expect((await h.attr('[data-carrier="18000"]', "aria-pressed")) === "true", "несуча не перемкнулась");
      await h.tap('[data-carrier="19000"]'); await h.wait(300);
      const body = await h.bodyText();
      h.expect(/32768/.test(body), "не показано розмір FFT");
      h.expect(/AEC/.test(body), "не показано стан обробки мікрофона");
      // the honesty panel is a contract with the user, not decoration: it must survive a refactor
      h.expect(/м\/с|m\/s/i.test(body), "немає застереження про швидкість");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(200);
      await h.click('[data-loc="en"]'); await h.wait(300);
      await h.click('[data-tab="signal"]'); await h.wait(300);
      h.expect(/Carrier|Volume|Measured/i.test(await h.bodyText()), "не EN");
      await h.click('[data-tab="me"]'); await h.wait(200);
      await h.click('[data-loc="uk"]'); await h.wait(300);
      h.expect(/Мова|Тема/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="room"]'); await h.wait(300);
    },
  },
  {
    name: "PWA: профіль → модалка встановлення, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(200);
      await h.click("#p-install"); await h.wait(200);
      h.expect((await h.prop("#install", "open")) === true, "модалка не відкрилась");
      await h.back(); await h.wait(250);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив");
    },
  },
];
