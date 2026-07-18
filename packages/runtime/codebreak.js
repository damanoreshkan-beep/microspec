// codebreak.js — the deduction engine for the Code game (a colour code-breaker / Mastermind). Pure,
// zero-dependency, unit-tested. The runtime owns the maths; the app owns the pegs and the taps.
//
// A code is an array of colour indices (0..nColors-1), length nSlots, repeats allowed. `feedback` scores a
// guess against the secret the classic way: `exact` = right colour AND right slot; `partial` = right colour,
// wrong slot — each peg consumed once, so exact matches never double-count as partials (the subtle bit most
// naive versions get wrong on repeated colours).

export function feedback(secret, guess) {
  const n = secret.length;
  let exact = 0;
  const sLeft = {}, gLeft = {}; // colour → count, over the NON-exact positions only
  for (let i = 0; i < n; i++) {
    if (secret[i] === guess[i]) { exact++; continue; }
    sLeft[secret[i]] = (sLeft[secret[i]] || 0) + 1;
    gLeft[guess[i]] = (gLeft[guess[i]] || 0) + 1;
  }
  let partial = 0;
  for (const c in gLeft) partial += Math.min(gLeft[c], sLeft[c] || 0);
  return { exact, partial };
}

// A code is cracked when every slot is exact.
export const solved = (fb, nSlots) => fb.exact === nSlots;

// Deterministic secret from a seeded RNG (mulberry32) — same seed → same code, so a code is shareable and
// the gate is reproducible.
export function makeSecret(rng, nColors, nSlots) {
  const code = [];
  for (let i = 0; i < nSlots; i++) code.push(Math.floor(rng() * nColors) % nColors);
  return code;
}
