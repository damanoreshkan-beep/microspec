#version 300 es
precision highp float;
out vec4 o;
uniform vec2 res; uniform float time; uniform float seed;
uniform vec4 ink;
uniform vec4 vary;
uniform vec4 env;
uniform sampler2D tex; uniform vec2 texAspect;

const mat2 R = mat2(0.86, 0.51, -0.51, 0.86);
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*noise(p); p=R*p*2.0+vec2(1.7,9.2); a*=0.5; } return s; }
float luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }

void main(){
  vec2 uv = gl_FragCoord.xy/res; uv.y = 1.0 - uv.y;
  float asp = res.x/max(res.y, 1.0);
  vec2 p = vec2(uv.x*asp, uv.y);
  float lite = clamp(env.x, 0.0, 1.0);
  float busy = clamp(vary.x, 0.0, 1.0);
  float arrive = clamp(vary.y, 0.0, 1.0);
  float facet = clamp(vary.z, 0.0, 1.0);
  float ready = clamp(vary.w, 0.0, 1.0);

  float rise = time*(0.16 + 0.34*busy);
  vec2 lam = vec2(p.x*1.4, p.y*14.0 - rise*9.0);
  float sheetN = fbm(lam + seed*7.0);
  float sheet = sheetN - 0.5;
  float airband = 1.0 - smoothstep(0.06, 0.96, uv.y);
  float sheet2 = fbm(vec2(p.x*0.7, p.y*6.0 - rise*4.0) + 13.0) - 0.5;
  float laminae = (sheet*0.72 + sheet2*0.42) * airband;
  vec2 warp = vec2(sheet*(0.10 + 0.07*busy)*airband, sheet*0.014*airband);

  vec2 q = p*1.15 + warp + vec2(seed*3.1, -time*0.014);
  float w1 = fbm(q);
  float w2 = fbm(q*1.7 + vec2(w1*0.9, -w1*0.6) + vec2(0.0, time*0.021));
  float body = fbm(q*0.8 + vec2(w2*1.1, w1*0.7));

  vec2 tuv = clamp(vec2(0.35 + 0.30*body, 0.35 + 0.30*w2), 0.06, 0.94);
  vec3 c1 = texture(tex, tuv).rgb;
  vec3 c2 = texture(tex, clamp(vec2(1.0) - tuv, 0.06, 0.94)).rgb;
  float m = clamp(0.5 + 0.5*sin(6.283*(facet + 0.25*w1)), 0.0, 1.0);
  vec3 pal = mix(c1, c2, m);
  pal = mix(vec3(luma(pal)), pal, mix(0.34, 0.11, lite));
  vec3 neutral = mix(vec3(0.012, 0.012, 0.012), vec3(0.965, 0.957, 0.933), lite);
  vec3 col = mix(neutral, pal, ready*0.85);

  float d = length(p - vec2(asp*0.5, 0.42));
  float bloom = arrive * exp(-d*d*(2.2 + 6.0*(1.0-arrive))) * 0.35;

  float grain = (hash(gl_FragCoord.xy + fract(time)*137.0) - 0.5) * (0.012 + 0.030*busy);

  float base = mix(0.165, 0.93, lite);
  float lo = mix(0.10, 0.64, lite), hi = mix(0.32, 0.97, lite);
  float shade = base
    + (body - 0.5)*mix(0.205, 0.185, lite)
    + laminae*mix(0.150, 0.145, lite)
    + bloom + grain;
  float target = clamp(shade, lo, hi);
  float l = max(luma(col), 1e-3);
  col *= target / l;
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}
