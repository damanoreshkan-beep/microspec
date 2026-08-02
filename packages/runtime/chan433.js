

export const LPD433 = { id: "lpd433", count: 69, firstHz: 433_075_000, stepHz: 25_000 };
export const PMR446 = { id: "pmr446", count: 16, firstHz: 446_006_250, stepHz: 12_500 };

export const ISM433 = { loHz: 433_050_000, hiHz: 434_790_000 };

export const TUNE_HZ = 433_925_000;

export const planSpanHz = (p) => (p.count - 1) * p.stepHz;

export function channelCentre(plan, n) {
  if (!Number.isInteger(n) || n < 1 || n > plan.count) return null;
  return plan.firstHz + (n - 1) * plan.stepHz;
}

export function channelAt(plan, hz) {
  const n = Math.round((hz - plan.firstHz) / plan.stepHz) + 1;
  if (n < 1 || n > plan.count) return null;
  return n;
}


export function binOf(hz, { fftSize, sampleRate, centreHz }) {
  return (hz - centreHz) * fftSize / sampleRate + fftSize / 2;
}

export function channelBins(plan, geom) {
  const out = [];
  for (let n = 1; n <= plan.count; n++) {
    const c = channelCentre(plan, n);
    const lo = binOf(c - plan.stepHz / 2, geom);
    const hi = binOf(c + plan.stepHz / 2, geom);
    out.push({ n, centreHz: c, lo, hi, inWindow: lo >= 0 && hi <= geom.fftSize });
  }
  return out;
}

export function integrateChannels(power, bins) {
  const out = new Float32Array(bins.length);
  for (let i = 0; i < bins.length; i++) {
    const { lo, hi, inWindow } = bins[i];
    if (!inWindow) { out[i] = 0; continue; }
    let acc = 0;
    const first = Math.floor(lo), last = Math.ceil(hi) - 1;
    for (let b = first; b <= last; b++) {
      const left = Math.max(lo, b), right = Math.min(hi, b + 1);
      const w = right - left;                       
      if (w > 0) acc += power[b] * w;
    }
    out[i] = acc / (hi - lo);
  }
  return out;
}
