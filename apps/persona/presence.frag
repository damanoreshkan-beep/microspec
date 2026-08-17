// persona — the presence field (GLSL ES 3.00, mounted by /_rt/glstage.js). The person's PORTRAIT is the
// palette: its colours are pulled through three domain-warped fbm stacks so the field breathes their
// tones — never a stock hue, never the picture itself (the texture arrives at ≤64px, a palette not a photo).
//
//   vary.x  thinking   0..1  the model has the line and no words yet — the field quickens
//   vary.y  speaking   0..1  token energy (decays) — a slow pulse rolls down from where the person is
//   vary.z  listening  0..1  the composer has focus — reserved (kept quiet on purpose)
//   vary.w  ready      0..1  the portrait is bound; fades the field in / cross-fades a person swap
//   env.x   light      0..1  the runtime's theme channel (eased on toggle)
//
// AMPLITUDE BUDGET, in DISPLAY space (the page's own numbers): dark base 0.165 → the field is clamped to
// [0.10, 0.32]; light base 0.93 → [0.64, 0.97]. Measured against base-content: ≥ 4.5:1 at the clamp both
// ways, so the reading text over it never falls below AA even where the palette is brightest. Move these
// and you move a contrast floor for every string on the screen — a contract, not a look.
#version 300 es
precision highp float;
out vec4 o;
uniform vec2 res; uniform float time; uniform float seed;
uniform vec4 vary;   // x thinking, y speaking energy, z listening, w portrait ready (0..1 fade)
uniform vec4 env;    // x theme light 0..1
uniform sampler2D tex; uniform vec2 texAspect; // texture w/h ratio in .x
const mat2 R = mat2(0.86, 0.51, -0.51, 0.86);
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*noise(p); p=R*p*2.0+vec2(1.7,9.2); a*=0.5; } return s; }
float luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
void main(){
  vec2 uv = gl_FragCoord.xy/res; uv.y = 1.0-uv.y;            // top-down like the DOM
  float aspect = res.x/res.y;
  vec2 p = (uv-0.5)*vec2(aspect,1.0);                          // p-unit = frame height
  float light = env.x, think = vary.x, speak = vary.y, listen = vary.z, ready = vary.w;
  float t = time*0.06*(1.0+0.9*think+0.5*speak);
  float breath = 0.5+0.5*sin(time*2.0*3.14159/7.0);            // 7 s breath
  // domain-warped field
  float n1 = fbm(p*1.6 + vec2(t, -t*0.7) + seed*7.0);
  float n2 = fbm((p + (n1-0.5)*0.9)*2.4 - vec2(t*0.8, t));
  float n3 = fbm((p + (n2-0.5)*0.7)*3.6 + t);
  // the portrait: cover-fit, its colours pulled through the warp
  vec2 cuv = uv-0.5; float ta = texAspect.x;                   // texture aspect w/h
  vec2 s = (aspect > ta) ? vec2(1.0, ta/aspect) : vec2(aspect/ta, 1.0);
  vec2 puv = cuv*s + 0.5 + (vec2(n2,n3)-0.5)*(0.32+0.12*breath+0.12*speak);
  vec3 por = texture(tex, puv).rgb;
  vec3 porMean = texture(tex, vec2(0.5), 8.0).rgb;             // coarsest mip ~ mean colour
  vec3 pal = mix(porMean, por, 0.75);
  // presence: strongest where the person "is" (upper third), quieter at the edges
  float focus = (1.0 - smoothstep(0.1, 1.0, length((p - vec2(0.0,-0.34))*vec2(0.85,1.0)))) * (1.0 - smoothstep(-0.05, 0.62, p.y));
  float k = (0.38 + 0.08*breath + 0.16*speak + 0.10*think) * focus * ready;
  float pulse = speak * 0.035 * (0.5+0.5*sin(p.y*9.0 - time*5.0)) * (1.0-light*0.5);
  vec3 bgD = vec3(0.165,0.165,0.18), bgL = vec3(0.93,0.925,0.935);
  vec3 bg = mix(bgD, bgL, light);
  vec3 col = mix(bg, pal, k*(0.9+0.2*n3));
  col += pulse*focus;
  // thinking: a slow light gathering low (near the composer) then rising
  col += think * 0.05 * (1.0 - smoothstep(0.2, 0.9, length(p - vec2(0.0, 0.42 - 0.2*fract(time*0.25)))));
  // legibility clamp in DISPLAY space: dark [0.10,0.36] · light [0.62,0.97]
  float lo = mix(0.10, 0.64, light), hi = mix(0.32, 0.97, light);
  float L = luma(col); float Lc = clamp(L, lo, hi);
  col *= (L > 1e-4) ? Lc/L : 1.0;
  col = mix(col, vec3(Lc), mix(0.15, 0.28, light));                              // pull chroma a touch — colour is a tint, not a poster
  // vignette + grain + dither
  float vig = 1.0 - 0.18*smoothstep(0.55, 1.15, length(p*vec2(0.85,1.0)));
  col = mix(bg, col, vig);
  col += (hash(gl_FragCoord.xy + fract(time)) - 0.5) * (2.0/255.0) + (hash(gl_FragCoord.xy*1.7)-0.5)*0.012;
  o = vec4(col, 1.0);
}
