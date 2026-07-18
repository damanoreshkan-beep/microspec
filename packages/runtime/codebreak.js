
export function feedback(secret, guess) {
  const n = secret.length;
  let exact = 0;
  const sLeft = {}, gLeft = {}; 
  for (let i = 0; i < n; i++) {
    if (secret[i] === guess[i]) { exact++; continue; }
    sLeft[secret[i]] = (sLeft[secret[i]] || 0) + 1;
    gLeft[guess[i]] = (gLeft[guess[i]] || 0) + 1;
  }
  let partial = 0;
  for (const c in gLeft) partial += Math.min(gLeft[c], sLeft[c] || 0);
  return { exact, partial };
}

export const solved = (fb, nSlots) => fb.exact === nSlots;

export function makeSecret(rng, nColors, nSlots) {
  const code = [];
  for (let i = 0; i < nSlots; i++) code.push(Math.floor(rng() * nColors) % nColors);
  return code;
}
