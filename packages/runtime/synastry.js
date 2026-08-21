import { ASPECTS } from "./aspects.js";

export const signOf = (lon) => Math.floor((((lon % 360) + 360) % 360) / 30);   
const wrap = (s) => (((s % 12) + 12) % 12);
export const ELEMENT = (s) => wrap(s) % 4;    
export const MODALITY = (s) => wrap(s) % 3;   

export const MOIETY = { sun: 7.5, moon: 6, mercury: 3.5, venus: 3.5, mars: 4, jupiter: 4.5, saturn: 4.5 };

export const SYN_BODIES = ["sun", "moon", "mercury", "venus", "mars"];

const norm360 = (d) => (((d % 360) + 360) % 360);
const sep = (a, b) => { const d = Math.abs(norm360(a) - norm360(b)); return d > 180 ? 360 - d : d; };

const PTOLEMAIC = ASPECTS.map(({ type, angle, nature }) => ({ type, angle, nature }));

export function contacts(A, B) {
  const out = [];
  for (const p of A) {
    for (const q of B) {
      if (p.lon == null || q.lon == null) continue;
      const limit = (MOIETY[p.key] || 0) + (MOIETY[q.key] || 0);
      if (!limit) continue;                                  
      const s = sep(p.lon, q.lon);
      for (const asp of PTOLEMAIC) {
        const delta = Math.abs(s - asp.angle);
        if (delta > limit) continue;
        out.push({ a: p.key, b: q.key, type: asp.type, nature: asp.nature, angle: asp.angle,
          orb: +delta.toFixed(2), limit, strength: +(1 - delta / limit).toFixed(3) });
        break;   
      }
    }
  }
  return out.sort((x, y) => y.strength - x.strength);
}

const VALENCE = { trine: 90, conjunction: 78, sextile: 72, opposition: 66, square: 43 };

const NEUTRAL = 60;
const pull = (c) => NEUTRAL + (VALENCE[c.type] - NEUTRAL) * c.strength;

const AXES = {
  core: [["sun", "sun"], ["sun", "moon"], ["moon", "sun"], ["moon", "moon"]],
  love: [["venus", "mars"], ["mars", "venus"], ["venus", "venus"]],
  emotion: [["moon", "moon"], ["moon", "venus"], ["venus", "moon"], ["moon", "sun"], ["sun", "moon"]],
  mind: [["mercury", "mercury"], ["mercury", "sun"], ["sun", "mercury"], ["mercury", "moon"], ["moon", "mercury"]],
  passion: [["mars", "mars"], ["venus", "mars"], ["mars", "venus"], ["mars", "sun"], ["sun", "mars"]],
};

export function score(list) {
  const at = new Map(list.map((c) => [c.a + "-" + c.b, c]));
  const axis = (pairs) => {
    let weight = 0, sum = 0;
    for (const [a, b] of pairs) {
      const c = at.get(a + "-" + b);
      if (!c) continue;                                      
      weight += c.strength;
      sum += pull(c) * c.strength;
    }
    return weight ? Math.round(sum / weight) : NEUTRAL;
  };
  const core = axis(AXES.core), love = axis(AXES.love), emotion = axis(AXES.emotion);
  const mind = axis(AXES.mind), passion = axis(AXES.passion);
  const overall = Math.round(core * 0.32 + love * 0.28 + emotion * 0.2 + mind * 0.1 + passion * 0.1);
  return { overall, core, love, emotion, mind, passion };
}

export const band = (s) => (s >= 72 ? 3 : s >= 65 ? 2 : s >= 58 ? 1 : 0);
