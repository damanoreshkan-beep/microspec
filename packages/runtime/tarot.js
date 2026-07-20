import { mulberry32 } from "./groove.js";

export const SPREADS = [
  { id: "daily", pos: ["posToday"] },
  { id: "ppf", pos: ["posPast", "posPresent", "posFuture"] },
  { id: "sao", pos: ["posSituation", "posAction", "posResult"] },
  { id: "mindbody", pos: ["posMind", "posBody", "posSpirit"] },
  { id: "choice", pos: ["posSelfNow", "posDoAct", "posDoOut", "posDontAct", "posDontOut", "posAdviceC"],
    rows: [[2, 4], [1, 3], [0], [5]] },
  { id: "poles", pos: ["posPoleA", "posPoleB", "posPullA", "posPullB", "posBalance"],
    rows: [[0, 1], [2, 3], [4]] },
  { id: "shadowlight", pos: ["posLight", "posShadow", "posRoot", "posGift"],
    rows: [[0, 1], [2], [3]] },
  { id: "star", pos: ["posCore", "posNow", "posHelps", "posHinders", "posLearn", "posTrend"],
    rows: [[1], [5, 2], [0], [4, 3]] },
  { id: "love", pos: ["posYou", "posThem", "posBond", "posChallengeL", "posDirection"],
    rows: [[0, 1], [2], [3], [4]] },
  { id: "pyramid", majorOnly: true, pos: ["posRoots", "posGround", "posShadow", "posInner", "posOuter", "posSoul"],
    rows: [[5], [3, 4], [0, 1, 2]] },
  { id: "celtic", pos: ["posHeart", "posCross", "posBelow", "posBehind", "posAbove", "posBefore", "posSelfC", "posEnv", "posHopes", "posFinal"] },
];
export const spreadById = (id) => SPREADS.find((s) => s.id === id) || SPREADS[0];

export function hashSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < String(s).length; i++) { h ^= String(s).charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function draw(seed, size, deckLen = 78) {
  const rng = mulberry32(seed >>> 0);
  const idx = Array.from({ length: deckLen }, (_, i) => i);
  const n = Math.max(0, Math.min(size, deckLen));
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (deckLen - i));
    const tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp;
  }
  return idx.slice(0, n).map((card) => ({ card, reversed: rng() < 0.5 }));
}
