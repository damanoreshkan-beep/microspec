// microspec runtime — the DUST field: a premium WebGL particle cloud that scatters and gathers, used as the
// generation/wait stage (apps/imagine). Particles rest in a gathered orb, breathe outward into dust and draw
// back in; as `progress` rises toward 1 the cloud gathers tighter — anticipation before the image reveals.
//
// Adapted from a 21st.dev particle field (lovesickfromthe6ix/particle-text): the soft radial glow point and
// the spring-to-target physics are theirs; the scatter/gather choreography, the phyllotaxis orb and the
// zero-build preact wrapper are ours. No post-processing (bloom/aberration) — additive glow over a dark
// vignette reads premium and holds 60fps on a phone. The stage is always dark (a darkroom while developing),
// so it looks right in both themes.
//
// Gate-safe: under a screenshot/e2e run there is no animation and no WebGL — a static gathered orb renders as
// plain CSS, so the gate is deterministic and axe sees a stable frame.
import { html } from "htm/preact";
import { useRef, useEffect } from "preact/hooks";
import { gate } from "./gate.js";   // runtime modules import RELATIVELY — /_rt/ 404s under /microspec/

const DPR_CAP = 2;
const N = 1500;                     // fine points — additive glow means MANY overlaps blow to white, so keep it sparse

const VS = `
  attribute vec2 a_pos; attribute float a_size; attribute float a_alpha;
  varying float v_alpha;
  void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); gl_PointSize = a_size; v_alpha = a_alpha; }`;
const FS = `
  precision mediump float; uniform vec3 u_tint; varying float v_alpha;
  void main(){
    vec2 c = gl_PointCoord - 0.5; float d = length(c);
    if (d > 0.5) discard;
    float core = 1.0 - smoothstep(0.0, 0.18, d);
    float halo = 1.0 - smoothstep(0.18, 0.5, d);
    float glow = pow(core, 3.0) + pow(halo, 1.8) * 0.3;
    vec3 col = mix(u_tint, vec3(1.0), core * 0.7);
    gl_FragColor = vec4(col, glow * v_alpha);
  }`;

function compile(gl, type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
function hexTint() {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--app-accent").trim();
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v);
    if (m) return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
  } catch { /* fall through */ }
  return [0.95, 0.78, 0.42];   // warm gold
}

export function Dust({ active = true, progress = null }) {
  const ref = useRef(null);
  const progRef = useRef(progress);
  progRef.current = progress;

  useEffect(() => {
    if (gate) return;                                  // static CSS orb under the gate (below)
    const canvas = ref.current; if (!canvas) return;
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: true });
    if (!gl) return;
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog); gl.useProgram(prog);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);   // additive glow

    // particle home = phyllotaxis disc (a dense, even, organic orb); scatter = an outward ray per particle.
    const home = new Float32Array(N * 2), ang = new Float32Array(N), rad = new Float32Array(N),
      ph = new Float32Array(N), sz = new Float32Array(N), px = new Float32Array(N * 2), pv = new Float32Array(N * 2);
    const GA = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const r = Math.sqrt(i / N), a = i * GA;
      home[i * 2] = Math.cos(a) * r * 0.52; home[i * 2 + 1] = Math.sin(a) * r * 0.52;
      ang[i] = Math.random() * Math.PI * 2; rad[i] = 0.45 + Math.random() * 1.5;   // drift out to the frame edges
      ph[i] = Math.random() * Math.PI * 2; sz[i] = 1.5 + Math.random() * 2.4;
      px[i * 2] = home[i * 2]; px[i * 2 + 1] = home[i * 2 + 1];
    }
    const pos = new Float32Array(N * 2), size = new Float32Array(N), alpha = new Float32Array(N);
    const bPos = gl.createBuffer(), bSize = gl.createBuffer(), bAlpha = gl.createBuffer();
    const lPos = gl.getAttribLocation(prog, "a_pos"), lSize = gl.getAttribLocation(prog, "a_size"), lAlpha = gl.getAttribLocation(prog, "a_alpha");
    const uTint = gl.getUniformLocation(prog, "u_tint");
    gl.uniform3fv(uTint, hexTint());

    let dpr = 1, aspect = 1;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
      aspect = canvas.width / canvas.height; gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(canvas);

    let raf = 0, t0 = performance.now(), gather = 0;
    const frame = (now) => {
      const t = (now - t0) / 1000;
      // gatherPull: rises with progress (tighten as it nears done); a gentle floor so it always breathes.
      const target = progRef.current == null ? 0 : Math.min(1, Math.max(0, progRef.current));
      gather += (target - gather) * 0.03;
      const fit = aspect >= 1 ? [1 / aspect, 1] : [1, aspect];   // keep the orb circular
      for (let i = 0; i < N; i++) {
        const wave = 0.5 + 0.5 * Math.sin(t * 0.7 + ph[i]);
        const spread = (0.28 + 0.9 * wave) * (1 - gather * 0.85);
        const swirl = t * 0.12;
        const ax = ang[i] + swirl;
        const tx = home[i * 2] * (0.92 + gather * 0.08) + Math.cos(ax) * rad[i] * spread;
        const ty = home[i * 2 + 1] * (0.92 + gather * 0.08) + Math.sin(ax) * rad[i] * spread;
        pv[i * 2] += (tx - px[i * 2]) * 0.05; pv[i * 2] *= 0.9; px[i * 2] += pv[i * 2];
        pv[i * 2 + 1] += (ty - px[i * 2 + 1]) * 0.05; pv[i * 2 + 1] *= 0.9; px[i * 2 + 1] += pv[i * 2 + 1];
        pos[i * 2] = px[i * 2] * fit[0]; pos[i * 2 + 1] = px[i * 2 + 1] * fit[1];
        size[i] = sz[i] * dpr * (0.75 + wave * 0.5);
        alpha[i] = 0.12 + 0.10 * (1 - Math.min(1, spread));   // low — additive glow builds gently, bright when gathered, never white-out
      }
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindBuffer(gl.ARRAY_BUFFER, bPos); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(lPos); gl.vertexAttribPointer(lPos, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, bSize); gl.bufferData(gl.ARRAY_BUFFER, size, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(lSize); gl.vertexAttribPointer(lSize, 1, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, bAlpha); gl.bufferData(gl.ARRAY_BUFFER, alpha, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(lAlpha); gl.vertexAttribPointer(lAlpha, 1, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.POINTS, 0, N);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); const ext = gl.getExtension("WEBGL_lose_context"); if (ext) ext.loseContext(); };
  }, [active]);

  // The dark stage + vignette is a plain element, so the gate (and a no-WebGL device) still gets a premium
  // frame: a soft radial glow orb standing in for the gathered dust.
  return html`<div class="absolute inset-0 overflow-hidden" style="background:radial-gradient(120% 120% at 50% 45%, #16131f 0%, #0a0a0f 70%)">
    <div class="absolute left-1/2 top-[45%] -translate-x-1/2 -translate-y-1/2 rounded-full"
      style="width:46vmin;height:46vmin;background:radial-gradient(circle, color-mix(in srgb, var(--app-accent, #f2c766) 55%, transparent) 0%, transparent 62%);filter:blur(6px)"></div>
    ${gate ? null : html`<canvas ref=${ref} class="absolute inset-0 w-full h-full"></canvas>`}
  </div>`;
}
