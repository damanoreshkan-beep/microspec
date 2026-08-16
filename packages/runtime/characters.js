// microspec runtime — characters you can talk to (the edge's /feed/chars, /feed/chats, /feed/chat/stream).
//
// The client half of a stored, per-user feature: a shelf of characters (public ones + the user's own), the
// user's conversations, and a streaming reply. Everything but the stream rides the sealed tunnel like every
// other call to VPS_PROXY; the stream cannot (an SSE body is not one envelope) and is the one route on the
// PLAIN list in sealedfetch.js — TLS + origin + session, like /feed/gh/*.
//
// GATE-SAFE. Under `gate` there is no network: a fixture shelf, a fixture thread, and a stream that types a
// fixture reply on a timer — so the shot and the e2e see a POPULATED conversation, not a composer over
// nothing (the empty state is the one screen nobody should be judging).
import { atom } from "nanostores";
import { VPS_PROXY } from "./feed.js";
import { gate } from "./gate.js";
import { session } from "./auth.js";
import { parseSse } from "./sse.js";
export { parseSse };

const BASE = VPS_PROXY;
const sidOf = () => session.get()?.sid || null;

async function post(path, body, timeout = 20000) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(`${BASE}/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
    if (!r.ok) { const e = new Error(`${path} ${r.status}`); e.status = r.status; try { e.body = await r.json(); } catch { /* text */ } throw e; }
    return await r.json();
  } catch (e) {
    if (e && typeof e.status === "number") throw e;
    const err = new Error(`${path} network`); err.status = 0; throw err;
  } finally { clearTimeout(to); }
}

// ── the shelf ─────────────────────────────────────────────────────────────────────────────────────────────
// One atom, module-scoped: the list is fetched once per session and a character created from search is
// pushed into it, so the shelf the user returns to already has the new face without a refetch.
export const $characters = atom(null);        // null = never loaded

export async function characters({ force = false } = {}) {
  if (gate) { if (!$characters.get()) $characters.set(FIXTURE_CHARACTERS); return $characters.get(); }
  if (!force && $characters.get()) return $characters.get();
  const j = await post("chars", { ...(sidOf() ? { sid: sidOf() } : {}) });
  const list = (j?.characters || []).map(trimCharacter);
  $characters.set(list);
  return list;
}

export const trimCharacter = (c) => ({
  id: c.id, slug: c.slug, name: c.name, name_uk: c.name_uk || c.name,
  tagline: c.tagline || "", tagline_uk: c.tagline_uk || c.tagline || "",
  story: c.story || "", story_uk: c.story_uk || c.story || "",
  avatar: c.avatar_url || "", url: c.source_url || "", public: !!c.public, created_by: c.created_by ?? null,
});

/** Wikipedia candidates for a typed name — needs a session (the edge rate-limits per user). */
export async function lookup(q) {
  if (gate) return FIXTURE_CANDIDATES.filter((c) => c.title.toLowerCase().includes(String(q).toLowerCase()));
  const sid = sidOf();
  if (!sid) return [];
  const j = await post("chars/lookup", { sid, q });
  return (j?.candidates || []).map((c) => ({ key: c.key, title: c.title, description: c.description || "", thumb: c.thumb || "" }));
}

/** Create (or fetch, if it already exists) a character from a Wikipedia key. Pushes it onto the shelf. */
export async function create(key) {
  if (gate) { const c = FIXTURE_CHARACTERS[0]; return c; }
  const sid = sidOf();
  if (!sid) throw Object.assign(new Error("no session"), { status: 401 });
  const j = await post("chars/create", { sid, key }, 90000);     // Wikipedia + a model writing the card
  const c = trimCharacter(j.character);
  const cur = $characters.get() || [];
  if (!cur.some((x) => x.id === c.id)) $characters.set([c, ...cur]);
  return c;
}

// ── conversations ─────────────────────────────────────────────────────────────────────────────────────────
export async function chats() {
  if (gate) return FIXTURE_CHATS;
  const sid = sidOf();
  if (!sid) return [];
  const j = await post("chats", { sid });
  return j?.chats || [];
}

export async function chat(id) {
  if (gate) return { chat: { id, character_id: FIXTURE_CHARACTERS[0].id }, messages: FIXTURE_THREAD };
  const sid = sidOf();
  if (!sid) return null;
  return await post("chats/get", { sid, id });
}

export async function deleteChat(id) {
  if (gate) return true;
  const sid = sidOf();
  if (!sid) return false;
  const j = await post("chats/delete", { sid, id });
  return !!j?.ok;
}

// ── the stream ────────────────────────────────────────────────────────────────────────────────────────────
/**
 * send({ characterId, chatId, text }, { onMeta, onDelta, signal }) → { chatId, by, complete, text }
 * Streams the reply; resolves when the stream ends. Throws with .status on a refused request.
 */
export async function send({ characterId, chatId = null, text, locale = "en" }, { onMeta, onDelta, signal } = {}) {
  if (gate) return fixtureStream(text, locale, { onMeta, onDelta, signal, chatId });
  const sid = sidOf();
  if (!sid) throw Object.assign(new Error("no session"), { status: 401 });
  const r = await fetch(`${BASE}/chat/stream`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ sid, characterId, chatId, text, locale }), signal,
  });
  if (!r.ok || !r.body) { const e = new Error(`chat ${r.status}`); e.status = r.status; throw e; }
  const reader = r.body.getReader(), dec = new TextDecoder(), p = parseSse();
  let acc = "", meta = null, done = null, error = null;
  const handle = (ev) => {
    if (ev.event === "meta") { meta = ev.data; onMeta?.(ev.data); }
    else if (ev.event === "done") done = ev.data;
    else if (ev.event === "error") error = ev.data;
    else if (ev.data && typeof ev.data.d === "string") { acc += ev.data.d; onDelta?.(ev.data.d, acc); }
  };
  while (true) {
    const { value, done: end } = await reader.read();
    if (end) break;
    for (const ev of p.push(dec.decode(value, { stream: true }))) handle(ev);
  }
  for (const ev of p.end()) handle(ev);
  if (error && !acc) { const e = new Error(error.error || "chat failed"); e.status = 502; throw e; }
  return { chatId: meta?.chatId ?? chatId, by: done?.by ?? null, complete: !!done?.complete, text: acc, messageId: done?.messageId ?? null };
}

// ── fixtures (gate only) ──────────────────────────────────────────────────────────────────────────────────
// A deterministic shelf with the SHAPE production has: a real-looking name, a two-line tagline, a story, and
// a data-URI portrait so no shot depends on the network. Names are real public figures — the app is about
// them — the words are ours.
const portrait = (hue, initials) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450"><rect width="300" height="450" fill="hsl(${hue} 28% 22%)"/><circle cx="150" cy="170" r="70" fill="hsl(${hue} 30% 34%)"/><rect x="60" y="260" width="180" height="150" rx="60" fill="hsl(${hue} 30% 34%)"/><text x="150" y="190" text-anchor="middle" font-family="sans-serif" font-size="56" font-weight="700" fill="hsl(${hue} 20% 88%)">${initials}</text></svg>`)}`;

export const FIXTURE_CHARACTERS = [
  { id: 1, slug: "Sherlock_Holmes", name: "Sherlock Holmes", name_uk: "Шерлок Холмс", tagline: "Consulting detective, 221B Baker Street", tagline_uk: "Детектив-консультант, Бейкер-стріт, 221Б", story: "Sherlock Holmes is a fictional detective created by Arthur Conan Doyle, known for his mastery of observation and deduction.", story_uk: "Шерлок Холмс — вигаданий детектив, створений Артуром Конан Дойлом; відомий майстерністю спостереження та дедукції.", avatar: portrait(220, "SH"), url: "https://en.wikipedia.org/wiki/Sherlock_Holmes", public: true, created_by: null },
  { id: 2, slug: "Frida_Kahlo", name: "Frida Kahlo", name_uk: "Фріда Кало", tagline: "Mexican painter of vivid self-portraits", tagline_uk: "Мексиканська художниця яскравих автопортретів", story: "Frida Kahlo was a Mexican painter known for her many portraits and self-portraits blending realism with fantasy.", story_uk: "Фріда Кало — мексиканська художниця, відома автопортретами, що поєднують реалізм і фантазію.", avatar: portrait(350, "FK"), url: "https://en.wikipedia.org/wiki/Frida_Kahlo", public: true, created_by: null },
  { id: 3, slug: "Taras_Shevchenko", name: "Taras Shevchenko", name_uk: "Тарас Шевченко", tagline: "Poet, artist, father of modern Ukrainian literature", tagline_uk: "Поет, художник, батько сучасної української літератури", story: "Taras Shevchenko was a Ukrainian poet, artist and public figure of the 19th century whose collection Kobzar shaped the modern Ukrainian language.", story_uk: "Тарас Шевченко — український поет, художник і громадський діяч XIX століття; його «Кобзар» сформував сучасну українську мову.", avatar: portrait(30, "ТШ"), url: "https://en.wikipedia.org/wiki/Taras_Shevchenko", public: true, created_by: null },
  { id: 4, slug: "Marie_Curie", name: "Marie Curie", name_uk: "Марія Склодовська-Кюрі", tagline: "Pioneering physicist and chemist, Nobel laureate", tagline_uk: "Фізикиня й хімікиня-першопрохідниця, нобелівська лауреатка", story: "Marie Curie was a physicist and chemist who conducted pioneering research on radioactivity and was the first person to win two Nobel Prizes.", story_uk: "Марія Кюрі — фізикиня й хімікиня, піонерка досліджень радіоактивності, перша людина з двома Нобелівськими преміями.", avatar: portrait(160, "MC"), url: "https://en.wikipedia.org/wiki/Marie_Curie", public: true, created_by: null },
  { id: 5, slug: "Gandalf", name: "Gandalf", name_uk: "Ґандальф", tagline: "Wizard, leader of the Company of the Ring", tagline_uk: "Чарівник, провідник Братства Персня", story: "Gandalf is a wizard in J. R. R. Tolkien's Middle-earth, a guide and counsellor who leads the Fellowship of the Ring.", story_uk: "Ґандальф — чарівник Середзем'я Дж. Р. Р. Толкіна, порадник і провідник Братства Персня.", avatar: portrait(90, "G"), url: "https://en.wikipedia.org/wiki/Gandalf", public: true, created_by: null },
  { id: 6, slug: "Cleopatra", name: "Cleopatra", name_uk: "Клеопатра", tagline: "Last pharaoh of Ancient Egypt", tagline_uk: "Остання фараонка Стародавнього Єгипту", story: "Cleopatra VII was the last active ruler of the Ptolemaic Kingdom of Egypt, remembered for her intellect, her alliances with Rome and her fall.", story_uk: "Клеопатра VII — остання правителька Птолемеївського Єгипту; пам'ятають за розум, союзи з Римом і падіння.", avatar: portrait(45, "C"), url: "https://en.wikipedia.org/wiki/Cleopatra", public: true, created_by: null },
];

export const FIXTURE_CANDIDATES = [
  { key: "Nikola_Tesla", title: "Nikola Tesla", description: "Serbian-American inventor (1856–1943)", thumb: portrait(200, "NT") },
  { key: "Nikola_Tesla_(film)", title: "Nikola Tesla (film)", description: "2020 film", thumb: "" },
];

export const FIXTURE_THREAD = [
  { id: 1, role: "user", content: "Добрий вечір, містере Холмс. Що ви можете сказати про мене?" },
  { id: 2, role: "assistant", content: "Добрий вечір. Ви прийшли пішки під дощем, але без парасольки — отже, вийшли поспіхом; і тримаєте телефон лівою рукою, хоч пишете правою. Щось вас турбує з самого ранку. Розкажіть, що саме.", by: "gemini/gemini-2.5-flash" },
  { id: 3, role: "user", content: "Загубив ключі від квартири." },
];
export const FIXTURE_REPLY = {
  uk: "Ключі не губляться — їх кладуть. Згадайте останні двері, які ви зачиняли зсередини: пальто, яке зняли одразу після цього, і кишеню, куди пішла права рука. Почніть з неї.",
  en: "Keys are not lost — they are put down. Recall the last door you locked from inside, the coat you took off right after, and the pocket your right hand went to. Start there.",
};
export const FIXTURE_CHATS = [{ id: 1, character_id: 1, title: "Добрий вечір, містере Холмс", updated_at: "2026-08-16T12:00:00Z", name: "Sherlock Holmes", name_uk: "Шерлок Холмс", avatar_url: FIXTURE_CHARACTERS[0].avatar, last: FIXTURE_THREAD[2].content }];

// Types the fixture reply word by word so the gate sees the same motion a real stream produces.
async function fixtureStream(text, locale, { onMeta, onDelta, signal, chatId }) {
  const id = chatId || 1;
  onMeta?.({ chatId: id, userMessageId: 99 });
  const words = (FIXTURE_REPLY[locale] || FIXTURE_REPLY.en).split(" ");
  let acc = "";
  for (let i = 0; i < words.length; i++) {
    if (signal?.aborted) break;
    await new Promise((r) => setTimeout(r, 22));
    const d = (i ? " " : "") + words[i]; acc += d; onDelta?.(d, acc);
  }
  return { chatId: id, by: "fixture", complete: true, text: acc, messageId: 100 };
}
