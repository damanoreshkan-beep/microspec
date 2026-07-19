
const ORDER = [[1, 1, 9], [1, 20, 10], [2, 19, 11], [3, 21, 0], [4, 20, 1], [5, 21, 2], [6, 21, 3], [7, 23, 4], [8, 23, 5], [9, 23, 6], [10, 23, 7], [11, 22, 8], [12, 22, 9]];
export function sunSign(month, day) {   
  let idx = ORDER[0][2];
  for (const [m, d, s] of ORDER) if (month > m || (month === m && day >= d)) idx = s;
  return idx;
}
