
struct U { res: vec2f, time: f32, seed: f32, ink: vec4f, vary: vec4f, env: vec4f };
@group(0) @binding(0) var<uniform> u: U;

const PAGE_D: vec3f = vec3f(0.012, 0.012, 0.012);
const BASE_D: vec3f = vec3f(0.1647, 0.1647, 0.1804);
const BASE_L: vec3f = vec3f(0.965, 0.957, 0.933);
const WARM: vec3f = vec3f(1.000, 0.780, 0.480);
const COOL: vec3f = vec3f(0.720, 0.920, 0.900);

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

fn deck(p: vec2f, w: f32) -> f32 {
  let q = p + vec2f(w, 0.0);
  let warp = vec2f(fbm(q * 1.3), fbm(q * 1.3 + vec2f(5.2, 1.3)));
  return fbm(q * 2.1 + warp * 1.1);
}


fn segDist(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

@fragment
fn fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let uv = vec2f(frag.x / u.res.x, frag.y / u.res.y);
  let aspect = vec2f(u.res.x / max(u.res.y, 1.0), 1.0);
  let p = (uv - 0.5) * aspect;
  let t = u.time;

  let alt = u.vary.x;
  let cloud = clamp(u.vary.y, 0.0, 1.0);
  let wet = clamp(u.vary.z, 0.0, 1.0);
  let wind = clamp(u.vary.w, 0.0, 1.0);
  let snow = clamp(u.ink.x, 0.0, 1.0);
  let haze = clamp(u.ink.y, 0.0, 1.0);
  let storm = clamp(u.ink.z, 0.0, 1.0);
  let lightX = u.ink.w;
  let lit = clamp(u.env.x, 0.0, 1.0);

  let base = mix(BASE_D, BASE_L, lit);
  let page = mix(PAGE_D, BASE_L, lit);
  let sign = mix(1.0, -1.0, lit);
  let glow = mix(1.0, 0.42, lit);
  let dayness = smoothstep(-0.30, 0.16, alt);
  let night = 1.0 - dayness;

  let sunY = mix(0.74, 0.07, clamp(alt, 0.0, 1.0)) - clamp(alt, -1.0, 0.0) * 0.34;
  let sunP = vec2f((lightX - 0.5) * aspect.x * 1.35, sunY - 0.5);
  let squash = mix(0.42, 0.95, smoothstep(0.0, 0.45, alt));
  let dSun = distance(vec2f(p.x, (p.y - sunP.y) / squash + sunP.y), sunP);
  let core = pow(smoothstep(0.13, 0.0, dSun), 2.0) * (1.0 - cloud * 0.88) * dayness;
  let halo = pow(smoothstep(0.30, 0.01, dSun), 1.6) * (0.34 + 0.66 * dayness);
  let scatter = pow(smoothstep(0.65, 0.02, dSun), 1.15) * dayness;
  let warmth = (1.0 - smoothstep(0.02, 0.40, alt)) * (1.0 - cloud * 0.75);
  let tint = mix(COOL, WARM, warmth * dayness);

  var col = base;
  let horizon = pow(smoothstep(0.10, 0.92, uv.y), 1.6);
  col = col + tint * sign * horizon * (0.010 + 0.030 * warmth * dayness);
  col = col + tint * glow * dayness * 0.045;
  col = col + tint * glow * scatter * 0.105;
  col = col - tint * lit * dayness * (1.0 - scatter) * 0.115;
  col = col + tint * glow * halo * (0.020 + 0.060 * dayness);
  col = col + tint * glow * core * 0.075;

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
        if (r > 0.945) {
          let jit = vec2f(hash(id + 3.0), hash(id + 9.0));
          let dd = length(f - o - jit);
          let tw = 0.45 + 0.55 * sin(t * 1.3 + r * 60.0);
          s = s + smoothstep(0.095, 0.0, dd) * tw * (0.4 + 0.6 * r);
        }
      }
    }
    col = col + COOL * s * starAmt * 0.19;
  }

  let moonAmt = night * (1.0 - cloud * 0.88);
  if (moonAmt > 0.01) {
    let mp = vec2f((0.5 - lightX) * aspect.x * 1.15, -0.27);
    let dm = distance(p, mp);
    let disc = smoothstep(0.024, 0.020, dm);
    let k = 1.0 - abs(u.seed - 0.5) * 2.0;
    let side = select(-1.0, 1.0, u.seed < 0.5);
    let off = side * k * 0.049;
    let face = disc * (1.0 - smoothstep(0.024, 0.020, distance(p - vec2f(off, 0.0), mp)));
    col = col + COOL * glow * face * moonAmt * 0.165;
    col = col + COOL * glow * pow(smoothstep(0.22, 0.02, dm), 2.0) * moonAmt * 0.055;
  }

  let drift = t * (0.02 + wind * 0.20);
  let hi = deck(vec2f(p.x * 14.0, p.y * 9.0), drift * 1.9);
  let lo = deck(vec2f(p.x * 6.5, p.y * 4.4), drift);
  let edge = 0.78 - cloud * 0.56;
  var body = smoothstep(edge, edge + 0.30, lo) * (0.35 + 0.65 * cloud);
  let cirrus = smoothstep(edge + 0.06, edge + 0.34, hi) * (0.18 + 0.30 * cloud);
  let toLight = normalize(sunP - p + vec2f(0.0001, 0.0001));
  let lp = p + toLight * 0.030;
  let rim = clamp((lo - deck(vec2f(lp.x * 6.5, lp.y * 4.4), drift)) * 3.4, -1.0, 1.0);
  let cloudLight = 0.30 + 0.70 * dayness;
  col = mix(col, base + tint * sign * (0.030 + 0.020 * cloudLight) * (0.75 + rim * 0.85), body * 0.90);
  col = col + tint * sign * cirrus * 0.014 * (0.4 + cloudLight);

  if (wet > 0.01) {
    let shear = (lightX - 0.5) * 0.0 + (wind - 0.15) * 0.85;
    let fall = mix(1.55 + wind * 1.1, 0.20 + wind * 0.22, snow);
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
          let sway = sin(t * 1.1 + r * 30.0) * 0.22 * snow;
          let c = f - o - vec2f(jx + sway, hash(id + 31.0));
          let len = mix(0.45, 0.02, snow);
          let d = segDist(c, vec2f(0.0, -len), vec2f(0.0, len));
          let thick = mix(0.05, 0.07, snow);
          wetness = wetness + smoothstep(thick, 0.0, d) * (0.5 + 0.5 * r);
        }
      }
    }
    col = col + tint * sign * wetness * (0.030 + 0.020 * dayness) * mix(1.0, 1.6, snow);
  }

  let veil = haze * smoothstep(0.05, 0.95, uv.y);
  col = mix(col, base + tint * sign * 0.018, veil * 0.72);

  if (storm > 0.5) {
    let ph = t * 0.09;
    let n = floor(ph);
    let f = fract(ph);
    if (hash(vec2f(n, 3.0)) > 0.45) {
      let bolt = exp(-f * 26.0) * (0.65 + 0.35 * sin(f * 120.0));
      col = col + tint * glow * max(bolt, 0.0) * 0.10 * smoothstep(0.95, 0.1, uv.y);
    }
  }

  col = mix(col, page, smoothstep(0.66, 0.96, uv.y));
  let vign = smoothstep(1.15, 0.30, length((uv - vec2f(0.5, 0.36)) * vec2f(1.0, 0.8)));
  col = mix(page, col, mix(0.55, 1.0, vign));

  let baseY = dot(base, vec3f(0.2126, 0.7152, 0.0722));
  let y = dot(col, vec3f(0.2126, 0.7152, 0.0722));
  let up = mix(0.170, 0.300, lit);
  let dn = mix(0.300, 0.170, lit);
  let clamped = clamp(y, baseY - dn, baseY + up);
  col = col * (clamped / max(y, 1e-5));

  col = clamp(col + (hash(frag.xy + t * 10.0) - 0.5) * 0.008, vec3f(0.0), vec3f(1.0));
  return vec4f(col + (hash(frag.yx) - 0.5) / 255.0, 1.0);
}
