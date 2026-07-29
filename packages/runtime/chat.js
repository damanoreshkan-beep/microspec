
export const asked = (t) => ({ r: "u", t: String(t || "").trim() });
export const answered = (t) => ({ r: "a", t: String(t || "").trim() });

export function groundBook({ title, byline, plot }) {
  const head = [title, byline].filter(Boolean).join(" — ");
  return `КНИГА: ${head}\n\nСЮЖЕТ:\n${String(plot || "").trim()}`;
}

export const THREAD_CHARS = 6000, THREAD_TURNS = 12;

export function foldThread(turns, maxChars = THREAD_CHARS, maxTurns = THREAD_TURNS) {
  let list = (Array.isArray(turns) ? turns : [])
    .filter((x) => x && typeof x.t === "string" && x.t.trim())
    .map((x) => ({ r: x.r === "a" ? "a" : "u", t: x.t.trim() }));
  if (!list.length) return [];
  list = list.slice(-maxTurns);
  let used = list.reduce((a, x) => a + x.t.length, 0);
  while (list.length > 1 && used > maxChars) used -= list.shift().t.length;
  while (list.length > 1 && list[0].r !== "u") list.shift();
  return list[0].r === "u" ? list : [];
}

export function hashTurns(turns) {
  const s = (Array.isArray(turns) ? turns : []).map((x) => (x?.r || "u") + ":" + (x?.t || "")).join("");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

export function askSignature(pageid, level, locked, locale, turns) {
  return `${pageid}|${level}|${locked ? "L" : "O"}|${locale}|${hashTurns(turns)}`;
}
