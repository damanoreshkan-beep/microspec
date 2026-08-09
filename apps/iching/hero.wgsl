// apps/iching/hero.wgsl — "Течія і структура" / Current and Structure.
//
// The I Ching is the Book of CHANGES, so the stage is a moving field, not an object on a plinth. The first
// attempt lit six bronze beams with an HDRI and a ray march: technically correct, and it read as chocolate
// bars floating in a void. The category was wrong, not the parameters — no amount of tuning roughness was
// going to rescue a still life when the subject is flux.
//
// What replaced it is the shape modern WebGL hero sections actually use (21st.dev's liquid/silk family,
// whose source I read rather than guessed at): a full-bleed DOMAIN-WARPED fbm field. Three octave stacks,
// each displaced by the one before it, is what produces flow that looks filmed instead of generated. It
// needs no environment map, no PBR and no ray marching — it is CHEAPER than what it replaces, and it also
// lets the 6.5 MB env.hdr go entirely.
//
// The hexagram sits IN that current: the six lines are not solids but SLITS where the field burns through.
// Yang is an unbroken slit, yin is broken at the centre, and a moving line breathes — the one place the
// reading is unsettled is the one place the light is alive.
//
// Uniform layout is unchanged (res, time, seed, ink, vary) so tools/art/hero.mjs renders it offline. There
// is deliberately no texture binding any more, which both runtimes detect rather than assume.

struct U { res: vec2f, time: f32, seed: f32, ink: vec4f, vary: vec4f };
@group(0) @binding(0) var<uniform> u: U;

// Ink: near-black indigo → deep jade → gold. Classical Chinese rather than the farm's clay palette, because
// the owner asked for an atmosphere that belongs to THIS app and to no other.
const DEEP: vec3f = vec3f(0.017, 0.026, 0.052);
const MID:  vec3f = vec3f(0.075, 0.165, 0.205);
const GOLD: vec3f = vec3f(0.92, 0.72, 0.36);

fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453123);
}

fn noise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let a = hash(i);
  let b = hash(i + vec2f(1.0, 0.0));
  let c = hash(i + vec2f(0.0, 1.0));
  let d = hash(i + vec2f(1.0, 1.0));
  let uu = f * f * (3.0 - 2.0 * f);
  return mix(a, b, uu.x) + (c - a) * uu.y * (1.0 - uu.x) + (d - b) * uu.x * uu.y;
}

// Six octaves, each ROTATED as well as doubled. The rotation is what stops the noise showing its square
// lattice — without it the field reads as a grid at precisely the moment it should read as smoke.
fn fbm(p0: vec2f) -> f32 {
  var v = 0.0;
  var a = 0.5;
  var p = p0;
  let rot = mat2x2f(0.86, 0.51, -0.51, 0.86);
  for (var i = 0; i < 6; i = i + 1) {
    v = v + a * noise(p);
    p = rot * p * 2.0;
    a = a * 0.5;
  }
  return v;
}

// Line i (0 = bottom) out of the packed seed: six base-4 digits, value = digit + 6.
// 6 = old yin (moving), 7 = young yang, 8 = young yin, 9 = old yang (moving).
fn lineVal(i: i32) -> i32 {
  var n = i32(u.seed * 4096.0 + 0.5);
  for (var k = 0; k < i; k = k + 1) { n = n / 4; }
  return (n % 4) + 6;
}

@fragment
fn fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let uv = vec2f(frag.x / u.res.x, frag.y / u.res.y);          // top-down, as WebGPU delivers it
  let t = u.time * 0.14;
  let aspect = vec2f(u.res.x / max(u.res.y, 1.0), 1.0);
  let p = (uv - 0.5) * aspect;

  // ---- the current ------------------------------------------------------------------------------------
  // Each stack is displaced by the one before it. Warping the DOMAIN rather than blending the outputs is
  // the whole trick: it bends the noise along itself, which is what a fluid does and what layered noise
  // never does on its own.
  let flowP = vec2f(p.x * 1.1, p.y - t * 0.35);
  let n1 = fbm(flowP * 2.8 + vec2f(0.0, t * 0.2));
  let n2 = fbm((flowP + n1 * 0.45) * 4.0 - vec2f(0.0, t * 0.35));
  let n3 = fbm((flowP + n2 * 0.4) * 6.5 + vec2f(t * 0.15, 0.0));

  let structure = n3 * 1.15 + (n2 - 0.5) * 0.5 + (n1 - 0.5) * 0.3;

  // Thresholds are NOT the reference's. Those were tuned against a pale blue-and-white palette where the
  // bright band is the subject; ours is near-black ink where light must stay an ACCENT. Reusing 0.18/0.62
  // on this palette washed the whole frame to milk — the field has to sit mostly in DEEP.
  let lowBand  = smoothstep(0.42, 0.92, structure);
  let highBand = smoothstep(0.86, 1.30, structure);
  var col = mix(DEEP, MID, lowBand);
  col = mix(col, GOLD * 0.42, highBand);

  // ---- the structure ----------------------------------------------------------------------------------
  // Six slits, laid out in the UPPER portion so the floating island at the bottom of the screen never
  // covers the figure. Composition fixed at 384×832, the reference device. Bottom-first is the hexagram's
  // own reading order, so line 0 is drawn lowest.
  // Width is a FRACTION of the frame, never an absolute: p.x only spans ±aspect.x, which is ±0.23 on the
  // 384×832 reference phone and ±0.71 on a 1280×900 desktop. A fixed 0.30 ran the lines off both edges of
  // the phone and would have left them stubby on desktop. Capped so a wide screen does not stretch the
  // hexagram into a barcode.
  // p = (uv - 0.5) * aspect, so the frame's half-width is aspect.x * 0.5 — NOT aspect.x. Taking 0.72 of
  // the wrong base is what ran the lines off both edges twice.
  let halfW = min(aspect.x * 0.5 * 0.72, 0.42);
  let share = select(u.vary.x, halfW, u.vary.x <= 0.0);         // half-width of a full line, in p-space
  let top   = select(u.vary.y, -0.30, u.vary.y == 0.0);         // TOP line's y; p.y grows DOWNWARD here
  let gap   = 0.075;
  let thick = 0.0055;
  let brk   = halfW * 0.26;                                     // half-width of the yin break

  var glow = 0.0;
  for (var i = 0; i < 6; i = i + 1) {
    let v = lineVal(i);
    // p.y increases DOWNWARD (uv is top-down), so the hexagram's bottom line — index 0 — needs the LARGEST
    // y. Subtracting here is what put the reading upside down on the first render.
    let y = top + f32(5 - i) * gap;
    let dy = abs(p.y - y);

    // Along-the-line mask: yang unbroken, yin cut at the centre. A moving line pulses, slowly, so the eye
    // finds the unsettled line before any text names it.
    let yang = (v == 7 || v == 9);
    let moving = (v == 6 || v == 9);
    var along = smoothstep(share, share - halfW * 0.16, abs(p.x));
    if (!yang) { along = along * smoothstep(brk * 0.55, brk, abs(p.x)); }

    let core = smoothstep(thick, 0.0, dy) * along;
    let halo = smoothstep(thick * 5.0, 0.0, dy) * along;
    let beat = select(1.0, 0.72 + 0.28 * sin(u.time * 1.6 + f32(i)), moving);

    glow = glow + (core + halo * 0.22) * beat;
  }

  // The slit is where the field burns THROUGH: the current's own brightness modulates it, so the figure
  // belongs to the flow instead of being a decal laid over it.
  let burn = glow * (0.45 + 0.75 * smoothstep(0.30, 1.05, structure));
  col = col + GOLD * burn * 1.05 + vec3f(1.0, 0.95, 0.86) * pow(glow, 4.0) * 0.16;

  // ---- finishing --------------------------------------------------------------------------------------
  // A heavy vignette is doing real work here, not decoration: it darkens the bottom third so the floating
  // island reads against ink rather than against the busiest part of the current.
  let vign = smoothstep(1.15, 0.30, length(uv - vec2f(0.5, 0.42)));
  col = col * mix(0.45, 1.04, vign);
  col = clamp((col - 0.5) * 1.08 + 0.5, vec3f(0.0), vec3f(1.0));

  // Grain, then the exact sRGB transfer. Dither at ±0.5/255 keeps a dark gradient from banding — on a
  // near-black field like this one, banding is the single most expensive-looking defect there is.
  col = clamp(col + (hash(frag.xy + t * 10.0) - 0.5) * 0.020, vec3f(0.0), vec3f(1.0));
  let srgb = select(1.055 * pow(col, vec3f(1.0 / 2.4)) - 0.055, col * 12.92, col <= vec3f(0.0031308));
  return vec4f(srgb + (hash(frag.yx) - 0.5) / 255.0, 1.0);
}
