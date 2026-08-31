
struct U { res: vec2f, time: f32, seed: f32, ink: vec4f, vary: vec4f };
@group(0) @binding(0) var<uniform> u: U;

const BAIZE: vec3f = vec3f(0.012, 0.008, 0.004);
const CLOTH: vec3f = vec3f(0.070, 0.046, 0.020);
const FLAME: vec3f = vec3f(1.000, 0.760, 0.420);

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

@fragment
fn fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let uv = vec2f(frag.x / u.res.x, frag.y / u.res.y);
  let aspect = vec2f(u.res.x / max(u.res.y, 1.0), 1.0);
  let p = (uv - 0.5) * aspect;
  let t = u.time;
  let sd = u.seed * 37.0;

  let flick = 0.86 + 0.14 * fbm(vec2f(t * 0.9 + sd, 0.0)) + 0.05 * fbm(vec2f(t * 2.7, 3.1));
  let sway = vec2f((fbm(vec2f(t * 0.35, 7.0)) - 0.5) * 0.05, (fbm(vec2f(t * 0.28, 1.0)) - 0.5) * 0.03);

  let centre = vec2f(0.0, -0.10) + sway;
  let d = distance(vec2f(p.x, p.y * 0.86), centre);
  let pool = pow(smoothstep(0.34, 0.015, d), 1.6) * flick;

  let nap = fbm(vec2f(p.x * 26.0, p.y * 90.0) + sd) * 0.5 + fbm(p * 7.0 - sd) * 0.5;
  var col = mix(BAIZE, CLOTH, pool * 0.20 + (nap - 0.5) * 0.26 * (0.25 + pool));
  col = col + FLAME * pool * pool * 0.10;

  let sp = vec2f(p.x * 1.6, p.y * 1.1 - t * 0.055);
  let s1 = fbm(sp * 2.2 + vec2f(sd, 0.0));
  let s2 = fbm((sp + s1 * 0.85) * 4.1 - vec2f(0.0, t * 0.09));
  let field = s1 * 0.62 + s2 * 0.58;
  let veins = 0.5 + 0.5 * sin(field * 14.0 + t * 0.25);
  let calm = mix(1.0, 0.06, pow(smoothstep(0.36, 0.03, d), 1.15));
  let low = smoothstep(1.02, 0.52, uv.y);
  let smoke = pow(veins, 3.2) * smoothstep(0.30, 0.80, field) * calm * low;
  col = col + FLAME * smoke * (0.03 + pool * 0.34);
  col = col + CLOTH * smoke * 0.55;

  var motes = 0.0;
  let g = vec2f(p.x * 9.0, p.y * 9.0 - t * 0.30);
  let cell = floor(g);
  let f = fract(g);
  for (var oy = -1; oy <= 1; oy = oy + 1) {
    for (var ox = -1; ox <= 1; ox = ox + 1) {
      let o = vec2f(f32(ox), f32(oy));
      let id = cell + o;
      let r = hash(id + sd);
      if (r > 0.930) {
        let jitter = vec2f(hash(id + 11.0), hash(id + 23.0));
        let dd = length(f - o - jitter);
        let tw = 0.55 + 0.45 * sin(t * 2.1 + r * 40.0);
        motes = motes + smoothstep(0.055, 0.0, dd) * tw;
      }
    }
  }
  col = col + FLAME * motes * (0.35 + pool) * 1.7;

  let vign = smoothstep(0.95, 0.22, length(uv - vec2f(0.5, 0.40)));
  col = col * mix(0.40, 1.05, vign);
  col = clamp((col - 0.5) * 1.06 + 0.5, vec3f(0.0), vec3f(1.0));

  col = clamp(col + (hash(frag.xy + t * 10.0) - 0.5) * 0.016, vec3f(0.0), vec3f(1.0));
  let srgb = select(1.055 * pow(col, vec3f(1.0 / 2.4)) - 0.055, col * 12.92, col <= vec3f(0.0031308));
  return vec4f(srgb + (hash(frag.yx) - 0.5) / 255.0, 1.0);
}
