#version 300 es
precision highp float; precision highp int; precision highp usampler2D;
out vec4 o;
uniform vec2 res; uniform float time; uniform float seed;
uniform vec4 ink; uniform vec4 vary; uniform vec4 env;
uniform vec4 points[8]; uniform float pointCount;
uniform usampler2D buf; uniform vec2 bufSize;
uniform sampler2D cam; uniform vec2 camAspect;
uniform sampler2D tex2; uniform vec2 tex2Aspect;

const float FORM = 0.31;
const float GAP = 0.04;
const float ICON = 0.86;
const float NAME_H = 0.314;
const float LINE_TOP = 0.33, LINE_H = 0.42;
const float LENS = 0.15;
const float LENS_R = 2.2;

float back(float t) { float c1 = 1.70158, c3 = c1 + 1.0; float u = t - 1.0; return 1.0 + c3 * u * u * u + c1 * u * u; }

vec3 pal(int slot) { return vec3(texelFetch(buf, ivec2(slot, 31), 0).rgb) / 255.0; }

ivec2 hexRound(vec2 qr) {
  float q = qr.x, r = qr.y, s = -q - r;
  float rq = round(q), rr = round(r), rs = round(s);
  float dq = abs(rq - q), dr = abs(rr - r), ds = abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
  return ivec2(int(rq), int(rr));
}

vec4 textTile(int i) {
  float cols = max(1.0, points[2].x); vec2 tile = points[2].yz; float atlas = max(1.0, points[5].y);
  float col = mod(float(i), cols), row = floor(float(i) / cols);
  return vec4(vec2(col * tile.x, row * tile.y) / atlas, tile / atlas);
}
float glyphs(int i, vec2 uv, float top, float height) {
  vec4 t = textTile(i);
  vec2 a = t.xy + vec2(uv.x, (top + uv.y * height) * (t.z / t.w) ) * t.zw;
  return max(0.0, (texture(tex2, a).a - 0.06) / 0.94);
}

vec2 pushed(vec2 cw, int idx, float P) {
  float bloom = clamp(points[5].w, 0.0, 1.0);
  int focus = int(vary.y);
  if (bloom < 0.001 || focus < 0 || idx == focus) return cw;
  vec2 d = cw - points[3].zw;
  float r = max(0.001, length(d));
  float t = clamp(r / (3.4 * P), 0.0, 1.0);
  return cw + d * (0.7 * P * bloom * (1.0 - t * t * (3.0 - 2.0 * t)) / r);
}

vec4 cell(ivec2 ax, vec2 p, float P, float Z, float rowh, vec2 camW, vec2 lens, float light) {
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
  float textOn = tex2Aspect.y;

  vec2 cw = pushed(vec2(P * (float(ax.x) + 0.5 * float(ax.y)), P * rowh * float(ax.y)), idx, P);
  float dLens = length(cw - camW) * Z;
  float sc = 1.0 + LENS * (1.0 - smoothstep(0.0, LENS_R * P, dLens));
  if (idx == focus) sc *= 1.0 + 0.45 * clamp(points[5].w, 0.0, 1.0);
  float ring = max(abs(float(ax.x)), max(abs(float(ax.y)), abs(float(ax.x + ax.y))));
  float arrive = points[2].w > 0.5 ? 1.0 : clamp((appear - 55.0 * ring - 60.0) / 380.0, 0.0, 1.0);
  if (arrive <= 0.0) return vec4(0.0);
  sc *= back(arrive);
  if (idx == pressIdx) sc *= 1.0 - 0.06 * clamp(pressT / 90.0, 0.0, 1.0);
  if ((mark & 4) != 0) sc *= 1.0 + 0.06 * clamp(points[4].z, 0.0, 1.0);
  vec2 cs = (cw - camW) * Z + lens;
  float R = FORM * P * Z * sc;
  vec2 d = p - cs;

  vec4 acc = vec4(0.0);
  float cols = max(1.0, points[1].z); float tile = max(1.0, points[1].w); float atlas = max(1.0, points[5].x);
  vec2 fu = d / (2.0 * R) + 0.5;
  if (fu.x > -0.05 && fu.x < 1.05 && fu.y > -0.05 && fu.y < 1.05) {
    vec2 uv = (vec2(mod(float(idx), cols), floor(float(idx) / cols)) * tile + (1.0 - ICON) * 0.5 * tile + fu * ICON * tile) / atlas;
    vec4 art = texture(cam, uv);
    float a = art.a;
    float e = fwidth(a);
    float rim = clamp(smoothstep(0.02, 0.3, e) * (1.0 - smoothstep(0.0, 1.0, abs(a - 0.5) * 2.2)) * 1.4, 0.0, 1.0);
    bool lit = (idx == focus) || (idx == pressIdx) || ((mark & 4) != 0);
    vec3 rimCol = lit ? tint : mix(pal(30), pal(31), 0.35);
    float rimA = lit ? 0.95 : mix(0.5, 0.35, light);
    acc.rgb += art.rgb * a * (1.0 - rim) + rimCol * rim * rimA;
    acc.a += a * (1.0 - rim) + rim * rimA;
    if ((mark & 3) != 0) {
      vec2 dc = cs + vec2(0.72, -0.72) * R;
      float dd = length(p - dc);
      float dr = 0.075 * P * Z * sc;
      vec3 dot = (mark & 3) == 2 ? pal(29) : pal(28);
      float ringA = 1.0 - smoothstep(dr + 1.0, dr + 2.5, dd);
      float dotA = 1.0 - smoothstep(dr - 0.6, dr + 0.6, dd);
      acc.rgb = mix(acc.rgb, pal(31), ringA); acc.a = max(acc.a, ringA);
      acc.rgb = mix(acc.rgb, dot, dotA); acc.a = max(acc.a, dotA);
    }
  }
  if (textOn > 0.5) {
    float Ws = 0.9 * P * Z * sc;
    float nameA = smoothstep(0.84, 0.94, Z);
    float lineA = smoothstep(1.12, 1.3, Z);
    vec2 su = vec2((d.x + Ws * 0.5) / Ws, (d.y - R - GAP * P * Z * sc) / (NAME_H * Ws));
    if (nameA > 0.0 && su.x >= 0.0 && su.x <= 1.0 && su.y >= 0.0 && su.y <= 1.0) {
      float g = glyphs(idx, su, 0.0, NAME_H);
      float a = g * nameA * (idx == focus ? 1.0 : 0.86) * arrive;
      acc.rgb += pal(30) * a * (1.0 - acc.a); acc.a += a * (1.0 - acc.a);
    }
    vec2 lu = vec2(su.x, (d.y - R - GAP * P * Z * sc - LINE_TOP * Ws) / (LINE_H * Ws));
    if (lineA > 0.0 && lu.x >= 0.0 && lu.x <= 1.0 && lu.y >= 0.0 && lu.y <= 1.0) {
      float g = glyphs(idx, lu, LINE_TOP, LINE_H);
      float a = g * lineA * 0.78 * arrive;
      acc.rgb += pal(30) * a * (1.0 - acc.a); acc.a += a * (1.0 - acc.a);
    }
  }
  return clamp(acc, 0.0, 1.0);
}

vec4 haloAt(int idx, vec2 cw, vec2 p, float P, float Z, vec2 camW, vec2 lens, float light) {
  uvec4 c = texelFetch(buf, ivec2(idx & 31, 17 + (idx >> 5)), 0);
  float sc = 1.0 + LENS * (1.0 - smoothstep(0.0, LENS_R * P, length(cw - camW) * Z));
  if ((int(c.a) & 4) != 0) sc *= 1.0 + 0.06 * clamp(points[4].z, 0.0, 1.0);
  if (idx == int(vary.y)) sc *= 1.0 + 0.45 * clamp(points[5].w, 0.0, 1.0);
  float R = FORM * P * Z * sc;
  float dd = length(p - ((cw - camW) * Z + lens));
  float h = (1.0 - smoothstep(R * 0.95, R * 1.9, dd)) * smoothstep(R * 0.55, R * 1.0, dd);
  float a = h * mix(0.34, 0.22, light);
  return vec4(vec3(c.rgb) / 255.0 * a, a);
}

void main() {
  float W = max(1.0, points[1].x), H = max(1.0, points[1].y);
  float dpr = res.x / W;
  vec2 p0 = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y) / dpr;
  float P = max(1.0, vary.w), Z = max(0.1, points[4].w), rowh = max(0.5, points[6].x);
  vec2 cam0 = ink.xy, lens = ink.zw;
  float light = clamp(env.x, 0.0, 1.0);
  vec3 ground = pal(31);

  vec2 camW = cam0;

  vec2 p = p0;
  float bloom = clamp(points[5].w, 0.0, 1.0);

  vec2 w = (p - lens) / Z + camW;
  float r = w.y / (P * rowh);
  float q = w.x / P - 0.5 * r;
  ivec2 ax = hexRound(vec2(q, r));

  vec3 col = ground;
  ivec2 site = ax + 8;
  if (site.x >= 0 && site.x <= 16 && site.y >= 0 && site.y <= 16) {
    uvec4 s = texelFetch(buf, site, 0);
    if (s.a == 255u) {
      int idx = int(s.r);
      int g = int(texelFetch(buf, ivec2(idx & 31, 24 + (idx >> 5)), 0).r) & 31;
      uvec4 gc = texelFetch(buf, ivec2(g, 31), 0);
      if (gc.r + gc.g + gc.b > 0u) {
        vec3 gcol = vec3(gc.rgb) / 255.0;
        vec2 cw = vec2(P * (float(ax.x) + 0.5 * float(ax.y)), P * rowh * float(ax.y));
        vec2 dl = (w - cw) * vec2(1.0, 0.8660254 / rowh);
        float sdf = max(abs(dl.x), abs(dl.x) * 0.5 + abs(dl.y) * 0.8660254) - 0.5 * P;
        float inner = 1.0 - smoothstep(-0.5 * P, -0.04 * P, sdf);
        col = mix(ground, gcol, mix(0.06, 0.05, light) * inner);
        float capA = (1.0 - smoothstep(0.84, 0.94, Z)) * tex2Aspect.y;
        if (capA > 0.0) {
          uvec4 ce = texelFetch(buf, ivec2(g, 32), 0);
          vec2 cen = vec2(float(ce.r | (ce.g << 8u)), float(ce.b | (ce.a << 8u))) - 32768.0;
          vec2 cs = (cen - camW) * Z + lens;
          float Wc = 3.2 * P * Z;
          vec2 cu = vec2((p.x - cs.x + Wc * 0.5) / Wc, (p.y - cs.y + NAME_H * Wc * 0.5) / (NAME_H * Wc));
          if (cu.x >= 0.0 && cu.x <= 1.0 && cu.y >= 0.0 && cu.y <= 1.0) {
            float gl = glyphs(int(vary.x) + g, cu, 0.0, NAME_H);
            col = mix(col, gcol, gl * capA * 0.9);
          }
        }
      }
    }
  }

  float down = points[6].z;
  float fl = 0.0;
  if (down > 0.5) {
    vec2 fs = (points[7].xy - camW) * Z + lens;
    float r = length(p - fs) / (1.15 * P * Z);
    fl = exp(-r * r);
    col = mix(col, pal(28), fl * mix(0.10, 0.06, light));
  }

  if (bloom > 0.02 && points[6].w >= 0.0 && int(points[6].w) == int(vary.y)) {
    int li = int(points[6].w);
    uvec4 lc = texelFetch(buf, ivec2(li & 31, 17 + (li >> 5)), 0);
    vec3 ltint = vec3(lc.rgb) / 255.0;
    vec2 cs = (pushed(points[7].zw, li, P) - camW) * Z + lens;
    float R = FORM * P * Z * (1.0 + LENS) * (1.0 + 0.45 * bloom);
    vec2 d = p0 - cs;
    float r = length(d), ang = atan(d.y, d.x) / 6.2831853 + 0.5;
    float fb = ang * 12.0, b0 = floor(fb), ft = fract(fb);
    float e0 = float(texelFetch(buf, ivec2(int(mod(b0, 12.0)), 33), 0).r) / 255.0;
    float e1 = float(texelFetch(buf, ivec2(int(mod(b0 + 1.0, 12.0)), 33), 0).r) / 255.0;
    float e = mix(e0, e1, smoothstep(0.0, 1.0, ft));
    float ray = 1.0 - smoothstep(0.0, 0.5, abs(ft - 0.5) * 2.0 - 0.1);
    float reach = R * (1.15 + 1.1 * e);
    float body = (1.0 - smoothstep(R * 1.02, reach, r)) * smoothstep(R * 0.92, R * 1.08, r);
    float tip = exp(-pow((r - reach) / (0.08 * R + 1.0), 2.0)) * e;
    float a = bloom * (body * (0.10 + 0.35 * e) * (0.55 + 0.45 * ray) + tip * 0.55 * ray) * mix(1.0, 0.7, light);
    col = col * (1.0 - a) + ltint * a;
  }

  vec4 glow = vec4(0.0);
  if (vary.y >= 0.0) glow += haloAt(int(vary.y), points[3].zw, p, P, Z, camW, lens, light);
  if (points[6].w >= 0.0 && int(points[6].w) != int(vary.y)) glow += haloAt(int(points[6].w), pushed(points[7].zw, int(points[6].w), P), p, P, Z, camW, lens, light);
  glow = clamp(glow, 0.0, 1.0);
  col = col * (1.0 - glow.a) + glow.rgb;

  vec4 acc = cell(ax, p, P, Z, rowh, camW, lens, light);
  vec4 up1 = cell(ax + ivec2(0, -1), p, P, Z, rowh, camW, lens, light);
  vec4 up2 = cell(ax + ivec2(1, -1), p, P, Z, rowh, camW, lens, light);
  acc = acc + up1 * (1.0 - acc.a);
  acc = acc + up2 * (1.0 - acc.a);
  if (bloom > 0.001) {
    acc = acc + cell(ax + ivec2(1, 0), p, P, Z, rowh, camW, lens, light) * (1.0 - acc.a);
    acc = acc + cell(ax + ivec2(-1, 0), p, P, Z, rowh, camW, lens, light) * (1.0 - acc.a);
    acc = acc + cell(ax + ivec2(0, 1), p, P, Z, rowh, camW, lens, light) * (1.0 - acc.a);
    acc = acc + cell(ax + ivec2(-1, 1), p, P, Z, rowh, camW, lens, light) * (1.0 - acc.a);
  }
  acc.rgb *= 1.0 + 0.14 * fl;

  int tapIdx = int(points[0].z); float tapT = points[0].w;
  if (tapIdx >= 0 && tapT < 700.0) {
    uvec4 c = texelFetch(buf, ivec2(tapIdx & 31, 17 + (tapIdx >> 5)), 0);
    vec3 tint = vec3(c.rgb) / 255.0;
    vec2 tc = (points[3].xy - camW) * Z + lens;
    float k = tapT / 700.0;
    float rad = FORM * P * Z * (1.0 + 1.6 * k);
    float dd = abs(length(p - tc) - rad);
    float ring = (1.0 - smoothstep(0.0, 2.0 + 10.0 * k, dd)) * (1.0 - k) * (1.0 - k);
    acc.rgb += tint * ring * 0.9; acc.a = min(1.0, acc.a + ring * 0.9);
  }
  float top = points[4].x, bottom = points[4].y;
  float fade = smoothstep(top - 24.0, top + 64.0, p0.y) * (1.0 - smoothstep(H - bottom - 56.0, H - bottom + 12.0, p0.y));
  acc *= fade;
  col = mix(ground, col, fade);
  float vd = length(p0 - lens) / W;
  float vig = 1.0 - 0.18 * smoothstep(0.35, 0.95, vd) * (1.0 - light);
  vec3 colour = col * (1.0 - acc.a) + acc.rgb;
  o = vec4(mix(ground, colour, vig), 1.0);
}
