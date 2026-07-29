
export const BOOK_TYPES = new Set([
  "Q7725634",    
  "Q47461344",   
  "Q571",        
  "Q8261",       
  "Q1667921",    
  "Q13593966",   
  "Q7725310",    
  "Q49084",      
  "Q25379",      
  "Q5185279",    
  "Q49100005",   
  "Q1279564",    
  "Q149537",     
]);

export const NOT_BOOK_TYPES = new Set([
  "Q11424",      
  "Q5",          
  "Q4167410",    
  "Q22808320",   
  "Q13406463",   
  "Q482994",     
  "Q5398426",    
  "Q7889",       
  "Q196600",     
  "Q1985406",    
]);

export function isBook(claims) {
  const p31 = claims?.p31 || [];
  if (p31.some((t) => NOT_BOOK_TYPES.has(t))) return false;
  if (p31.some((t) => BOOK_TYPES.has(t))) return true;
  return !!(claims?.hasAuthor && claims?.hasDate);
}

export const PLOT_HEADINGS = [
  "plot", "plot summary", "synopsis", "plot introduction", "summary",
  "story", "storylines", "plot outline", "features of plotline", "contents",
];

const norm = (s) => String(s || "").toLowerCase().replace(/\[.*?\]/g, "").replace(/\s+/g, " ").trim();

export function findPlotSection(sections) {
  const list = (sections || []).filter((s) => s && s.index != null && s.line);
  for (const want of PLOT_HEADINGS) {
    const hit = list.find((s) => norm(s.line) === want);
    if (hit) return { index: String(hit.index), line: hit.line };
  }
  for (const want of PLOT_HEADINGS) {
    const hit = list.find((s) => norm(s.line).startsWith(want + " "));
    if (hit) return { index: String(hit.index), line: hit.line };
  }
  return null;
}

export function cleanPlotText(text, heading) {
  let s = String(text || "")
    .replace(/ /g, " ")
    .replace(/\[\s*(edit|\d+|citation needed|nb \d+|[a-z])\s*\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (heading) {                                     
    const h = String(heading).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp("^" + h + "\\s*", "i"), "");
  }
  return s.trim();
}

export function foldPlot(text, max = 20000, headShare = 0.6) {
  const s = String(text || "").trim();
  if (s.length <= max) return s;
  const gap = " […] ";
  const budget = max - gap.length;
  const head = Math.floor(budget * headShare);
  const tail = budget - head;
  const cutHead = s.lastIndexOf(". ", head);
  const cutTail = s.indexOf(". ", s.length - tail);
  const a = s.slice(0, cutHead > head * 0.8 ? cutHead + 1 : head);
  const b = s.slice(cutTail !== -1 && cutTail < s.length - tail * 0.8 ? cutTail + 2 : s.length - tail);
  return a + gap + b;
}

const MARK = /\[\s*([123])\s*\]/g;

export function parseActs(text) {
  const s = String(text || "").trim();
  const found = [];
  let m;
  MARK.lastIndex = 0;
  while ((m = MARK.exec(s)) !== null) found.push({ n: Number(m[1]), at: m.index, end: MARK.lastIndex });
  const first = new Map();
  for (const f of found) if (!first.has(f.n)) first.set(f.n, f);
  const marks = [1, 2, 3].map((n) => first.get(n)).filter(Boolean);
  if (marks.length < 3) return { acts: [s, "", ""], ok: false, truncated: false };
  const acts = marks.map((mk, i) => {
    const stop = i + 1 < marks.length ? marks[i + 1].at : s.length;
    return s.slice(mk.end, stop).trim();
  });
  const last = acts[2];
  const truncated = last.length > 0 && !/[.!?…"»)]$/.test(last);
  return { acts, ok: acts.every((a) => a.length > 0), truncated };
}

export function countSentences(text) {
  return String(text || "").split(/(?<=[.!?…])\s+/).filter((s) => s.trim().length > 1).length;
}

export function actSignature(pageid, level, locale) {
  return `${pageid}|${level}|${locale}`;
}

export function plotUpToClimax(text, share = 0.72) {
  const s = String(text || "").trim();
  if (s.length < 400) return s;                       
  const cut = Math.floor(s.length * share);
  const dot = s.lastIndexOf(". ", cut);               
  return s.slice(0, dot > cut * 0.7 ? dot + 1 : cut).trim();
}
