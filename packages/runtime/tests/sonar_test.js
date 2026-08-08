// microspec runtime — sonar (ultrasonic Doppler) unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)
//
// The gate has no speaker and no microphone, so `synthSpectrum` IS the sonar signal CI ever sees. The eleven
// states of apps/sonar/RESEARCH.md §7 are covered below; the numbers they assert were measured from this
// module, not chosen.

import { assert, assertEquals, assertAlmostEquals } from "jsr:@std/assert@1";
import {
  DEFAULTS, speedOfSound, dopplerHz, radialFromHz, binWidth, binOf, hzOfBin, snapCarrier,
  median, mad, trackCarrier, analyzeFrame, Calibration, Detector, synthSpectrum,
} from "../sonar.js";

const SR = 48000, FFT = DEFAULTS.fftSize;
const frame = (opts = {}) => synthSpectrum({ sampleRate: SR, fftSize: FFT, ...opts });
const read = (opts = {}) => analyzeFrame(frame(opts), { sampleRate: SR, fftSize: FFT });

// ---- physics ----

Deno.test("sonar speedOfSound: matches the NPL values the design is scaled to", () => {
  assertAlmostEquals(speedOfSound(0), 331.3, 1e-9);
  assertAlmostEquals(speedOfSound(20), 343.215, 0.01);
  assertAlmostEquals(speedOfSound(40), 354.7, 0.05);
});

Deno.test("sonar dopplerHz: reproduces the RESEARCH §1 shift table at 19 kHz", () => {
  assertAlmostEquals(dopplerHz(0.05, 19000), 5.54, 0.01);
  assertAlmostEquals(dopplerHz(0.1, 19000), 11.08, 0.01);
  assertAlmostEquals(dopplerHz(0.3, 19000), 33.24, 0.01);
  assertAlmostEquals(dopplerHz(1.0, 19000), 111.04, 0.01);
  assert(dopplerHz(-1.0, 19000) < 0, "receding shifts down");
});

Deno.test("sonar radialFromHz: exact inverse of dopplerHz", () => {
  for (const v of [0.05, 0.3, 1, 2]) assertAlmostEquals(radialFromHz(dopplerHz(v, 19000), 19000), v, 1e-9);
});

Deno.test("sonar temperature is negligible for DETECTION, not for m/s", () => {
  // Why the app never prints m/s but can ignore the thermometer: 0-40 °C moves a 1 m/s shift by <8 Hz,
  // nothing against a ±250 Hz window — yet it is 7% of the value a speed readout would claim.
  const cold = dopplerHz(1, 19000, speedOfSound(0)), hot = dopplerHz(1, 19000, speedOfSound(40));
  assert(Math.abs(cold - hot) < 8, `shift spread ${Math.abs(cold - hot).toFixed(1)} Hz`);
  assert(Math.abs(cold - hot) / cold > 0.05, "…but >5% of the reading");
});

// ---- bin geometry: the measurement the whole design rests on ----

Deno.test("sonar snapCarrier: lands on an EXACT bin centre, and 19 kHz does not", () => {
  const w = binWidth(SR, FFT);
  assertAlmostEquals(w, 1.4648, 1e-4);
  const snapped = snapCarrier(19000, SR, FFT);
  // The snapped frequency is an integer number of bins; the round number is a third of a bin off, which is
  // where Blackman's -58 dB sidelobes sit and a slow hand's sideband dies (RESEARCH.md §0).
  assertAlmostEquals(snapped / w, Math.round(snapped / w), 1e-9);
  const offBins = Math.abs(19000 / w - Math.round(19000 / w));
  assert(offBins > 0.3 && offBins < 0.4, `19000 Hz is ${offBins.toFixed(2)} bin off`);
  assert(Math.abs(snapped - 19000) < w, "…and snapping moves it less than one bin");
});

Deno.test("sonar bin helpers: round-trip, and follow the sample rate", () => {
  assertEquals(binOf(hzOfBin(1234, SR, FFT), SR, FFT), 1234);
  assert(snapCarrier(19000, 44100, FFT) !== snapCarrier(19000, SR, FFT), "a bin centre is rate-dependent");
  assertAlmostEquals(binWidth(44100, FFT), 1.3458, 1e-4);
});

// ---- robust statistics ----

Deno.test("sonar median/mad: an outlier moves neither much", () => {
  assertEquals(median([3, 1, 2]), 2);
  assertEquals(median([4, 1, 3, 2]), 2.5);
  assertEquals(median([]), 0);
  assertEquals(median([1, NaN, 2, Infinity, 3]), 2, "non-finite values are dropped, not sorted");
  assertEquals(mad([10, 10, 10]), 0);
  assertEquals(mad([1, 2, 3, 4, 1000]), 1);
});

// ---- the eleven fixtures (RESEARCH.md §7) ----

Deno.test("sonar fixture 1: no carrier → not ok, nothing claimed", () => {
  const r = read({ carrierHz: 0 });
  assertEquals(r.ok, false);
  assert(r.carrier.lost, "carrier reported lost");
  assertEquals(r.motionDb, 0);
  assertEquals(r.direction, 0);
});

Deno.test("sonar fixture 2: a still room scores near its own floor, with no direction", () => {
  for (const seed of [1, 2, 7, 13]) {
    const r = read({ seed });
    assert(r.ok, "carrier found");
    assert(r.motionDb < 0, `still motionDb ${r.motionDb.toFixed(2)} stays below 0 dB`);
    assert(Math.abs(r.direction) < DEFAULTS.directionMin, `still direction ${r.direction.toFixed(2)} is not decisive`);
  }
});

Deno.test("sonar fixture 3: an upper sideband alone reads as approaching", () => {
  const r = read({ moves: [{ hz: dopplerHz(0.3, 19000), db: -70 }] });
  assert(r.motionDb > 15, `motion ${r.motionDb.toFixed(1)} dB`);
  assert(r.direction > 0.9, `direction ${r.direction.toFixed(2)} — approaching`);
  assert(r.upper.excess > r.lower.excess * 100, "energy is on one side only");
});

Deno.test("sonar fixture 4: a lower sideband alone reads as receding", () => {
  const r = read({ moves: [{ hz: -dopplerHz(0.3, 19000), db: -70 }] });
  assert(r.motionDb > 15, `motion ${r.motionDb.toFixed(1)} dB`);
  assert(r.direction < -0.9, `direction ${r.direction.toFixed(2)} — receding`);
});

Deno.test("sonar fixture 5: both sides lit → motion, but NO direction claimed", () => {
  // One object plus multipath routinely lights both sides; the app must say "motion" and stop there.
  const hz = dopplerHz(0.3, 19000);
  const r = read({ moves: [{ hz, db: -70 }, { hz: -hz, db: -72 }] });
  assert(r.motionDb > 15, "motion is still obvious");
  assert(Math.abs(r.direction) < DEFAULTS.directionMin, `direction ${r.direction.toFixed(2)} below the decisive floor`);
});

Deno.test("sonar fixture 6: a drifted carrier is TRACKED, and sidebands follow it", () => {
  // Clock drift and resampling move the carrier; a band anchored to the nominal frequency would slide its
  // guard over live signal. The peak is found ~90 Hz off, and the shift is still measured from the peak.
  const drifted = 19000 + 90;
  const db = frame({ carrierHz: drifted, moves: [{ hz: 33.24, db: -70 }] });
  const c = trackCarrier(db, { sampleRate: SR, fftSize: FFT });
  assert(!c.lost, "found inside the ±150 Hz tracking window");
  assert(Math.abs(c.hz - snapCarrier(drifted, SR, FFT)) < binWidth(SR, FFT), `tracked to ${c.hz.toFixed(1)} Hz`);
  const r = analyzeFrame(db, { sampleRate: SR, fftSize: FFT });
  assert(r.ok && r.direction > 0.9, "the reflection is still read as approaching");
  assertAlmostEquals(r.dominantHz, 33.24, 1.5, "the shift is measured from the FOUND peak");
});

Deno.test("sonar fixture 7: a carrier below the SNR floor is lost, not guessed at", () => {
  const r = read({ carrierDb: -108 });                       // barely above the -110 dB floor
  assertEquals(r.ok, false);
  assert(r.carrier.snrDb < DEFAULTS.carrierSnrDb, `snr ${r.carrier.snrDb.toFixed(1)} dB`);
  // A carrier pushed further than the tracking window is lost too, however loud it is.
  const far = analyzeFrame(frame({ carrierHz: 19000 + 400 }), { sampleRate: SR, fftSize: FFT });
  assertEquals(far.ok, false);
});

Deno.test("sonar fixture 8: a different sample rate changes bins, not conclusions", () => {
  const db = synthSpectrum({ sampleRate: 44100, fftSize: FFT, moves: [{ hz: 33.24, db: -70 }] });
  const r = analyzeFrame(db, { sampleRate: 44100, fftSize: FFT });
  assert(r.ok && r.motionDb > 15 && r.direction > 0.9, "same verdict at 44.1 kHz");
  assertAlmostEquals(r.dominantHz, 33.24, 1.5);
});

Deno.test("sonar fixture 9: a raised noise floor does not become motion", () => {
  const quiet = read({ floorDb: -110 }), loud = read({ floorDb: -70 });
  assert(loud.ok, "the carrier still clears a -70 dB floor");
  assertAlmostEquals(loud.motionDb, quiet.motionDb, 1.5, "motion is RELATIVE to the sidebands' own floor");
  // The reading follows the CONTRAST, not the level: the same 40 dB reflection over a floor 40 dB louder
  // scores the same. That is what makes one calibration valid in a quiet room and a noisy one.
  const quietMove = read({ floorDb: -110, moves: [{ hz: 33.24, db: -70 }] });
  const loudMove = read({ floorDb: -70, moves: [{ hz: 33.24, db: -30 }] });
  assertAlmostEquals(loudMove.motionDb, quietMove.motionDb, 1.5);
  assert(loudMove.motionDb > 15, "and a real reflection over that floor still shows");
});

Deno.test("sonar fixture 10: the 0.05 m/s hand clears the guard — with one bin to spare", () => {
  // The tightest case in the whole design: 5.54 Hz is 3.8 bins, and the guard is 4 bins
  // (max(guardBins 3, ceil(4.5 Hz / 1.46 Hz))). The reflection lands ON the guard edge, so this test is what
  // stands between a working slow-hand and a silent one — if guardHz or fftSize moves, it fails here first.
  const w = binWidth(SR, FFT);
  const guard = Math.max(DEFAULTS.guardBins, Math.ceil(DEFAULTS.guardHz / w));
  const shiftBins = dopplerHz(0.05, 19000) / w;
  assert(shiftBins >= guard - 0.3, `slow hand at ${shiftBins.toFixed(1)} bins vs guard ${guard}`);
  const r = read({ moves: [{ hz: dopplerHz(0.05, 19000), db: -70 }] });
  assert(r.motionDb > 10, `slow hand reads ${r.motionDb.toFixed(1)} dB`);
  assert(r.direction > 0.9, "and still carries its direction");
});

Deno.test("sonar fixture 11: walking (1 m/s) is unmistakable and sits inside the band", () => {
  const hz = dopplerHz(1, 19000);
  assert(hz < DEFAULTS.bandHz, `${hz.toFixed(0)} Hz fits the ±${DEFAULTS.bandHz} Hz window`);
  const r = read({ moves: [{ hz, db: -60 }] });
  assert(r.motionDb > 15 && r.direction > 0.9);
  assertAlmostEquals(r.dominantHz, hz, 1.5);
});

// ---- calibration + detection ----

Deno.test("sonar Calibration: thresholds come from the ROOM, and hysteresis is ordered", () => {
  const cal = Calibration({ minFrames: 4 });
  assertEquals(cal.ready, false);
  assertEquals(cal.thresholds(), null, "no samples, no thresholds");
  for (const seed of [1, 2, 3, 4, 5, 6]) cal.push(read({ seed }).motionDb);
  assert(cal.ready && cal.frames === 6);
  const th = cal.thresholds();
  assert(th.off < th.on, "off below on — that IS the hysteresis");
  assert(th.on > th.median, "on sits above what the still room scores");
  cal.reset();
  assertEquals(cal.frames, 0);
});

Deno.test("sonar Calibration: a perfectly steady room still gets a usable threshold", () => {
  // MAD 0 would make on == off == median and the detector would trip on rounding noise; the 0.25 floor is
  // the only thing between a silent room and a permanently-triggered one.
  const cal = Calibration({ minFrames: 1 });
  for (let i = 0; i < 10; i++) cal.push(-7);
  const th = cal.thresholds();
  assertEquals(th.mad, 0);
  assert(th.on > th.off && th.off > -7, `on ${th.on} / off ${th.off} still separate`);
});

Deno.test("sonar Detector: attack/release are TIME, not frames", () => {
  // The analyser is polled from rAF, whose rate is not specified; 60 fps and 20 fps must behave identically.
  const run = (dt) => {
    const d = Detector({ on: 5, off: 1 });
    let onAt = 0, offAt = 0, t = 0;
    while (t < 400) { t += dt; if (d.update(9, dt) && !onAt) onAt = t; }
    while (t < 1600) { t += dt; if (!d.update(0, dt) && !offAt) offAt = t; }
    return { onAt, offAt: offAt - 400 };
  };
  const fast = run(16), slow = run(50);
  assertAlmostEquals(fast.onAt, DEFAULTS.attackMs, 50);
  assertAlmostEquals(slow.onAt, DEFAULTS.attackMs, 50);
  assertAlmostEquals(fast.offAt, DEFAULTS.releaseMs, 60);
  assertAlmostEquals(slow.offAt, DEFAULTS.releaseMs, 60);
});

Deno.test("sonar Detector: the dead band between off and on cannot chatter", () => {
  const d = Detector({ on: 5, off: 1 });
  for (let i = 0; i < 100; i++) d.update(3, 16);                 // inside the band, forever
  assertEquals(d.active, false, "an idle detector stays idle in the dead band");
  for (let i = 0; i < 20; i++) d.update(9, 16);
  assertEquals(d.active, true);
  for (let i = 0; i < 100; i++) d.update(3, 16);                 // same dead band, now active
  assertEquals(d.active, true, "…and an active one stays active — that is the point of two thresholds");
  d.reset();
  assertEquals(d.active, false);
});

Deno.test("sonar end-to-end: calibrate on stillness, then a hand trips it and the room releases it", () => {
  // The app's whole loop, in one test: learn the room, detect a wave, fall back to idle when it stops.
  const cal = Calibration({ minFrames: 8 });
  for (let seed = 1; seed <= 12; seed++) cal.push(read({ seed }).motionDb);
  const th = cal.thresholds();
  const det = Detector(th);

  const still = read({ seed: 5 }).motionDb;
  assert(still < th.on, "the room it was calibrated in does not trigger it");
  for (let i = 0; i < 12; i++) det.update(still, 16);
  assertEquals(det.active, false);

  const wave = read({ moves: [{ hz: dopplerHz(0.3, 19000), db: -70 }] }).motionDb;
  assert(wave > th.on, `a wave scores ${wave.toFixed(1)} dB against an on-threshold of ${th.on.toFixed(1)}`);
  for (let i = 0; i < 12; i++) det.update(wave, 16);
  assertEquals(det.active, true, "…and trips the detector within the attack time");

  for (let i = 0; i < 40; i++) det.update(still, 16);
  assertEquals(det.active, false, "…and releases when the room goes quiet again");
});

Deno.test("sonar synthSpectrum: deterministic, and honest about its own shape", () => {
  const a = frame({ seed: 3 }), b = frame({ seed: 3 });
  assertEquals(Array.from(a), Array.from(b), "same seed, same spectrum — the gate cannot flake");
  assert(Array.from(frame({ seed: 4 })).some((v, i) => v !== a[i]), "a different seed is a different room");
  assertEquals(a.length, FFT >> 1, "one value per frequency bin, as getFloatFrequencyData writes");
  const cb = binOf(snapCarrier(19000, SR, FFT), SR, FFT);
  assert(a[cb] > a[cb - 1] && a[cb - 1] > a[cb - 2], "a real main lobe falls away from the peak");
});
