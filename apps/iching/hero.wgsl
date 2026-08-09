
struct U { res: vec2f, time: f32, seed: f32, ink: vec4f, vary: vec4f };
@group(0) @binding(0) var<uniform> u: U;

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

fn lineVal(i: i32) -> i32 {
  var n = i32(u.seed * 4096.0 + 0.5);
  for (var k = 0; k < i; k = k + 1) { n = n / 4; }
  return (n % 4) + 6;
}

@fragment
fn fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let uv = vec2f(frag.x / u.res.x, frag.y / u.res.y);
  let t = u.time * 0.14;
  let aspect = vec2f(u.res.x / max(u.res.y, 1.0), 1.0);
  let p = (uv - 0.5) * aspect;

  let flowP = vec2f(p.x * 1.1, p.y - t * 0.35);
  let n1 = fbm(flowP * 2.8 + vec2f(0.0, t * 0.2));
  let n2 = fbm((flowP + n1 * 0.45) * 4.0 - vec2f(0.0, t * 0.35));
  let n3 = fbm((flowP + n2 * 0.4) * 6.5 + vec2f(t * 0.15, 0.0));

  let structure = n3 * 1.15 + (n2 - 0.5) * 0.5 + (n1 - 0.5) * 0.3;

  let lowBand  = smoothstep(0.42, 0.92, structure);
  let highBand = smoothstep(0.86, 1.30, structure);
  var col = mix(DEEP, MID, lowBand);
  col = mix(col, GOLD * 0.42, highBand);

  let halfW = min(aspect.x * 0.5 * 0.72, 0.42);
  let share = select(u.vary.x, halfW, u.vary.x <= 0.0);
  let top   = select(u.vary.y, -0.30, u.vary.y == 0.0);
  let gap   = 0.075;
  let thick = 0.0055;
  let brk   = halfW * 0.26;

  var glow = 0.0;
  for (var i = 0; i < 6; i = i + 1) {
    let v = lineVal(i);
    let y = top + f32(5 - i) * gap;
    let dy = abs(p.y - y);

    let yang = (v == 7 || v == 9);
    let moving = (v == 6 || v == 9);
    var along = smoothstep(share, share - halfW * 0.16, abs(p.x));
    if (!yang) { along = along * smoothstep(brk * 0.55, brk, abs(p.x)); }

    let core = smoothstep(thick, 0.0, dy) * along;
    let halo = smoothstep(thick * 5.0, 0.0, dy) * along;
    let beat = select(1.0, 0.72 + 0.28 * sin(u.time * 1.6 + f32(i)), moving);

    glow = glow + (core + halo * 0.22) * beat;
  }

  let burn = glow * (0.45 + 0.75 * smoothstep(0.30, 1.05, structure));
  col = col + GOLD * burn * 1.05 + vec3f(1.0, 0.95, 0.86) * pow(glow, 4.0) * 0.16;

  let vign = smoothstep(1.15, 0.30, length(uv - vec2f(0.5, 0.42)));
  col = col * mix(0.45, 1.04, vign);
  col = clamp((col - 0.5) * 1.08 + 0.5, vec3f(0.0), vec3f(1.0));

  col = clamp(col + (hash(frag.xy + t * 10.0) - 0.5) * 0.020, vec3f(0.0), vec3f(1.0));
  let srgb = select(1.055 * pow(col, vec3f(1.0 / 2.4)) - 0.055, col * 12.92, col <= vec3f(0.0031308));
  return vec4f(srgb + (hash(frag.yx) - 0.5) / 255.0, 1.0);
}
