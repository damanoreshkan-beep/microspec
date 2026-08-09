
struct U { res: vec2f, time: f32, seed: f32, ink: vec4f };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var env: texture_2d<f32>;
@group(0) @binding(2) var envSam: sampler;

fn envDir(d: vec3f, lod: f32) -> vec3f {
  let uvv = vec2f(atan2(d.z, d.x) / 6.2831853 + 0.5, acos(clamp(d.y, -1.0, 1.0)) / 3.14159265);
  let s = textureSampleLevel(env, envSam, uvv, lod);
  return s.rgb * exp2(s.a * 255.0 - 128.0);
}

const ROUGHNESS: f32 = 0.30;
const ENV_MIPS: f32 = 12.0;
const SPEC_LOD: f32 = 3.4;

const PITCH: f32 = 0.26;
const HALF_W: f32 = 0.52;
const HALF_H: f32 = 0.052;
const HALF_D: f32 = 0.085;
const GAP: f32 = 0.15;
const OBJ_H: f32 = 1.56;

const HEAT: vec3f = vec3f(1.00, 0.28, 0.06);

const FILLET: f32 = 0.016;

fn sdBox(p: vec3f, b: vec3f) -> f32 {
  let q = abs(p) - (b - vec3f(FILLET));
  return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0) - FILLET;
}

fn hash11(n: f32) -> f32 { return fract(sin(n * 127.1) * 43758.5453); }

fn lineVal(i: i32) -> i32 {
  var n = i32(u.seed * 4096.0 + 0.5);
  for (var k = 0; k < i; k = k + 1) { n = n / 4; }
  return (n % 4) + 6;
}

struct Hit { d: f32, heat: f32 };

fn mapLine(p: vec3f, v: i32, t: f32) -> Hit {
  let yang = v == 7 || v == 9;
  var d: f32;
  var heat = 0.0;

  if (yang) {
    d = sdBox(p, vec3f(HALF_W, HALF_H, HALF_D));
    if (v == 9) {
      let openAmt = 0.45 + 0.55 * (0.5 + 0.5 * sin(t * 0.7));
      let taper = (p.y + HALF_H) / (2.0 * HALF_H);
      let halfCrack = 0.012 + 0.030 * openAmt * (0.25 + 0.75 * taper);
      let jag = 0.004 * sin(p.y * 90.0) + 0.003 * sin(p.z * 60.0);
      let crack = halfCrack + jag - abs(p.x);
      d = max(d, crack);
      heat = exp(-abs(p.x) * 26.0) * openAmt;
    }
  } else {
    let left = sdBox(p - vec3f(-(HALF_W + GAP) * 0.5, 0.0, 0.0), vec3f((HALF_W - GAP) * 0.5, HALF_H, HALF_D));
    let right = sdBox(p - vec3f((HALF_W + GAP) * 0.5, 0.0, 0.0), vec3f((HALF_W - GAP) * 0.5, HALF_H, HALF_D));
    d = min(left, right);
    if (v == 6) {
      let grow = 0.55 + 0.45 * (0.5 + 0.5 * sin(t * 0.45 + 1.3));
      let waist = 0.020 + 0.020 * grow;
      let thick = waist + 0.055 * (abs(p.x) / max(GAP, 1e-4));
      let bridge = sdBox(p, vec3f(GAP * grow, thick, HALF_D * 0.62));
      d = min(d, bridge);
      heat = exp(-abs(p.x) * 9.0) * grow * 0.75;
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
  return f0 + (vec3f(1.0) - f0) * (x2 * x2 * x);
}

fn linearToSrgb(x: vec3f) -> vec3f {
  let lo = 12.92 * x;
  let hi = 1.055 * pow(max(x, vec3f(0.0)), vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, x <= vec3f(0.0031308));
}

@fragment fn fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let uv = ((frag.xy * 2.0 - u.res) / u.res.y) * vec2f(1.0, -1.0);
  let t = u.time;

  let yaw = 0.26 + sin(t * 0.05) * 0.05;
  let elev = 0.105;
  let dist = 5.755;
  let ro = vec3f(sin(yaw) * cos(elev) * dist, sin(elev) * dist, cos(yaw) * cos(elev) * dist);
  let ww = normalize(-ro);
  let uu = normalize(cross(vec3f(0.0, 1.0, 0.0), ww));
  let vv = cross(ww, uu);
  let rd = normalize(uv.x * uu + uv.y * vv + 4.722 * ww);

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

  let pool = exp(-2.7 * length((uv - vec2f(0.05, 0.12)) * vec2f(1.0, 1.30)));
  var col = mix(vec3f(0.0020, 0.0023, 0.0030), vec3f(0.042, 0.028, 0.016), pool);

  if (hit) {
    let p = ro + rd * tHit;
    let n = normalAt(p);
    let v = -rd;

    let grain = hash11(floor(p.y * 240.0) + floor(p.x * 40.0) * 7.1);
    let patina = smoothstep(0.55, 0.95, 1.0 - abs(n.y)) * (0.25 + 0.30 * grain);
    var base = mix(vec3f(0.86, 0.52, 0.22), vec3f(0.075, 0.170, 0.140), patina * 0.32);
    base = base * (0.90 + 0.10 * grain);

    let refl = reflect(rd, n);
    let spec = envDir(refl, SPEC_LOD);
    let amb = envDir(n, ENV_MIPS - 3.0) * 0.18;
    let f = fresnelSchlick(max(dot(n, v), 0.0), base);
    let occ = ao(p, n);

    col = (spec * f * 1.6 + amb * base) * occ;

    let key = normalize(vec3f(0.57, 0.62, 0.54));
    let hv = normalize(key + v);
    col = col + vec3f(1.00, 0.94, 0.82) * pow(max(dot(n, hv), 0.0), 110.0) * 1.4 * occ;

    col = mix(col, vec3f(0.004, 0.005, 0.007), clamp((tHit - dist + 0.9) * 0.30, 0.0, 0.7));
  }

  let lum = dot(col, vec3f(0.2126, 0.7152, 0.0722));
  let tv = col / (1.0 + col);
  let tl = lum / (1.0 + lum);
  col = mix(col / (1.0 + lum), tv, tv * 0.5 + vec3f(tl * 0.5));

  let q = uv * 0.5 + vec2f(0.5);
  let vig = pow(clamp(16.0 * q.x * (1.0 - q.x) * q.y * (1.0 - q.y), 0.0, 1.0), 0.20);
  col = col * mix(0.82, 1.0, vig);

  col = linearToSrgb(col);

  let dith = (hash11(frag.x * 1.7 + frag.y * 91.3) - 0.5) / 255.0;
  return vec4f(col + vec3f(dith), 1.0);
}
