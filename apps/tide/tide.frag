#version 300 es
// (#version stays on line 1: ANGLE refuses a directive that is not the first line, comments or not.)
// tide - the current's field (GLSL ES 3.00, mounted by /_rt/glstage.js). Three domain-warped fbm stacks
// carry the station's PALETTE (its logo at <=64px, sampled at a coarse mip: colour fields, never the picture)
// or, without one, the current's hue in `ink` - and the field breathes with the live signal:
//
//   vary.x  bass    0..1  the kick swells the field radially (a wider, brighter core)
//   vary.y  mid     0..1  warp depth - the body of the groove bends the field harder
//   vary.z  treble  0..1  fine sparkle grain over the brightest folds
//   vary.w  phase   s     INTEGRATED in JS from energy (never time*energy: that jerks the whole field)
//   ink.rgb          the current's hue in display space; ink.a = palette texture bound (0..1 fade)
//   env.x   light   0..1  the runtime's theme channel (eased on toggle)
//
// AMPLITUDE BUDGET, in DISPLAY space: dark base 0.165 -> the field is clamped to [0.10, 0.32]; light base
// 0.93 -> [0.64, 0.97]. persona measured >= 4.5:1 for base-content at these clamps, and the same strings
// (the strip, the now-playing block) sit over this field. Move them and you move a contrast floor.
precision highp float;
out vec4 o;
uniform vec2 res; uniform float time; uniform float seed;
uniform vec4 ink; uniform vec4 vary; uniform vec4 env;
uniform sampler2D tex; uniform vec2 texAspect;
const mat2 R = mat2(0.86, 0.51, -0.51, 0.86);
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*noise(p); p=R*p*2.0+vec2(1.7,9.2); a*=0.5; } return s; }
float luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
void main(){
  vec2 uv = gl_FragCoord.xy/res; uv.y = 1.0-uv.y;            // top-down like the DOM
  float aspect = res.x/res.y;
  vec2 p = (uv-0.5)*vec2(aspect,1.0);                          // p-unit = frame height
  float light = env.x, bass = vary.x, mid = vary.y, treb = vary.z, ph = vary.w, ready = ink.a;
  float breath = 0.5+0.5*sin(time*2.0*3.14159/9.0);            // 9 s breath under everything
  // domain-warped field; the warp depth is the mid band, the drift is the integrated phase
  float t = ph + seed*11.0;
  float n1 = fbm(p*1.4 + vec2(t*0.9, -t*0.6));
  float n2 = fbm((p + (n1-0.5)*(0.6+0.7*mid))*2.2 - vec2(t*0.7, t*0.9));
  float n3 = fbm((p + (n2-0.5)*(0.5+0.4*mid))*3.4 + vec2(t*0.5, -t*0.4));
  // the palette: the logo cover-fit and pulled through the warp (an absolute coarse mip = colour fields)
  vec2 cuv = uv-0.5; float ta = max(texAspect.x, 1e-3);
  vec2 s = (aspect > ta) ? vec2(1.0, ta/aspect) : vec2(aspect/ta, 1.0);
  vec2 puv = cuv*s + 0.5 + (vec2(n2,n3)-0.5)*(0.6+0.2*breath+0.2*mid);
  vec3 por = textureLod(tex, puv, 2.4).rgb;
  vec3 porMean = textureLod(tex, vec2(0.5), 7.0).rgb;
  vec3 texPal = mix(porMean, por, 0.75);
  vec3 huePal = ink.rgb * (0.85 + 0.3*n2);                    // the current's hue, shaded by the field
  vec3 pal = mix(huePal, texPal, ready);
  pal = mix(pal, vec3(luma(pal)), 0.35);                       // pre-desaturate: a saturated primary scaled to a light luminance would clip
  // STRUCTURE first, in 0..1: veins (a ridged fold of the second stack) over the soft body of the third,
  // gathered by a core that widens and brightens on the kick. Then LUMINANCE is set explicitly inside the
  // budget - the field spans the whole band [lo,hi] by construction instead of riding the clamp as a slab.
  float core = 1.0 - smoothstep(0.10 + 0.30*bass, 0.80 + 0.35*bass, length((p - vec2(0.0,-0.06))*vec2(0.9,1.0)));
  float body = smoothstep(0.28, 0.78, n3);
  float vein = pow(1.0 - abs(2.0*n2 - 1.0), 2.2);
  float shape = mix(body, vein, 0.45) * (0.35 + 0.65*core);
  float lift = 0.06 + 0.16*bass + 0.05*breath;                  // the kick raises the floor of the whole field
  float folds = smoothstep(0.55, 0.9, shape);
  float spark = treb * 0.10 * folds * hash(floor(gl_FragCoord.xy*0.5) + floor(ph*7.0));
  float lo = mix(0.10, 0.64, light), hi = mix(0.32, 0.97, light);
  float Lt = lo + (hi - lo) * clamp(shape*(0.55 + 0.45*bass) + lift + spark, 0.0, 1.0);
  // colour: the palette at THAT luminance (hue from the palette, brightness from the structure)
  float Lp = max(luma(pal), 0.05);
  vec3 col = pal * (Lt / Lp);
  col = mix(col, vec3(Lt), mix(0.22, 0.62, light));                              // colour is a tint, not a poster (light pulls harder: a pastel at L 0.8 reads as candy)
  col = clamp(col, 0.0, 1.0);
  vec3 bgD = vec3(0.165,0.165,0.18), bgL = vec3(0.93,0.925,0.935);
  vec3 bg = mix(bgD, bgL, light);
  // vignette + grain + dither
  float vig = 1.0 - 0.20*smoothstep(0.55, 1.15, length(p*vec2(0.85,1.0)));
  col = mix(bg, col, vig);
  col += (hash(gl_FragCoord.xy + fract(time)) - 0.5) * (2.0/255.0) + (hash(gl_FragCoord.xy*1.7)-0.5)*0.012;
  o = vec4(col, 1.0);
}
