import { assert, assertEquals } from "jsr:@std/assert@1";
import { boxOf, exprOf, eyesOf, FACE_LIB, FACE_MODEL, GAZE, gazeOf, readingOf, scaleOf, shapesOf } from "../face.js";

const near = (a, b, eps = 1e-9) => assert(Math.abs(a - b) <= eps, `got ${a}, want ${b}`);
const pts478 = (fill = { x: 0.5, y: 0.5 }) => Array.from({ length: 478 }, () => ({ ...fill }));

Deno.test("face: the sources are pinned, never a floating tag", () => {
  assert(/@\d+\.\d+\.\d+$/.test(FACE_LIB), FACE_LIB);
  assert(/\/float16\/\d+\/face_landmarker\.task$/.test(FACE_MODEL), FACE_MODEL);
});

Deno.test("face: shapesOf maps categories and tolerates holes", () => {
  assertEquals(shapesOf([{ categoryName: "jawOpen", score: 0.4 }, null, { score: 1 }]), { jawOpen: 0.4 });
  assertEquals(shapesOf(undefined), {});
});

Deno.test("face: eyesOf names open, closed and each wink", () => {
  assertEquals(eyesOf({}).state, "open");
  assertEquals(eyesOf({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.8 }).state, "closed");
  assertEquals(eyesOf({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.1 }).state, "winkL");
  assertEquals(eyesOf({ eyeBlinkLeft: 0.1, eyeBlinkRight: 0.6 }).state, "winkR");
  const e = eyesOf({ eyeBlinkLeft: 0.25, eyeBlinkRight: 1.2 });
  near(e.l, 0.75);
  assertEquals(e.r, 0);
});

Deno.test("face: gazeOf reads the subject's own left, right, up and down", () => {
  assertEquals(gazeOf({}).dir, "c");
  assertEquals(gazeOf({ eyeLookOutLeft: 0.6, eyeLookInRight: 0.6 }).dir, "l");
  assertEquals(gazeOf({ eyeLookInLeft: 0.6, eyeLookOutRight: 0.6 }).dir, "r");
  assertEquals(gazeOf({ eyeLookUpLeft: 0.5, eyeLookUpRight: 0.5 }).dir, "u");
  assertEquals(gazeOf({ eyeLookDownLeft: 0.7, eyeLookDownRight: 0.7, eyeLookInLeft: 0.5, eyeLookOutRight: 0.5 }).dir, "dr");
  const g = gazeOf({ eyeLookOutLeft: 0.3, eyeLookInRight: 0.1 });
  near(g.x, -0.2);
  assertEquals(g.dir, "l");
  for (const s of [{}, { eyeLookUpLeft: 1, eyeLookUpRight: 1, eyeLookOutLeft: 1, eyeLookInRight: 1 }]) assert(GAZE.includes(gazeOf(s).dir));
});

Deno.test("face: exprOf picks the strongest above its floor, else calm", () => {
  assertEquals(exprOf({}).id, "calm");
  assertEquals(exprOf({}).score, 1);
  assertEquals(exprOf({ jawOpen: 0.8 }).id, "open");
  assertEquals(exprOf({ browDownLeft: 0.6, browDownRight: 0.6, eyeSquintLeft: 0.5, eyeSquintRight: 0.5, jawOpen: 0.31 }).id, "strain");
  assertEquals(exprOf({ mouthSmileLeft: 0.9, mouthSmileRight: 0.9, jawOpen: 0.35 }).id, "smile");
  const calm = exprOf({ jawOpen: 0.15 });
  assertEquals(calm.id, "calm");
  near(calm.score, 0.5);
});

Deno.test("face: scaleOf is the outer-eye distance over the frame width, resolution-free", () => {
  const p = pts478();
  p[33] = { x: 0.4, y: 0.5 };
  p[263] = { x: 0.6, y: 0.5 };
  near(scaleOf(p, 640, 480), 0.2);
  near(scaleOf(p, 1280, 960), 0.2);
  p[263] = { x: 0.4, y: 0.5 + 0.2 * 640 / 480 };
  near(scaleOf(p, 640, 480), 0.2);
  assertEquals(scaleOf([], 640, 480), 0);
  assertEquals(scaleOf(p, 0, 480), 0);
});

Deno.test("face: boxOf bounds the points and clamps to the frame", () => {
  assertEquals(boxOf([{ x: 0.2, y: 0.3 }, { x: 0.6, y: 0.9 }]), { x: 0.2, y: 0.3, w: 0.39999999999999997, h: 0.6000000000000001 });
  assertEquals(boxOf([{ x: -0.1, y: 0.5 }, { x: 1.2, y: 0.6 }]).w, 1);
  assertEquals(boxOf([]), null);
});

Deno.test("face: readingOf turns a raw result into a reading, or null without a face", () => {
  assertEquals(readingOf({ faceLandmarks: [], faceBlendshapes: [] }, 640, 480), null);
  assertEquals(readingOf(null, 640, 480), null);
  const p = pts478();
  p[33] = { x: 0.35, y: 0.4 };
  p[263] = { x: 0.65, y: 0.4 };
  const r = readingOf({
    faceLandmarks: [p],
    faceBlendshapes: [{ categories: [{ categoryName: "eyeBlinkLeft", score: 0.95 }, { categoryName: "eyeBlinkRight", score: 0.9 }, { categoryName: "jawOpen", score: 0.5 }] }],
  }, 640, 480);
  near(r.scale, 0.3);
  assertEquals(r.eyes.state, "closed");
  assertEquals(r.expr.id, "open");
  assertEquals(r.gaze.dir, "c");
  assertEquals(r.box.x, 0.35);
  const bare = readingOf({ faceLandmarks: [p] }, 640, 480);
  assertEquals(bare.eyes.state, "open");
  assertEquals(bare.expr.id, "calm");
});
