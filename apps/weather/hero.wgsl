// apps/weather/hero.wgsl — "Небо над містом" / The sky, as this farm draws it.
//
// NOT a blue sky. The 21st catalogue's canonical answer (Cloudscape and its dozen cousins) is saturated
// cerulean with white cumulus, and it would be the most saturated object in the entire farm — the material
// here is neutral greyscale and colour is reserved for meaning. So the weather is carried by STRUCTURE and
// MOTION over the page's own base colour: the sky is the base, LIT. The one reference that read as
// shippable at this bar was a near-black storm hero with sparse fine streaks on a shear; that is the
// register. Full reasoning in RESEARCH.md.
//
// Every number below is real. The scene is not "a rainy mood", it is THIS hour's reading:
//   vary.x  sun altitude, -1 (≤ -12°, deep night) · 0 (horizon) · 1 (zenith)
//   vary.y  cloud cover 0..1            vary.z  precipitation 0..1        vary.w  wind 0..1
//   ink.x   frozen fraction (snow)      ink.y   haze from visibility      ink.z   thunder 0/1
//   ink.w   the light's x on screen (sunrise 0 · noon 0.5 · sunset 1)
//   seed    moon phase 0..1 (0 new, 0.5 full)
//   env.x   light-theme amount — the RUNTIME fills this, so the sky inverts with the theme
//
// THE LEGIBILITY CONTRACT, and it is a contract, not a preference. The hero type sits directly on this
// stage with no card behind it (a card would hide the one thing worth opening the app for), and axe cannot
// see a canvas — it reads the DOM background and would sign off on white-on-white. So the clamp at the
// bottom of this file is the gate: the frame never travels more than 0.085 in linear luminance in the
// direction that would eat the text (brighter in the dark theme, darker in the light one). It may travel
// freely the other way, which is where the drama goes. Move that number and you are moving a contrast
// floor for every string on the screen.

struct U { res: vec2f, time: f32, seed: f32, ink: vec4f, vary: vec4f, env: vec4f };
@group(0) @binding(0) var<uniform> u: U;

// The page's own two bases: #2A2A2E and #EEEEF1 from theme.css.  The sky is these colours lit, never a
// palette of its own — that is what keeps the stage and the panels one material.
//
// EVERYTHING HERE COMPOSITES IN DISPLAY SPACE, not linear, and that is a correction rather than a shortcut.
// The first cut worked in linear light with tarot's constants, and against a base of 0.024 linear an
// innocent "+0.055" is a 2.3× lift: every term slammed into the legibility clamp and the whole frame came
// out one flat slab of grey with no sun in it. In display space the numbers below mean what they look like
// — base 0.165, so +0.03 is a visible but quiet step — and the budget is legible to the next reader.
const BASE_D: vec3f = vec3f(0.1647, 0.1647, 0.1804);
const BASE_L: vec3f = vec3f(0.9333, 0.9333, 0.9451);
// Light temperature is the ONE place hue is allowed, because it means something: low sun is warm, high sun
// is neutral-cool, night is cold. Chroma stays under ~0.05 so it reads as temperature, not as a colour scheme.
const WARM: vec3f = vec3f(1.000, 0.760, 0.520);
const COOL: vec3f = vec3f(0.760, 0.840, 1.000);

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

fn fbm(p0: vec2f) -> f32 {
  var v = 0.0;
  var a = 0.5;
  var p = p0;
  let rot = mat2x2f(0.86, 0.51, -0.51, 0.86);
  for (var i = 0; i < 5; i = i + 1) {
    v = v + a * noise(p);
    p = rot * p * 2.0;
    a = a * 0.5;
  }
  return v;
}

/** The cloud field at a point: domain-warped fbm, so the deck has the folded structure weather has and not
    the even lumpiness of plain fbm. `w` is the wind offset; the warp is what makes it read as volume. */
fn deck(p: vec2f, w: f32) -> f32 {
  let q = p + vec2f(w, 0.0);
  let warp = vec2f(fbm(q * 1.3), fbm(q * 1.3 + vec2f(5.2, 1.3)));
  return fbm(q * 2.1 + warp * 1.1);
}

/** Distance from `p` to the segment a→b. Rain is a SEGMENT, not a dot: a falling drop is motion-blurred
    over the frame time, and drawing it as a point is the difference between rain and static. */
fn segDist(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

@fragment
fn fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let uv = vec2f(frag.x / u.res.x, frag.y / u.res.y);          // top-down, as WebGPU delivers it
  let aspect = vec2f(u.res.x / max(u.res.y, 1.0), 1.0);
  let p = (uv - 0.5) * aspect;                                 // half-width is aspect.x * 0.5
  let t = u.time;

  let alt = u.vary.x;
  let cloud = clamp(u.vary.y, 0.0, 1.0);
  let wet = clamp(u.vary.z, 0.0, 1.0);
  let wind = clamp(u.vary.w, 0.0, 1.0);
  let snow = clamp(u.ink.x, 0.0, 1.0);
  let haze = clamp(u.ink.y, 0.0, 1.0);
  let storm = clamp(u.ink.z, 0.0, 1.0);
  let lightX = u.ink.w;
  let lit = clamp(u.env.x, 0.0, 1.0);                          // 0 dark theme, 1 light theme

  let base = mix(BASE_D, BASE_L, lit);
  // Two directions, not one. STRUCTURE (horizon ramp, cloud bodies, veil) moves away from the page — up out
  // of a dark page, down out of a light one — because that is what makes it visible at all. LIGHT (the sun,
  // the moon, stars) always moves toward brighter, in both themes: a sun that darkened in the light theme
  // would be a hole. Its amplitude drops in the light theme simply because there is less room above 0.93.
  let sign = mix(1.0, -1.0, lit);
  let glow = mix(1.0, 0.42, lit);
  // Civil twilight is where a sky stops being a sky, so that is where `dayness` turns, not at 0°.
  let dayness = smoothstep(-0.30, 0.16, alt);
  let night = 1.0 - dayness;

  // ---- the light source ------------------------------------------------------------------------------
  // One source, positioned by the REAL sun: x from its azimuth, y from its altitude. Below the horizon it
  // sinks out of frame and only its glow is left, which is exactly what dusk looks like.
  let sunY = mix(0.74, 0.07, clamp(alt, 0.0, 1.0)) - clamp(alt, -1.0, 0.0) * 0.34;
  let sunP = vec2f((lightX - 0.5) * aspect.x * 1.35, sunY - 0.5);
  // A low sun's light spreads along the horizon, not around a point: the vertical squash tightens as the
  // sun drops, so dusk is a BAND and noon is a bloom. Without it, golden hour renders as a brown circle
  // floating at 60% height, which is an airbrush effect and not a sky.
  let squash = mix(0.42, 0.95, smoothstep(0.0, 0.45, alt));
  let dSun = distance(vec2f(p.x, (p.y - sunP.y) / squash + sunP.y), sunP);
  // SCALE NOTE, and it caught two terms here: p is isotropic and 1.0 p-unit is the frame HEIGHT, so on a
  // 384×832 phone one p-unit is 832 px. The first halo used 0.85 — a 707 px radius, i.e. the whole screen —
  // so it was a flat global lift with no glow in it at all. A halo is 0.30 (250 px).
  //
  // THE SUN HAS NO DISC, and that is the design, not a limitation. A hard grey circle in a monochrome sky
  // is indistinguishable from the moon — the first renders of a clear noon and a clear midnight were the
  // same picture, and no amount of tuning the brightness fixes that, because in this palette there is no
  // brightness left to spend. So: DAY is broad light with a hot centre and no edge; NIGHT is a small crisp
  // disc plus stars. The two can then never be confused, and it is also what the sky actually looks like.
  // Cloud cover dissolves the hot centre while the wider terms survive — overcast reads as a bright REGION
  // rather than as an object behind a curtain.
  let core = pow(smoothstep(0.13, 0.0, dSun), 2.0) * (1.0 - cloud * 0.88) * dayness;
  let halo = pow(smoothstep(0.30, 0.01, dSun), 1.6) * (0.34 + 0.66 * dayness);
  // A third, very wide term — atmospheric scatter. Without it a clear noon and a clear midnight render
  // almost identically in the dark theme, because a 250 px halo lights nothing but its own corner. This is
  // the term that makes the screen FEEL like day, and it is why the sun needs three radii and not one.
  let scatter = pow(smoothstep(1.10, 0.02, dSun), 1.15) * dayness;
  // Warm within ~12° of the horizon, cooling as it climbs. `alt` is normalised, so 0.13 ≈ 12°.
  let warmth = 1.0 - smoothstep(0.02, 0.40, alt);
  let tint = mix(COOL, WARM, warmth * dayness);

  // ---- the sky body ----------------------------------------------------------------------------------
  // A vertical ramp away from the page toward the horizon: brighter low in the dark theme, darker low in
  // the light one. Real skies are brightest at the horizon and this is also what leaves the top quiet,
  // which is where the temperature reading sits.
  // The budget, in display units against a 0.165 / 0.933 base. Nothing here is free-hand: the frame has to
  // spend less than the clamp allows or the clamp does the composing, which is what produced the flat slab.
  //   horizon ramp 0.012…0.038 · halo 0.014…0.046 · cloud body ±0.045 · rim ±0.030 · rain 0.022
  //   stars 0.075 (points) · moon 0.10 (a disc) · sun core 0.19 (the one thing allowed to reach the ceiling)
  var col = base;
  // The horizon term is now TWILIGHT only — the warm band low in the frame when the sun is near the
  // horizon. It used to carry the day's brightness and could not: its maximum is at the bottom of the
  // frame, which is exactly where the panel fade below flattens everything back to the page.
  let horizon = pow(smoothstep(0.10, 0.92, uv.y), 1.6);
  col = col + tint * sign * horizon * (0.010 + 0.030 * warmth * dayness);
  col = col + tint * glow * dayness * 0.045;                   // daylight is everywhere, not only near the sun
  col = col + tint * glow * scatter * 0.105;
  col = col + tint * glow * halo * (0.020 + 0.060 * dayness);
  col = col + tint * glow * core * 0.075;

  // ---- stars -----------------------------------------------------------------------------------------
  // Only at night, only in the dark theme (a white sky has no stars), and killed by cloud. Cell-hashed so
  // each one twinkles on its own clock instead of the field pulsing together.
  let starAmt = night * (1.0 - lit) * (1.0 - cloud * 0.95) * smoothstep(0.9, 0.2, uv.y);
  if (starAmt > 0.001) {
    let g = vec2f(p.x * 26.0, p.y * 26.0);
    let cell = floor(g);
    let f = fract(g);
    var s = 0.0;
    for (var oy = -1; oy <= 1; oy = oy + 1) {
      for (var ox = -1; ox <= 1; ox = ox + 1) {
        let o = vec2f(f32(ox), f32(oy));
        let id = cell + o;
        let r = hash(id * 1.7);
        if (r > 0.945) {                                       // ~5 stars per 100 cells — a sky, not glitter
          let jit = vec2f(hash(id + 3.0), hash(id + 9.0));
          let dd = length(f - o - jit);
          let tw = 0.45 + 0.55 * sin(t * 1.3 + r * 60.0);
          // A cell is ~32 px, so the first 0.045 drew a 1.4 px point at 0.075 amplitude — arithmetically a
          // star, visually nothing. 0.075 of a cell is 2.4 px, which is the smallest a star can be and
          // still survive the dither.
          s = s + smoothstep(0.095, 0.0, dd) * tw * (0.4 + 0.6 * r);
        }
      }
    }
    col = col + COOL * s * starAmt * 0.19;
  }

  // ---- the moon ---------------------------------------------------------------------------------------
  // One disc, no craters. The terminator is the real phase (seed), so a crescent night and a full-moon
  // night are visibly different evenings rather than the same wallpaper.
  let moonAmt = night * (1.0 - cloud * 0.88);
  if (moonAmt > 0.01) {
    // 0.022 p-units is an 18 px radius on the reference device. The first cut used 0.0395 — a 66 px ball,
    // which reads as a sticker rather than as the moon.
    let mp = vec2f((0.5 - lightX) * aspect.x * 1.15, -0.27);
    let dm = distance(p, mp);
    let disc = smoothstep(0.024, 0.020, dm);
    // Phase: a shadow disc of the same radius slides across the face. Its offset is the whole model —
    // 0 covers the moon exactly (new), 2.2R clears it entirely (full), and the SIDE it comes from is what
    // separates waxing from waning. Getting this backwards renders a full moon as an empty sky, which is
    // what the first version did: it offset by (seed - 0.5), so seed 0.5 put the shadow dead centre.
    let k = 1.0 - abs(u.seed - 0.5) * 2.0;                      // 0 new, 1 full
    let side = select(-1.0, 1.0, u.seed < 0.5);
    let off = side * k * 0.049;                                 // 2.2 × the radius clears the disc entirely
    let face = disc * (1.0 - smoothstep(0.024, 0.020, distance(p - vec2f(off, 0.0), mp)));
    col = col + COOL * glow * face * moonAmt * 0.165;
    col = col + COOL * glow * pow(smoothstep(0.22, 0.02, dm), 2.0) * moonAmt * 0.055;
  }

  // ---- the cloud deck ---------------------------------------------------------------------------------
  // Two layers at different scales and speeds, so the sky has parallax instead of one sliding texture.
  // Drift is the real wind, with a floor: a dead-calm sky still moves, just slowly.
  // Scales are set from the pixel sizes wanted, per the note above: the main deck's features are ~1/6 of a
  // p-unit (≈140 px) and the cirrus ~1/14 (≈60 px). The first cut ran at 1.35, which is a 600 px feature —
  // one soft smudge per screen, which is why it read as a blurred photo rather than as cloud.
  let drift = t * (0.02 + wind * 0.20);
  let hi = deck(vec2f(p.x * 14.0, p.y * 9.0), drift * 1.9);
  let lo = deck(vec2f(p.x * 6.5, p.y * 4.4), drift);
  // Coverage is a threshold on the field, not an opacity: at 20% cover you want a few discrete clouds, and
  // fading the whole deck to 20% alpha gives you overcast haze instead. The threshold is what makes the
  // difference between "few clouds" and "thin overcast" visible at a glance.
  // Calibrated to the field's ACTUAL range, not to 0..1: warped fbm lives roughly in 0.25..0.80, so the old
  // threshold of 1.02 - cloud*1.06 meant "few clouds" (0.15) rendered a completely empty sky. 0.78 keeps a
  // couple of wisps at 0.1 cover and closes the lid at 1.0.
  let edge = 0.78 - cloud * 0.56;
  var body = smoothstep(edge, edge + 0.30, lo) * (0.35 + 0.65 * cloud);
  let cirrus = smoothstep(edge + 0.06, edge + 0.34, hi) * (0.18 + 0.30 * cloud);
  // Directional derivative toward the light = the lit rim. This one line is most of why the deck reads as
  // volume rather than as a stain; sampling symmetrically gives a flat grey blob.
  let toLight = normalize(sunP - p + vec2f(0.0001, 0.0001));
  let lp = p + toLight * 0.030;
  let rim = clamp((lo - deck(vec2f(lp.x * 6.5, lp.y * 4.4), drift)) * 3.4, -1.0, 1.0);
  let cloudLight = 0.30 + 0.70 * dayness;
  col = mix(col, base + tint * sign * (0.030 + 0.020 * cloudLight) * (0.75 + rim * 0.85), body * 0.90);
  col = col + tint * sign * cirrus * 0.014 * (0.4 + cloudLight);

  // ---- precipitation ----------------------------------------------------------------------------------
  // Rain is sheared by the wind and drawn as segments; snow is slow, round and swings. Both come out of one
  // cell grid so the count scales with intensity instead of with a magic constant.
  if (wet > 0.01) {
    let shear = (lightX - 0.5) * 0.0 + (wind - 0.15) * 0.85;    // wind tilts the fall; calm rain is vertical
    let fall = mix(1.55 + wind * 1.1, 0.20 + wind * 0.22, snow); // snow falls ~7× slower than rain
    let cols = mix(30.0, 15.0, snow);
    let g = vec2f((p.x - p.y * shear) * cols, p.y * cols * 0.5 - t * fall);
    let cell = floor(g);
    let f = fract(g);
    var wetness = 0.0;
    for (var oy = -1; oy <= 1; oy = oy + 1) {
      for (var ox = -1; ox <= 1; ox = ox + 1) {
        let o = vec2f(f32(ox), f32(oy));
        let id = cell + o;
        let r = hash(id * 2.3);
        if (r < wet * 0.55 + 0.04) {
          let jx = hash(id + 17.0);
          let sway = sin(t * 1.1 + r * 30.0) * 0.22 * snow;      // flakes drift sideways; drops do not
          let c = f - o - vec2f(jx + sway, hash(id + 31.0));
          // A drop is a streak along the fall direction; a flake is a soft point. One expression, one knob.
          // Thickness is in CELL units and a cell is ~28 px wide here, so the first 0.016 drew a 0.44 px
          // line — mathematically present, invisible on a screen. 0.05 is the 1.4 px a rain streak wants.
          let len = mix(0.45, 0.02, snow);
          let d = segDist(c, vec2f(0.0, -len), vec2f(0.0, len));
          let thick = mix(0.05, 0.07, snow);
          wetness = wetness + smoothstep(thick, 0.0, d) * (0.5 + 0.5 * r);
        }
      }
    }
    // Precipitation is DARKER than the sky it falls through in a bright frame and brighter in a dark one:
    // it is lit by the same source, and against the page it must read as a mark either way.
    col = col + tint * sign * wetness * (0.030 + 0.020 * dayness) * mix(1.0, 1.6, snow);
  }

  // ---- haze -------------------------------------------------------------------------------------------
  // Low visibility does not add a colour, it REMOVES contrast — it pulls everything toward the horizon's
  // value from the ground up, which is what fog does to a view.
  let veil = haze * smoothstep(0.05, 0.95, uv.y);
  col = mix(col, base + tint * sign * 0.018, veil * 0.72);

  // ---- lightning --------------------------------------------------------------------------------------
  // ~1 strike per 11 s, decaying over ~0.2 s, with a double-tick. Deliberately far under the 3 Hz flash
  // threshold, and reduced-motion freezes the clock upstream, so a still frame never strobes.
  if (storm > 0.5) {
    let ph = t * 0.09;
    let n = floor(ph);
    let f = fract(ph);
    if (hash(vec2f(n, 3.0)) > 0.45) {
      let bolt = exp(-f * 26.0) * (0.65 + 0.35 * sin(f * 120.0));
      col = col + tint * glow * max(bolt, 0.0) * 0.10 * smoothstep(0.95, 0.1, uv.y);
    }
  }

  // ---- the page takes over ----------------------------------------------------------------------------
  // The panels start around 72% down. Below that the stage returns to the flat base so a surface sits on
  // the page and not on weather — the sky is atmosphere for the glance, never a texture under a list.
  col = mix(col, base, smoothstep(0.66, 0.96, uv.y));
  let vign = smoothstep(1.15, 0.30, length((uv - vec2f(0.5, 0.36)) * vec2f(1.0, 0.8)));
  col = mix(base, col, mix(0.55, 1.0, vign));

  // ---- THE LEGIBILITY CLAMP (see the header) ----------------------------------------------------------
  // Display-space luminance may move 0.17 toward the page's own extreme and 0.30 away from it. Scaling the
  // colour by the ratio (rather than clamping each channel) keeps the hue and only spends the range, so a
  // clamped sunrise is still a sunrise.
  //
  // MEASURED, so the number is not a guess: base-content is #EDEDF0 on #2A2A2E. At the ceiling (0.165 +
  // 0.17 = 0.335 display, 0.0900 linear) that text still reads 6.4:1, and at the light theme's floor
  // (#0A0A0C on 0.763 display) 12.6:1. Both clear 4.5:1 with room, which is the point — the clamp is a
  // FLOOR under legibility, not a look. The composition above is budgeted to land inside it on its own;
  // if a frame is riding this clamp, the bug is in the budget, not here.
  let baseY = dot(base, vec3f(0.2126, 0.7152, 0.0722));
  let y = dot(col, vec3f(0.2126, 0.7152, 0.0722));
  let up = mix(0.170, 0.300, lit);                              // dark theme: brighter is the risky way
  let dn = mix(0.300, 0.170, lit);                              // light theme: darker is
  let clamped = clamp(y, baseY - dn, baseY + up);
  col = col * (clamped / max(y, 1e-5));

  // Already in display space (see the header), so no sRGB transfer here — only grain and a ±0.5/255 dither.
  // On a near-flat neutral field, banding is the defect that reads as "cheap" before anything else does.
  col = clamp(col + (hash(frag.xy + t * 10.0) - 0.5) * 0.008, vec3f(0.0), vec3f(1.0));
  return vec4f(col + (hash(frag.yx) - 0.5) / 255.0, 1.0);
}
