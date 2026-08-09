// apps/iching/hero.wgsl — "The Founding Threshold".
//
// Six heavy bronze beams hanging in a black foundry void. Yang is one solid beam; yin is two with a gap.
// A MOVING line is caught mid-transition, and the two directions are deliberately DIFFERENT physics —
// which is the whole point, because the oracle itself is asymmetric (with yarrow stalks, yang→yin is three
// times likelier than yin→yang):
//
//   9  old yang → yin : the beam has FRACTURED. A crack opens at the centre, heat bleeding from the break.
//                       Breaking a bond: sudden, violent, expensive.
//   6  old yin  → yang: a thin bridge of crystallising metal GROWS across the gap, still glowing at its
//                       thinnest point. Making a bond: slow, quiet, almost no flash.
//
// So movement is legible before any number explains it, and a static line stays severe — that restraint is
// what makes one crack read as an event. No decorative sparks, no ambient lava glow: nothing emits that is
// not reporting a change.
//
// Numbers here are researched, not guessed (docs/research/iching-hero.md):
//   camera   85mm equivalent → vertical FOV 23.91°, ray z-multiplier 4.722, distance 3.69 × object height.
//            Wide FOV plus high elevation is exactly what made the first attempt read as a spring.
//   lights   key : fill : rim = 1.00 : 0.20 : 0.80  (5:1 key/fill — cinematic, not flat)
//   fresnel  Schlick exponent 5.0. An "artistic" 2–3 gives the wide white rim that reads as plastic.
//   bronze   linear base 0.78, 0.39, 0.16 · roughness 0.30 · metallic (diffuse suppressed)
//   output   exact sRGB OETF, then dither at ±0.5/255 — dark gradients band without it.

// `vary` is the variant-sheet channel: x = how much of the frame height the figure fills, y = how far it
// sits from the optical centre (positive lifts it). Zero means "use the researched default", so a normal
// render is unaffected and only a variant sheet moves them.
struct U { res: vec2f, time: f32, seed: f32, ink: vec4f, vary: vec4f };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var env: texture_2d<f32>;
@group(0) @binding(2) var envSam: sampler;

// The environment map is the light. RGBE in an RGBA8 texture: one exp2 recovers true radiance, which is
// what lets a highlight be hundreds of times brighter than the wall behind it — the difference between
// metal and plastic. Equirectangular, so a direction maps to uv by longitude/latitude.
// `lod` is how ROUGHNESS enters the picture. A mirror samples level 0; a polished-but-not-mirror bronze
// samples a blurred level. Getting this wrong is what made the first pass show single texels as squares:
// the material claimed roughness 0.30 while the sampler behaved like a mirror.
fn envDir(d: vec3f, lod: f32) -> vec3f {
  let uvv = vec2f(atan2(d.z, d.x) / 6.2831853 + 0.5, acos(clamp(d.y, -1.0, 1.0)) / 3.14159265);
  let s = textureSampleLevel(env, envSam, uvv, lod);
  return s.rgb * exp2(s.a * 255.0 - 128.0);
}

const ROUGHNESS: f32 = 0.30;      // polished bronze, not a mirror
const ENV_MIPS: f32 = 12.0;       // 2048×1024 → 1×1
// Roughness maps to mip level non-linearly: most of the visual change happens in the first third, so a
// linear mapping makes everything above ~0.4 look identically foggy.
// Measured, not guessed: LOD 0.9 rendered single texels as blocks, LOD 6.0 killed every gradient. The
// useful band is in between — enough blur to read as polished bronze, enough detail for the room to move
// across the surface as the figure turns.
const SPEC_LOD: f32 = 3.4;

const PITCH: f32 = 0.26;          // vertical spacing of the six lines
const HALF_W: f32 = 0.52;         // beam half-length
const HALF_H: f32 = 0.052;        // beam half-height
const HALF_D: f32 = 0.085;        // beam half-depth — the mass you see when it turns
const GAP: f32 = 0.15;            // half-width of the yin break
const OBJ_H: f32 = 1.56;          // 6 × PITCH — what the camera distance is derived from

// palette (linear-ish), from the concept: void, oxidised bronze, warm metal, malachite, heat
const HEAT: vec3f = vec3f(1.00, 0.28, 0.06);

const FILLET: f32 = 0.016;        // cast bronze has no sharp arrises

fn sdBox(p: vec3f, b: vec3f) -> f32 {
  let q = abs(p) - (b - vec3f(FILLET));
  return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0) - FILLET;
}

fn hash11(n: f32) -> f32 { return fract(sin(n * 127.1) * 43758.5453); }

// Line i (0 = bottom) out of the packed seed: six base-4 digits, value = digit + 6.
fn lineVal(i: i32) -> i32 {
  var n = i32(u.seed * 4096.0 + 0.5);
  for (var k = 0; k < i; k = k + 1) { n = n / 4; }
  return (n % 4) + 6;
}

// d = distance, heat = 0..1 emissive mask (only ever non-zero on a moving line)
//
// `heat` is carried on a SURFACE, which is the detail that defeated the first attempt: a crack is a void,
// so a ray aimed at the break passes straight through and there is nothing to glow. Real fractured casting
// shows its incandescent core through the split — so the core is modelled as a thin body INSIDE the beam,
// exposed only where the metal has opened. The glow then has something to come from.
struct Hit { d: f32, heat: f32 };

fn mapLine(p: vec3f, v: i32, t: f32) -> Hit {
  let yang = v == 7 || v == 9;
  var d: f32;
  var heat = 0.0;

  if (yang) {
    d = sdBox(p, vec3f(HALF_W, HALF_H, HALF_D));
    if (v == 9) {
      // FRACTURE: the beam splits, and the split WIDENS over time. Breaking a bond is the violent
      // direction of change, so this one is quick and irreversible-looking.
      let openAmt = 0.35 + 0.65 * clamp(t * 0.16, 0.0, 1.0);
      let taper = (p.y + HALF_H) / (2.0 * HALF_H);            // 0 at the underside, 1 at the top
      let halfCrack = 0.010 + 0.055 * openAmt * (0.30 + 0.70 * taper);
      let jag = 0.005 * sin(p.y * 90.0) + 0.004 * sin(p.z * 55.0);
      let crack = halfCrack + jag - abs(p.x);
      d = max(d, crack);

      // The incandescent core, revealed by the break. It sits inside the beam, so it is invisible until
      // the metal opens — and then it is the brightest thing on screen, which is the point.
      let core = sdBox(p, vec3f(HALF_W * 0.97, HALF_H * 0.42, HALF_D * 0.42));
      if (core < d) { d = core; heat = 1.0; } else { heat = 0.0; }
    }
  } else {
    let left = sdBox(p - vec3f(-(HALF_W + GAP) * 0.5, 0.0, 0.0), vec3f((HALF_W - GAP) * 0.5, HALF_H, HALF_D));
    let right = sdBox(p - vec3f((HALF_W + GAP) * 0.5, 0.0, 0.0), vec3f((HALF_W - GAP) * 0.5, HALF_H, HALF_D));
    d = min(left, right);
    if (v == 6) {
      // BRIDGE: metal crystallising across the gap — thin at the middle, still molten there.
      let grow = clamp(0.25 + t * 0.10, 0.0, 1.0);
      let reach = GAP * (0.45 + 0.85 * grow);
      // asymmetric: the strand advances from the left shoulder and meets the right one late
      let along = clamp((p.x + reach) / (2.0 * reach), 0.0, 1.0);
      let neck = 0.014 + 0.030 * grow * (0.35 + 0.65 * abs(along - 0.42) * 2.0);
      let bridge = sdBox(p - vec3f(-reach * (1.0 - grow) * 0.4, 0.0, 0.0),
                         vec3f(reach, neck, HALF_D * (0.40 + 0.22 * grow)));
      if (bridge < d) { d = bridge; heat = (1.0 - grow) * 0.9 * exp(-abs(p.x) * 6.0); } else { heat = 0.0; }
    }
  }
  return Hit(d, heat);
}

fn map(p: vec3f) -> Hit {
  var best = 1e9;
  var heat = 0.0;
  for (var i = 0; i < 6; i = i + 1) {
    let y = (f32(i) - 2.5) * PITCH;
    let h = mapLine(p - vec3f(0.0, y, 0.0), lineVal(i), u.time + f32(i) * 1.7);
    if (h.d < best) { best = h.d; heat = h.heat; }
  }
  return Hit(best, heat);
}

fn normalAt(p: vec3f) -> vec3f {
  let e = vec2f(0.0009, 0.0);
  return normalize(vec3f(
    map(p + e.xyy).d - map(p - e.xyy).d,
    map(p + e.yxy).d - map(p - e.yxy).d,
    map(p + e.yyx).d - map(p - e.yyx).d,
  ));
}

// Ambient occlusion — ranked 3rd most damaging thing to omit. It is what makes six beams read as a stack
// rather than six things floating at the same distance.
fn ao(p: vec3f, n: vec3f) -> f32 {
  var occ = 0.0;
  var sca = 1.0;
  for (var i = 0; i < 5; i = i + 1) {
    let h = 0.015 + 0.075 * f32(i);
    occ = occ + (h - map(p + n * h).d) * sca;
    sca = sca * 0.70;
  }
  return clamp(1.0 - 2.6 * occ, 0.0, 1.0);
}

fn fresnelSchlick(cosTheta: f32, f0: vec3f) -> vec3f {
  let x = clamp(1.0 - cosTheta, 0.0, 1.0);
  let x2 = x * x;
  return f0 + (vec3f(1.0) - f0) * (x2 * x2 * x);   // exponent 5, per Schlick — not an artistic 2–3
}

// Exact sRGB OETF. pow(x, 1/2.2) is an approximation and lifts the near-blacks this scene lives in.
fn linearToSrgb(x: vec3f) -> vec3f {
  let lo = 12.92 * x;
  let hi = 1.055 * pow(max(x, vec3f(0.0)), vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, x <= vec3f(0.0031308));
}

@fragment fn fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let uv = ((frag.xy * 2.0 - u.res) / u.res.y) * vec2f(1.0, -1.0);   // frag.y is top-down; scene +Y is up
  let t = u.time;

  // 85mm-equivalent product framing: a long lens keeps the top and bottom of the stack the same size.
  // Distance is DERIVED from how much of the frame the figure should fill, rather than typed in — so a
  // variant sheet can sweep the share and the camera follows correctly instead of being re-guessed.
  //   dist = objectHeight / (2 · tan(vFov/2) · share),  tan(vFov/2) = 1/4.722
  let share = select(u.vary.x, 0.64, u.vary.x <= 0.0);
  let lift = select(u.vary.y, 0.10, u.vary.y == 0.0);   // chosen framing; vary only overrides for sheets
  let yaw = 0.26 + sin(t * 0.05) * 0.05;       // a slight, slow turn — enough to show the beams have depth
  let elev = 0.105;                            // 6°: above 12–15° the stack starts reading as steps
  let dist = OBJ_H * 4.722 / (2.0 * share);
  let ro = vec3f(sin(yaw) * cos(elev) * dist, sin(elev) * dist, cos(yaw) * cos(elev) * dist);
  let ww = normalize(-ro);
  let uu = normalize(cross(vec3f(0.0, 1.0, 0.0), ww));
  let vv = cross(ww, uu);
  let rd = normalize((uv.x) * uu + (uv.y - lift) * vv + 4.722 * ww);

  var tHit = 0.0;
  var hit = false;
  var heat = 0.0;
  for (var i = 0; i < 88; i = i + 1) {
    let p = ro + rd * tHit;
    let h = map(p);
    if (h.d < 0.0008) { hit = true; heat = h.heat; break; }
    tHit = tHit + h.d * 0.9;
    if (tHit > 14.0) { break; }
  }

  // The void: one soft source behind the figure, like a furnace door out of frame. Scene-linear values —
  // these are radiance, not sRGB colours.
  // A black void with one soft pool of light behind the figure. Scene-linear radiance, not sRGB numbers.
  // Sampling the environment directly here would show its texels as squares and, worse, would contradict
  // the concept: the room is what the bronze REFLECTS, not what the viewer looks at.
  let pool = exp(-2.7 * length((uv - vec2f(0.05, 0.12)) * vec2f(1.0, 1.30)));
  var col = mix(vec3f(0.0020, 0.0023, 0.0030), vec3f(0.042, 0.028, 0.016), pool);

  if (hit) {
    let p = ro + rd * tHit;
    let n = normalAt(p);
    let v = -rd;

    // Oxidised bronze with malachite settled into the low spots, warmer where it is polished by the light.
    let grain = hash11(floor(p.y * 240.0) + floor(p.x * 40.0) * 7.1);
    let patina = smoothstep(0.55, 0.95, 1.0 - abs(n.y)) * (0.25 + 0.30 * grain);
    var base = mix(vec3f(0.86, 0.52, 0.22), vec3f(0.075, 0.170, 0.140), patina * 0.32);
    base = base * (0.90 + 0.10 * grain);

    // Image-based lighting: the metal shows the room. One CC0 HDRI does what a rig of analytic lights
    // only approximates, and it is the highest quality-per-effort move available.
    let refl = reflect(rd, n);
    let spec = envDir(refl, SPEC_LOD);                       // what the surface mirrors
    let amb = envDir(n, ENV_MIPS - 3.0) * 0.18;                    // the soft wash from the same room
    let f = fresnelSchlick(max(dot(n, v), 0.0), base);
    let occ = ao(p, n);

    // A conductor has no diffuse term: everything you see is reflected, tinted by F0.
    col = (spec * f + amb * base) * occ;

    // One small analytic key remains, purely to guarantee a crisp highlight — an environment this dark
    // gives a beautiful wash but no single hard glint, and the glint is what says "polished".
    let key = normalize(vec3f(0.57, 0.62, 0.54));
    let hv = normalize(key + v);
    col = col + vec3f(1.00, 0.94, 0.82) * pow(max(dot(n, hv), 0.0), 110.0) * 0.7 * occ;

    // THE EVENT. Emissive, far above 1.0 so the tone curve has somewhere to take it, and present only
    // where metal is breaking or knitting. Nothing else in this scene emits — that restraint is what makes
    // one glowing line read as something happening rather than as decoration.
    let flicker = 0.86 + 0.14 * sin(t * 6.0 + p.x * 14.0);
    col = col + HEAT * heat * 9.0 * flicker + vec3f(1.0, 0.74, 0.36) * heat * heat * 5.0;

    // Depth: the far end of the stack sits back rather than competing with the near end.
    col = mix(col, vec3f(0.004, 0.005, 0.007), clamp((tHit - dist + 0.9) * 0.30, 0.0, 0.7));
  }

  // Reinhard-Jodie: tone maps on luminance and keeps hue, so the heat goes white-hot instead of
  // acid-orange the way a per-channel curve would take it.
  let lum = dot(col, vec3f(0.2126, 0.7152, 0.0722));
  let tv = col / (1.0 + col);
  let tl = lum / (1.0 + lum);
  col = mix(col / (1.0 + lum), tv, tv * 0.5 + vec3f(tl * 0.5));

  // Vignette, gently — 18% at the corners.
  let q = uv * 0.5 + vec2f(0.5);
  let vig = pow(clamp(16.0 * q.x * (1.0 - q.x) * q.y * (1.0 - q.y), 0.0, 1.0), 0.20);
  col = col * mix(0.82, 1.0, vig);

  col = linearToSrgb(col);

  // Dither before 8-bit quantisation: without it this much near-black bands into visible steps.
  let dith = (hash11(frag.x * 1.7 + frag.y * 91.3) - 0.5) / 255.0;
  return vec4f(col + vec3f(dith), 1.0);
}
