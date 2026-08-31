#version 300 es
// (#version stays on line 1: ANGLE refuses a directive that is not the first line, comments or not.)
// hoard — the molten heap (GLSL ES 3.00, mounted by /_rt/glstage.js). The owner's brief was explicit:
// NOT crisp polygonal coins, something smooth and diffuse "like fire". So the hoard is a MASS with a smoke
// front, not a stack of objects: three domain-warped fbm stacks (the farm's field recipe, and the same one
// 21st's "WebGL Liquid" premium hero turns out to use) give the body, a ridged fold gives the molten seams
// that read as coin edges, and the surface is a soft front that licks upward instead of a waterline.
//
//   vary.x  fill    0..1  how high the heap stands — earn.js hoardFill(), saturating on the WORK
//   vary.y  heat    0..1  is the session running (eased in JS, so start/stop is a swell, never a cut)
//   vary.z  glint   0..1  a decaying pulse fired on every whole unit earned — a coin landing
//   vary.w  phase   s     INTEGRATED in JS (never time*heat: that jerks the whole field on a state change)
//   ink.rgb          gold in DISPLAY space; ink.a = lifetime depth 0..1 (everything ever banked)
//   env.x   light   0..1  the runtime's theme channel (eased over ~250 ms on toggle)
//
// FREQUENCIES ARE IN FRAME HEIGHTS, and that is the trap this shader was rebuilt for. p-unit = frame
// HEIGHT, so on the reference device (384x832) p.x spans only +-0.23: the first cut wrote `fbm(p*1.6)`,
// which is less than ONE noise cell across the whole width, and rendered as a flat amber slab with no
// structure at all. Multiplier for N features across the width = N / (width/height) = N * 2.17 at 384x832.
// A cell at frequency f is 832/f px, and fbm doubles four times, so fbm(p*4.3) runs 193px down to 24px.
//
// AMPLITUDE BUDGET, in DISPLAY space: dark base 0.165 -> the field is clamped to [0.085, 0.36]; light base
// 0.93 -> [0.50, 0.88] — on a near-white page gold must be DARKER than the paper or it reads as lemon
// candy (measured: the first light pass did). 0.50 is the floor 4.5:1 allows against base-content #0A0A0C
// (linear 0.0034): (0.472^2.2+0.05)/(0.0034+0.05) = 4.5. Dark ceiling 0.36 is 5.1:1 the other way. The band is
// narrow, so it is spent on STRUCTURE: a smooth top-to-bottom ramp would eat all of it and read as a slab.
//
// The heap's crest tops out at 0.60 of the frame height ON PURPOSE: the amount block sits at roughly
// 0.65..0.78 from the bottom, so a full hoard rises TOWARD the number and never behind it.
precision highp float;
out vec4 o;
uniform vec2 res; uniform float time; uniform float seed;
uniform vec4 ink; uniform vec4 vary; uniform vec4 env;
const mat2 R = mat2(0.86, 0.51, -0.51, 0.86);
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*noise(p); p=R*p*2.0+vec2(1.7,9.2); a*=0.5; } return s; }
float luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }

void main(){
  vec2 uv = gl_FragCoord.xy/res; uv.y = 1.0-uv.y;              // top-down like the DOM
  float aspect = res.x/res.y;
  vec2 p = (uv-0.5)*vec2(aspect,1.0);                           // p-unit = frame HEIGHT
  float up = 1.0-uv.y;                                          // 0 at the bottom of the frame, 1 at the top

  float fill = clamp(vary.x, 0.0, 1.0);
  float heat = clamp(vary.y, 0.0, 1.0);
  float glint = clamp(vary.z, 0.0, 1.0);
  float ph = vary.w + seed*7.0;
  float depth = clamp(ink.a, 0.0, 1.0);
  float light = env.x;
  float breath = 0.5+0.5*sin(time*2.0*3.14159/11.0);            // 11 s breath under everything

  // ---- the crest: MOUNDS, not a level. A flat top reads as liquid in a glass; one broad asymmetric
  // shoulder (~1.5 across the width) plus a 4-across ripple read as something heaped. Both drift, slowly,
  // so the pile settles while you watch.
  float mound = noise(vec2(p.x*3.3 + ph*0.05, 3.7)) - 0.5;
  float ripple = noise(vec2(p.x*8.7 - ph*0.18, 9.1)) - 0.5;
  float front = 0.08 + 0.52*fill + mound*0.12*(0.35+0.65*fill) + ripple*0.035;

  // ---- the front is a FLAME, not a waterline: ~5 tongues across the width pull it upward, and the fuzz
  // widens with heat (0.035..0.11 of the frame = 29..92 px on the reference device's 832).
  float lick = fbm(vec2(p.x*10.8, up*4.0 - ph*0.7)) - 0.5;
  float edge = up - lick*0.075*(0.30+0.70*heat);
  float soft = 0.035 + 0.075*heat;
  float mass = 1.0 - smoothstep(front - soft, front + soft, edge);

  // ---- the molten body: broad lumps (193..24 px), the warped body (77..10 px) and a coin-scale glitter
  // grain (43..5 px). Each stack is displaced by the one before it — warping the DOMAIN is what makes a
  // noise field look filmed rather than printed.
  float t = ph*0.35;
  float n1 = fbm(p*4.3 + vec2(t*0.5, -t*0.8));
  float n2 = fbm((p + (n1-0.5)*(0.30+0.25*heat))*10.8 - vec2(t*0.4, t*1.1));
  float n3 = fbm((p + (n2-0.5)*0.16)*19.5 + vec2(t*0.3, -t*0.7));
  float vein = pow(1.0 - abs(2.0*n2 - 1.0), 3.0);               // molten seams: the coin edges, without edges
  float facet = pow(1.0 - abs(2.0*n3 - 1.0), 4.0);              // the fine catch-light on the pile's grain
  float lumps = smoothstep(0.34, 0.72, n1);
  float grain = clamp(lumps*0.42 + vein*0.46 + facet*0.34, 0.0, 1.0);

  // The near side of a heap is in its own shadow; the crest catches the light. Kept deliberately shallow
  // (0.55..1.0, not 0.4..1.0) because a strong vertical ramp spends the whole luminance band on a gradient.
  float crest = smoothstep(front-0.42, front, up);
  float shade = mix(0.55, 1.0, crest)*(0.30 + 0.70*grain);

  // A specular RIM right at the surface, broken by the same grain — the one cue that says metal rather than
  // paint. 0.045 of the frame = 37 px of Gaussian, so it is a lit edge, never a drawn line.
  float rim = exp(-pow((front-up)/0.045, 2.0)) * (0.35 + 0.65*grain) * (0.55 + 0.45*heat);

  // ---- glints: gems and coin faces. JITTERED 14 px cells — a plain floor(coord/n) hash is a visible
  // LATTICE, which is exactly how the first cut rendered (an aligned grid of orange dots). Multiplied by
  // `mass`, because the first cut multiplied by `crest` alone, which is 1 everywhere ABOVE the pile and
  // sprinkled gems across the empty sky.
  vec2 gc = gl_FragCoord.xy/14.0, gi = floor(gc), gf = fract(gc);
  vec2 gj = vec2(hash(gi+7.1), hash(gi+3.3));
  float gsel = hash(gi + floor(ph*2.5)*37.0);
  float gem = smoothstep(0.34, 0.0, length(gf-gj)) * step(0.88, gsel) * mass * (0.20 + 0.80*crest) * (0.25 + 0.75*glint);

  // ---- heat haze: what the pile throws off, wisped by its own field so it is smoke and not a gradient.
  float motes = fbm(vec2(p.x*13.0, up*9.0 - ph*1.1));
  float haze = exp(-max(0.0, up-front)*7.0) * heat * (0.28+0.34*fill) * (0.45+1.10*motes);

  // The seams run hotter the deeper into the pile you look — molten metal lit from inside, not a painted
  // surface. Only while it is running: a banked hoard has cooled.
  float deep = smoothstep(0.02, 0.32, front-up);

  // ---- luminance, set explicitly INSIDE the budget (display space), so the field spans its band by
  // construction instead of riding the clamp as one flat slab.
  float lo = mix(0.085, 0.50, light), hi = mix(0.36, 0.88, light);
  float f = mass*(0.16 + 0.84*shade) + rim*0.40*mass + gem*0.55
          + mass*deep*vein*0.12*heat + 0.04*breath*mass;
  // In LIGHT the same distribution rides the top of its band and renders as amber gel — the body has to
  // sit LOW in the band and let only the highlights climb, which is what gold on paper actually does.
  float fc = clamp(f, 0.0, 1.0);
  float Lt = lo + (hi-lo)*mix(fc, pow(fc, 1.7), light);

  // SPECULAR OVERSHOOT. Gold held under a flat ceiling reads as khaki — what makes metal look like metal is
  // a few per cent of the pixels going much brighter than the body ever does. So the rim and the gems are
  // allowed past `hi`, and the licence is bought with a hard height gate: it fades out over up 0.50..0.62
  // and the amount block sits at 0.65..0.78, so no glint can ever brighten the ground under the type. The
  // body's own clamp — the one axe cannot see and the contrast floor depends on — is untouched.
  float spec = clamp(rim*0.95*mass + gem*1.20, 0.0, 1.0);
  float safe = 1.0 - smoothstep(0.50, 0.62, up);
  float hiS = mix(0.62, 0.97, light);
  Lt = min(hiS, Lt + (hiS-hi)*spec*safe);

  // colour: the gold at THAT luminance. A deeper hoard runs richer and warmer — the one thing lifetime
  // says — and a lit facet swings toward the hot end of the metal instead of just getting brighter.
  vec3 gold = mix(ink.rgb, ink.rgb*vec3(1.07,0.85,0.52), depth*0.55);
  gold = mix(gold, ink.rgb*vec3(1.14,0.97,0.66), clamp(spec*0.9, 0.0, 1.0));
  float Lp = max(luma(gold), 0.05);
  vec3 col = gold*(Lt/Lp);
  col = mix(col, vec3(Lt), mix(0.16, 0.48, light));              // light pulls harder: a pastel at L 0.8 reads as candy
  col = clamp(col, 0.0, 1.0);

  vec3 bg = mix(vec3(0.012,0.012,0.012), vec3(0.965,0.957,0.933), light);   // the page's bases: #000 / #F6F4EE (luminous repaint)
  float presence = clamp(mass*0.97 + gem, 0.0, 1.0);
  float vig = 1.0 - 0.18*smoothstep(0.55, 1.15, length(p*vec2(0.85,1.0)));
  col = mix(bg, col, presence*vig);

  // The heat above the pile is composited SEPARATELY, because it is the one term whose correct DIRECTION
  // flips with the theme. Run through the band like everything else it lands near the band's floor — which
  // on a near-white page is DARKER than the paper, so rising heat rendered as a grey smear over the top two
  // thirds of the screen (measured: that is how the first light build shipped). A glow is defined by being
  // lighter than what it sits on, so it gets its own luminance either side: 0.34 in dark (inside the band's
  // ceiling, so the type contract holds) and 0.965 in light — just above the page, never below it.
  float hazeL = mix(0.34, 0.965, light);
  vec3 hazeCol = mix(clamp(gold*(hazeL/Lp), 0.0, 1.0), vec3(hazeL), mix(0.25, 0.62, light));
  col = mix(col, hazeCol, clamp(haze*mix(0.85, 0.55, light), 0.0, 1.0)*(1.0-mass)*vig);
  col += (hash(gl_FragCoord.xy + fract(time)) - 0.5) * (2.0/255.0) + (hash(gl_FragCoord.xy*1.7)-0.5)*0.012;
  o = vec4(col, 1.0);
}
