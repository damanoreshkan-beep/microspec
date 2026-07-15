// GENERATED (authorless) — structural list e2e; works for any generated feed app.
const load = async (h) => { for (let i = 0; i < 24; i++) { if ((await h.count("[data-fav]")) > 0) break; await h.wait(500); } };
export default [
  { name: "стрічка вантажиться з картками", run: async (h) => { await load(h);
    h.expect((await h.count(".card")) > 3, "немає карток"); } },
  { name: "картка веде на url", run: async (h) => { await load(h);
    h.expect(/^https?:/.test(await h.attr(".card", "href")), "поганий href"); } },
  { name: "пошук звужує до 0 і відновлює", run: async (h) => { await load(h);
    const base = await h.count(".card"); await h.type("#filter", "zzzzнемає"); await h.wait(250);
    h.expect((await h.count(".card")) < base, "пошук не звузив");
    await h.type("#filter", ""); await h.wait(250);
    h.expect((await h.count(".card")) >= base, "не відновив"); } },
  { name: "збереження: закладка → Збережені", run: async (h) => { await load(h);
    await h.click("[data-fav]"); await h.wait(150); await h.click('[data-tab="saved"]'); await h.wait(200);
    h.expect((await h.count("[data-fav]")) >= 1, "не зберігся"); await h.click('[data-tab="feed"]'); await h.wait(120); } },
  { name: "i18n EN/UA", run: async (h) => {
    await h.click('[data-tab="me"]'); await h.wait(150); await h.click('[data-loc="en"]'); await h.wait(250);
    h.expect(/Language|Saved/i.test(await h.bodyText()), "не EN");
    await h.click('[data-loc="uk"]'); await h.wait(250); h.expect(/Мова|Збережені/.test(await h.bodyText()), "не UA");
    await h.click('[data-tab="feed"]'); await h.wait(120); } },
  { name: "PWA: install-модалка, Back закриває", run: async (h) => {
    await h.click('[data-tab="me"]'); await h.wait(150); await h.click("#p-install"); await h.wait(150);
    h.expect((await h.prop("#install", "open")) === true, "не відкрилась");
    await h.back(); await h.wait(200); h.expect((await h.prop("#install", "open")) !== true, "Back не закрив"); } },
];
