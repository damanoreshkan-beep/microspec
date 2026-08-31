#version 300 es
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
  vec2 uv = gl_FragCoord.xy/res; uv.y = 1.0-uv.y;
  float aspect = res.x/res.y;
  vec2 p = (uv-0.5)*vec2(aspect,1.0);
  float up = 1.0-uv.y;

  float fill = clamp(vary.x, 0.0, 1.0);
  float heat = clamp(vary.y, 0.0, 1.0);
  float glint = clamp(vary.z, 0.0, 1.0);
  float ph = vary.w + seed*7.0;
  float depth = clamp(ink.a, 0.0, 1.0);
  float light = env.x;
  float breath = 0.5+0.5*sin(time*2.0*3.14159/11.0);

  float mound = noise(vec2(p.x*3.3 + ph*0.05, 3.7)) - 0.5;
  float ripple = noise(vec2(p.x*8.7 - ph*0.18, 9.1)) - 0.5;
  float front = 0.08 + 0.52*fill + mound*0.12*(0.35+0.65*fill) + ripple*0.035;

  float lick = fbm(vec2(p.x*10.8, up*4.0 - ph*0.7)) - 0.5;
  float edge = up - lick*0.075*(0.30+0.70*heat);
  float soft = 0.035 + 0.075*heat;
  float mass = 1.0 - smoothstep(front - soft, front + soft, edge);

  float t = ph*0.35;
  float n1 = fbm(p*4.3 + vec2(t*0.5, -t*0.8));
  float n2 = fbm((p + (n1-0.5)*(0.30+0.25*heat))*10.8 - vec2(t*0.4, t*1.1));
  float n3 = fbm((p + (n2-0.5)*0.16)*19.5 + vec2(t*0.3, -t*0.7));
  float vein = pow(1.0 - abs(2.0*n2 - 1.0), 3.0);
  float facet = pow(1.0 - abs(2.0*n3 - 1.0), 4.0);
  float lumps = smoothstep(0.34, 0.72, n1);
  float grain = clamp(lumps*0.42 + vein*0.46 + facet*0.34, 0.0, 1.0);

  float crest = smoothstep(front-0.42, front, up);
  float shade = mix(0.55, 1.0, crest)*(0.30 + 0.70*grain);

  float rim = exp(-pow((front-up)/0.045, 2.0)) * (0.35 + 0.65*grain) * (0.55 + 0.45*heat);

  vec2 gc = gl_FragCoord.xy/14.0, gi = floor(gc), gf = fract(gc);
  vec2 gj = vec2(hash(gi+7.1), hash(gi+3.3));
  float gsel = hash(gi + floor(ph*2.5)*37.0);
  float gem = smoothstep(0.34, 0.0, length(gf-gj)) * step(0.88, gsel) * mass * (0.20 + 0.80*crest) * (0.25 + 0.75*glint);

  float motes = fbm(vec2(p.x*13.0, up*9.0 - ph*1.1));
  float haze = exp(-max(0.0, up-front)*7.0) * heat * (0.28+0.34*fill) * (0.45+1.10*motes);

  float deep = smoothstep(0.02, 0.32, front-up);

  float lo = mix(0.085, 0.50, light), hi = mix(0.36, 0.88, light);
  float f = mass*(0.16 + 0.84*shade) + rim*0.40*mass + gem*0.55
          + mass*deep*vein*0.12*heat + 0.04*breath*mass;
  float fc = clamp(f, 0.0, 1.0);
  float Lt = lo + (hi-lo)*mix(fc, pow(fc, 1.7), light);

  float spec = clamp(rim*0.95*mass + gem*1.20, 0.0, 1.0);
  float safe = 1.0 - smoothstep(0.50, 0.62, up);
  float hiS = mix(0.62, 0.97, light);
  Lt = min(hiS, Lt + (hiS-hi)*spec*safe);

  vec3 gold = mix(ink.rgb, ink.rgb*vec3(1.07,0.85,0.52), depth*0.55);
  gold = mix(gold, ink.rgb*vec3(1.14,0.97,0.66), clamp(spec*0.9, 0.0, 1.0));
  float Lp = max(luma(gold), 0.05);
  vec3 col = gold*(Lt/Lp);
  col = mix(col, vec3(Lt), mix(0.16, 0.48, light));
  col = clamp(col, 0.0, 1.0);

  vec3 bg = mix(vec3(0.012,0.012,0.012), vec3(0.965,0.957,0.933), light);
  float presence = clamp(mass*0.97 + gem, 0.0, 1.0);
  float vig = 1.0 - 0.18*smoothstep(0.55, 1.15, length(p*vec2(0.85,1.0)));
  col = mix(bg, col, presence*vig);

  float hazeL = mix(0.34, 0.965, light);
  vec3 hazeCol = mix(clamp(gold*(hazeL/Lp), 0.0, 1.0), vec3(hazeL), mix(0.25, 0.62, light));
  col = mix(col, hazeCol, clamp(haze*mix(0.85, 0.55, light), 0.0, 1.0)*(1.0-mass)*vig);
  col += (hash(gl_FragCoord.xy + fract(time)) - 0.5) * (2.0/255.0) + (hash(gl_FragCoord.xy*1.7)-0.5)*0.012;
  o = vec4(col, 1.0);
}
