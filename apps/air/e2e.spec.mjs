// The gate/mock uses a static sample (a "very poor" ozone day with active pollen), so the gauge,
// forecast, pollutant list and pollen list render deterministically.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-aqi]")) > 0) break; await h.wait(500); } };

export default [
  {
    name: "якість повітря: гейдж AQI + графік + забрудники", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-aqi]")) === 1, "немає індексу AQI");
      h.expect(/88/.test(await h.text("[data-aqi]")), "невірне значення AQI семплу");
      h.expect((await h.count("svg")) >= 2, "немає гейджа/графіка");
      h.expect(/PM2\.5|NO₂|O₃/i.test(await h.bodyText()), "немає забрудників");
      h.expect(/µg\/m³/.test(await h.bodyText()), "немає одиниць забрудників");
    },
  },
  {
    name: "пилок: активні види з рівнем", run: async (h) => {
      await ready(h);
      h.expect(/grains\/m³|зерен/i.test(await h.bodyText()), "немає одиниць пилку");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Poor|Pollen|Language|hours/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/погана|Пилок|Мова|годин/i.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="now"]'); await h.wait(120);
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
