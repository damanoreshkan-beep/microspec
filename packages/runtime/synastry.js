
export const signOf = (lon) => Math.floor((((lon % 360) + 360) % 360) / 30);   
const wrap = (s) => (((s % 12) + 12) % 12);
export const ELEMENT = (s) => wrap(s) % 4;    
export const MODALITY = (s) => wrap(s) % 3;   

const ASPECT = [78, 47, 72, 43, 90, 46, 66];   
export function signPair(a, b) {
  const A = wrap(a), B = wrap(b);
  const d = Math.min((A - B + 12) % 12, (B - A + 12) % 12);   
  return ASPECT[d];
}

export function compat(A, B) {
  const p = signPair;
  const core = Math.round((p(A.sun, B.sun) * 2 + p(A.moon, B.moon)) / 3);              
  const love = Math.round((p(A.venus, B.mars) + p(B.venus, A.mars) + p(A.venus, B.venus)) / 3);
  const emotion = Math.round((p(A.moon, B.moon) + p(A.moon, B.sun) + p(B.moon, A.sun)) / 3);
  const mind = Math.round((p(A.mercury, B.mercury) + p(A.mercury, B.sun) + p(B.mercury, A.sun)) / 3);
  const passion = Math.round((p(A.mars, B.mars) + p(A.venus, B.mars) + p(B.venus, A.mars)) / 3);
  const overall = Math.round(core * 0.32 + love * 0.28 + emotion * 0.2 + mind * 0.1 + passion * 0.1);
  return { overall, core, love, emotion, mind, passion };
}

export const band = (s) => (s >= 78 ? 3 : s >= 62 ? 2 : s >= 48 ? 1 : 0);
