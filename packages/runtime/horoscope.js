import { mulberry32 } from "./groove.js";


const ORDER = [[1, 1, 9], [1, 20, 10], [2, 19, 11], [3, 21, 0], [4, 20, 1], [5, 21, 2], [6, 21, 3], [7, 23, 4], [8, 23, 5], [9, 23, 6], [10, 23, 7], [11, 22, 8], [12, 22, 9]];
export function sunSign(month, day) {   
  let idx = ORDER[0][2];
  for (const [m, d, s] of ORDER) if (month > m || (month === m && day >= d)) idx = s;
  return idx;
}

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export function reading(signIdx, dateKey) {
  const rng = mulberry32((hash(`${signIdx}|${dateKey}`) ^ 0x9e3779b9) >>> 0);
  const sel = () => rng();                       
  const rate = () => 2 + Math.floor(rng() * 4);  
  return {
    open: sel(), focus: sel(), advice: sel(), mood: sel(), color: sel(),
    love: rate(), work: rate(), health: rate(),
    lucky: 1 + Math.floor(rng() * 40),           
  };
}
