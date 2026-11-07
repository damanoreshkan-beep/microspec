#version 300 es
precision highp float; precision highp int; precision highp usampler2D;
out vec4 o;
uniform vec2 res; uniform float time; uniform float seed;
uniform vec4 ink; uniform vec4 vary; uniform vec4 env;
uniform vec4 points[8]; uniform float pointCount;
uniform usampler2D buf; uniform vec2 bufSize;
uniform sampler2D cam; uniform vec2 camAspect;

const float STRETCH = 1.3;
const float ROWH = 0.8660254 * STRETCH;
const float FORM = 0.31;
const float GAP = 0.04;
const float ICON = 0.689;
const float STRIP = 0.314;
const float LENS = 0.15;
const float LENS_R = 2.2;
const vec3 AMBER = vec3(0.95, 0.72, 0.29);
const vec3 CYAN = vec3(0.36, 0.89, 0.86);
const vec3 PAPER = vec3(0.965, 0.957, 0.933);
const vec3 AMBER_DEEP = vec3(0.44, 0.28, 0.0);
const vec3 CYAN_DEEP = vec3(0.05, 0.43, 0.41);

float back(float t) { float c1 = 1.70158, c3 = c1 + 1.0; float u = t - 1.0; return 1.0 + c3 * u * u * u + c1 * u * u; }

ivec2 hexRound(vec2 qr) {
  float q = qr.x, r = qr.y, s = -q - r;
  float rq = round(q), rr = round(r), rs = round(s);
  float dq = abs(rq - q), dr = abs(rr - r), ds = abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
  return ivec2(int(rq), int(rr));
}

vec4 cell(ivec2 ax, vec2 p, float P, vec2 camW, vec2 lens, float light) {
  ivec2 site = ax + 8;
  if (site.x < 0 || site.x > 16 || site.y < 0 || site.y > 16) return vec4(0.0);
  uvec4 s = texelFetch(buf, site, 0);
  if (s.a != 255u) return vec4(0.0);
  int idx = int(s.r);
  uvec4 c = texelFetch(buf, ivec2(idx & 31, 17 + (idx >> 5)), 0);
  vec3 tint = vec3(c.rgb) / 255.0;
  int mark = int(c.a);
  int focus = int(vary.y); float appear = vary.z;
  int pressIdx = int(points[0].x); float pressT = points[0].y;
  float cols = max(1.0, points[1].z); vec2 tile = points[2].xy; float atlas = max(1.0, points[2].z);

  vec2 cw = vec2(P * (float(ax.x) + 0.5 * float(ax.y)), P * ROWH * float(ax.y));
  float dLens = length(cw - camW);
  float sc = 1.0 + LENS * (1.0 - smoothstep(0.0, LENS_R * P, dLens));
  float ring = max(abs(float(ax.x)), max(abs(float(ax.y)), abs(float(ax.x + ax.y))));
  float arrive = points[2].w > 0.5 ? 1.0 : clamp((appear - 55.0 * ring - 60.0) / 380.0, 0.0, 1.0);
  if (arrive <= 0.0) return vec4(0.0);
  sc *= back(arrive);
  if (idx == pressIdx) sc *= 1.0 - 0.06 * clamp(pressT / 90.0, 0.0, 1.0);
  if ((mark & 4) != 0) sc *= 1.0 + 0.06 * clamp(points[4].z, 0.0, 1.0);
  vec2 cs = cw - camW + lens;
  float R = FORM * P * sc;
  vec2 d = p - cs;

  vec4 acc = vec4(0.0);
  float col = mod(float(idx), cols), row = floor(float(idx) / cols);
  vec2 tileUV0 = vec2(col * tile.x, row * tile.y) / atlas;
  float formPx = ICON * tile.x;
  vec2 fu = d / (2.0 * R) + 0.5;
  if (fu.x > -0.05 && fu.x < 1.05 && fu.y > -0.05 && fu.y < 1.05) {
    vec2 uv = tileUV0 + (vec2((1.0 - ICON) * 0.5 * tile.x, 0.0) + fu * formPx) / atlas;
    vec4 art = texture(cam, uv);
    float a = art.a;
    float e = fwidth(a);
    float rim = clamp(smoothstep(0.05, 0.4, e) * (1.0 - smoothstep(0.0, 1.0, abs(a - 0.5) * 1.6)) * 1.8, 0.0, 1.0);
    bool lit = (idx == focus) || (idx == pressIdx) || ((mark & 4) != 0);
    vec3 rimCol = lit ? tint : mix(vec3(0.72), vec3(0.25), light);
    float rimA = lit ? 0.95 : mix(0.45, 0.28, light);
    acc.rgb += art.rgb * a * (1.0 - rim) + rimCol * rim * rimA;
    acc.a += a * (1.0 - rim) + rim * rimA;
    if ((mark & 3) != 0) {
      vec2 dc = cs + vec2(0.72, -0.72) * R;
      float dd = length(p - dc);
      float dr = 0.075 * P * sc;
      vec3 dot = (mark & 3) == 2 ? mix(CYAN, CYAN_DEEP, light) : mix(AMBER, AMBER_DEEP, light);
      float ringA = 1.0 - smoothstep(dr + 1.0, dr + 2.5, dd);
      float dotA = 1.0 - smoothstep(dr - 0.6, dr + 0.6, dd);
      vec3 ground = mix(vec3(0.0), PAPER, light);
      acc.rgb = mix(acc.rgb, ground, ringA); acc.a = max(acc.a, ringA);
      acc.rgb = mix(acc.rgb, dot, dotA); acc.a = max(acc.a, dotA);
    }
  }
  float stripW = 2.0 * R / ICON;
  float stripH = STRIP * stripW;
  vec2 su = vec2((d.x + stripW * 0.5) / stripW, (d.y - R - GAP * P * sc) / stripH);
  if (su.x >= 0.0 && su.x <= 1.0 && su.y >= 0.0 && su.y <= 1.0) {
    vec2 uv = tileUV0 + vec2(su.x * tile.x, formPx + GAP / FORM * 0.5 * formPx + su.y * STRIP * tile.x) / atlas;
    float g = texture(cam, uv).a;
    vec3 inkCol = mix(vec3(0.93), vec3(0.11), light);
    float nameA = g * (idx == focus ? 1.0 : mix(0.82, 0.9, light)) * arrive;
    acc.rgb += inkCol * nameA; acc.a += nameA;
  }
  if (idx == focus || (mark & 4) != 0) {
    float dd = length(d);
    float halo = (1.0 - smoothstep(R * 0.95, R * 1.7, dd)) * smoothstep(R * 0.6, R * 1.0, dd);
    float hA = halo * mix(0.32, 0.18, light) * arrive;
    acc.rgb += tint * hA; acc.a += hA;
  }
  return clamp(acc, 0.0, 1.0);
}

void main() {
  float W = max(1.0, points[1].x);
  float dpr = res.x / W;
  vec2 p = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y) / dpr;
  float P = max(1.0, vary.w);
  vec2 camW = ink.xy, lens = ink.zw;
  float light = clamp(env.x, 0.0, 1.0);
  vec3 ground = mix(vec3(0.0), PAPER, light);

  vec2 w = p - lens + camW;
  float r = w.y / (P * ROWH);
  float q = w.x / P - 0.5 * r;
  ivec2 ax = hexRound(vec2(q, r));

  vec4 acc = cell(ax, p, P, camW, lens, light);
  vec4 up1 = cell(ax + ivec2(0, -1), p, P, camW, lens, light);
  vec4 up2 = cell(ax + ivec2(1, -1), p, P, camW, lens, light);
  acc = acc + up1 * (1.0 - acc.a);
  acc = acc + up2 * (1.0 - acc.a);

  int tapIdx = int(points[0].z); float tapT = points[0].w;
  if (tapIdx >= 0 && tapT < 700.0) {
    uvec4 c = texelFetch(buf, ivec2(tapIdx & 31, 17 + (tapIdx >> 5)), 0);
    vec3 tint = vec3(c.rgb) / 255.0;
    vec2 tc = points[3].xy - camW + lens;
    float k = tapT / 700.0;
    float rad = FORM * P * (1.0 + 1.6 * k);
    float dd = abs(length(p - tc) - rad);
    float ring = (1.0 - smoothstep(0.0, 2.0 + 10.0 * k, dd)) * (1.0 - k) * (1.0 - k);
    acc.rgb += tint * ring * 0.9; acc.a = min(1.0, acc.a + ring * 0.9);
  }
  float H = max(1.0, points[1].y), top = points[4].x, bottom = points[4].y;
  float fade = smoothstep(top - 24.0, top + 64.0, p.y) * (1.0 - smoothstep(H - bottom - 56.0, H - bottom + 12.0, p.y));
  acc *= fade;
  float vd = length(p - lens) / W;
  float vig = 1.0 - 0.22 * smoothstep(0.35, 0.95, vd) * (1.0 - light);
  vec3 colour = ground * (1.0 - acc.a) + acc.rgb;
  o = vec4(mix(ground, colour, vig), 1.0);
}
