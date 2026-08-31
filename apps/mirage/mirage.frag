#version 300 es
// (#version stays on line 1: ANGLE refuses a directive that is not the first line, comments or not.)
// mirage — the field (GLSL ES 3.00, mounted by /_rt/glstage.js).
//
// The identity is HEAT HAZE, not clouds: air over hot ground shears the view in thin, near-horizontal
// laminae that RISE and thin as they climb, so the distortion must be anisotropic (wide in x, fine in y)
// and drift upward, while the body of the field stays slow. A stack of isotropic fbm reads as smoke; the
// same stack sheared and lifted reads as heat. That difference is the whole look.
//
//   vary.x  busy     0..1  a race is running — the air quickens and the grain lifts
//   vary.y  arrival  0..1  a picture just landed — a bloom that swells and settles (host eases it down)
//   vary.z  facet    0..1  which mode is in front; rotates the palette's cross-mix, so the modes are
//                          recognisable by colour without a single hue being hard-coded
//   vary.w  ready    0..1  the palette texture is bound; fades the field in / cross-fades a swap
//   env.x   light    0..1  the runtime's theme channel (eased on toggle)
//
// AMPLITUDE BUDGET, in DISPLAY space, carried over from persona/presence.frag because it is a CONTRACT and
// not a look: dark base 0.165 -> clamped to [0.10, 0.32]; light base 0.93 -> [0.64, 0.97]. Measured against
// base-content that is >= 4.5:1 at both clamps, so any string the app puts over the field stays AA.
precision highp float;
out vec4 o;
uniform vec2 res; uniform float time; uniform float seed;
uniform vec4 ink;    // reserved for the app
uniform vec4 vary;   // x busy, y arrival, z facet, w ready
uniform vec4 env;    // x theme light 0..1
uniform sampler2D tex; uniform vec2 texAspect;

const mat2 R = mat2(0.86, 0.51, -0.51, 0.86);
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*noise(p); p=R*p*2.0+vec2(1.7,9.2); a*=0.5; } return s; }
float luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }

void main(){
  vec2 uv = gl_FragCoord.xy/res; uv.y = 1.0 - uv.y;              // top-down, like the DOM
  float asp = res.x/max(res.y, 1.0);
  vec2 p = vec2(uv.x*asp, uv.y);                                 // square-ish units, so a circle is round
  float lite = clamp(env.x, 0.0, 1.0);
  float busy = clamp(vary.x, 0.0, 1.0);
  float arrive = clamp(vary.y, 0.0, 1.0);
  float facet = clamp(vary.z, 0.0, 1.0);
  float ready = clamp(vary.w, 0.0, 1.0);

  // ── the haze: anisotropic sheets that RISE ──────────────────────────────────────────────────────────
  // Two jobs, and the first version only did the second. A lamina must (a) SHOW as a thin sheet of its own
  // and (b) shear what is behind it. Feeding the shear into a low-frequency fbm alone averaged it away and
  // the field read as generic fog — the sheets have to reach the shade directly.
  // The scale is deliberately lopsided: ~1.4 cycles across, ~14 up, because heat shears the view in thin
  // horizontal laminae. Isotropic noise here is smoke, whatever colour it is given.
  float rise = time*(0.16 + 0.34*busy);
  vec2 lam = vec2(p.x*1.4, p.y*14.0 - rise*9.0);
  float sheetN = fbm(lam + seed*7.0);
  float sheet = sheetN - 0.5;
  // Weighted to the TOP band, deliberately. Physically heat shimmers off the ground, but on this screen the
  // bottom is the composer island and the middle is the picture; the only band that is reliably empty is the
  // top, so that is where the air is allowed to work. (The first version called this `lift` and read as
  // ground-heat while doing the opposite — a name that lies is a bug with a delay fuse.)
  float airband = 1.0 - smoothstep(0.06, 0.96, uv.y);
  // a second, slower stack so the sheets are not one repeating comb
  float sheet2 = fbm(vec2(p.x*0.7, p.y*6.0 - rise*4.0) + 13.0) - 0.5;
  float laminae = (sheet*0.72 + sheet2*0.42) * airband;
  vec2 warp = vec2(sheet*(0.10 + 0.07*busy)*airband, sheet*0.014*airband);

  // ── the body: slow, wide, domain-warped ──────────────────────────────────────────────────────────────
  vec2 q = p*1.15 + warp + vec2(seed*3.1, -time*0.014);
  float w1 = fbm(q);
  float w2 = fbm(q*1.7 + vec2(w1*0.9, -w1*0.6) + vec2(0.0, time*0.021));
  float body = fbm(q*0.8 + vec2(w2*1.1, w1*0.7));

  // ── the palette comes from the picture, never from a stock hue ───────────────────────────────────────
  // A field borrows a NARROW palette — two or three related tones over large, smooth regions — not the
  // picture's whole gamut sampled per pixel. The first version tapped the texture through the WARPED,
  // high-frequency uv, so adjacent pixels landed on unrelated hues and the field read as an oil slick.
  // Sample low and wide instead, and let only the slow body term choose where.
  vec2 tuv = clamp(vec2(0.35 + 0.30*body, 0.35 + 0.30*w2), 0.06, 0.94);
  vec3 c1 = texture(tex, tuv).rgb;
  vec3 c2 = texture(tex, clamp(vec2(1.0) - tuv, 0.06, 0.94)).rgb;
  float m = clamp(0.5 + 0.5*sin(6.283*(facet + 0.25*w1)), 0.0, 1.0);
  vec3 pal = mix(c1, c2, m);
  // and it is a TINT, not a reproduction: collapse most of the chroma toward the tone's own luma, or the
  // rescale below turns every deep blue into a glowing one
  pal = mix(vec3(luma(pal)), pal, mix(0.34, 0.11, lite));
  // before a picture exists there is no palette: fall back to a neutral that carries the theme, not a hue
  vec3 neutral = mix(vec3(0.012, 0.012, 0.012), vec3(0.965, 0.957, 0.933), lite);   // the page's bases: #000 / #F6F4EE
  vec3 col = mix(neutral, pal, ready*0.85);

  // ── arrival: a bloom that swells from the middle and settles ─────────────────────────────────────────
  float d = length(p - vec2(asp*0.5, 0.42));
  float bloom = arrive * exp(-d*d*(2.2 + 6.0*(1.0-arrive))) * 0.35;

  // ── grain: fine, and only where the air is working ───────────────────────────────────────────────────
  float grain = (hash(gl_FragCoord.xy + fract(time)*137.0) - 0.5) * (0.012 + 0.030*busy);

  // ── the amplitude contract ───────────────────────────────────────────────────────────────────────────
  float base = mix(0.165, 0.93, lite);
  float lo = mix(0.10, 0.64, lite), hi = mix(0.32, 0.97, lite);
  // the sheets carry roughly as much of the shade as the body does — that ratio IS the heat reading; drop
  // the lamina term below about half the body's and the field falls back to fog
  float shade = base
    + (body - 0.5)*mix(0.205, 0.185, lite)
    + laminae*mix(0.150, 0.145, lite)
    + bloom + grain;
  float target = clamp(shade, lo, hi);
  // drive the picture's colour to the shade the contract allows, keeping its hue
  float l = max(luma(col), 1e-3);
  col *= target / l;
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}
