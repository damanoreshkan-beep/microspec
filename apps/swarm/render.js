// swarm — the look. The reactor hands a WORLD list (azimuth/elevation/distance); everything on
// screen — projection, silhouettes, crosshair, radar, damage vignette — is decided here, drawn
// as vectors over foreign content (a live camera frame), so every mark carries its own dark
// halo instead of trusting the backdrop. The accent is read off the element at draw time
// (--app-accent), never baked.

import { S, decodeEntry, project, angRadiusT, wrapT, radarPoint } from "/_rt/swarm.js";

const INK = "rgba(10,10,14,0.6)";           // the halo every mark wears over unknown video
const PAPER = "rgba(245,245,250,0.92)";

/* far first, so a near wasp overdraws a distant one */
function sorted(dl, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(decodeEntry(dl, i));
  return out.sort((a, b) => b.distCm - a.distCm);
}

function wasp(ctx, e, x, y, r, accent, frame) {
  const flap = (e.pose % 2 ? 1 : -1) * (0.5 + (e.pose >> 1) * 0.25);
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = "round";
  if (r < 6) {                                          // a distant speck: dot + ring, readable at 3px
    ctx.fillStyle = e.flash ? PAPER : accent;
    ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, Math.max(1.6, r * 0.6), 0, Math.PI * 2); ctx.stroke(); ctx.fill();
    ctx.restore();
    return;
  }
  // wings first, behind the body — two strokes that beat with the pose
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = Math.max(1, r * 0.16);
  ctx.beginPath();
  ctx.moveTo(-r * 0.2, -r * 0.15); ctx.quadraticCurveTo(-r * 1.1, -r * (0.9 + flap * 0.3), -r * 1.4, -r * 0.2 * flap);
  ctx.moveTo(r * 0.2, -r * 0.15); ctx.quadraticCurveTo(r * 1.1, -r * (0.9 + flap * 0.3), r * 1.4, -r * 0.2 * flap);
  ctx.stroke();
  const body = (path) => { ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, r * 0.22); path(); ctx.stroke(); path(); ctx.fill(); };
  ctx.fillStyle = e.flash ? PAPER : "#1b1b21";
  if (e.kind === 2) {                                   // tank: a broad hexagon, double-ringed
    body(() => { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + frame * 0.01; ctx[i ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r * 0.85); } ctx.closePath(); });
    ctx.strokeStyle = accent; ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2); ctx.stroke();
  } else if (e.kind === 1) {                            // darter: a blade pointed at you
    body(() => { ctx.beginPath(); ctx.moveTo(0, r * 0.9); ctx.lineTo(-r * 0.55, -r * 0.7); ctx.lineTo(0, -r * 0.35); ctx.lineTo(r * 0.55, -r * 0.7); ctx.closePath(); });
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(0, r * 0.35, Math.max(1, r * 0.16), 0, Math.PI * 2); ctx.fill();
  } else {                                              // drone: banded teardrop
    body(() => { ctx.beginPath(); ctx.ellipse(0, 0, r * 0.62, r * 0.85, 0, 0, Math.PI * 2); });
    ctx.strokeStyle = accent; ctx.lineWidth = Math.max(1.5, r * 0.18);
    ctx.beginPath(); ctx.moveTo(-r * 0.55, r * 0.15); ctx.quadraticCurveTo(0, r * 0.45, r * 0.55, r * 0.15); ctx.stroke();
  }
  ctx.restore();
}

function crosshair(ctx, cx, cy, accent, locked, cooldownShare) {
  const r = 15;
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.arc(cx, cy, r + 1, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = locked ? accent : PAPER;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    ctx.beginPath();
    ctx.moveTo(cx + dx * (r + 3), cy + dy * (r + 3));
    ctx.lineTo(cx + dx * (r + 9), cy + dy * (r + 9));
    ctx.stroke();
  }
  if (locked) { ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fill(); }
  if (cooldownShare > 0) {                              // the trigger's own readout, wrapped on the ring
    ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, r + 6, -Math.PI / 2, -Math.PI / 2 + (1 - cooldownShare) * Math.PI * 2); ctx.stroke();
  }
}

function radar(ctx, entries, headingT, x, y, R, accent) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(8,8,12,0.62)";
  ctx.beginPath(); ctx.arc(0, 0, R + 6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, R * 0.5, 0, Math.PI * 2); ctx.stroke();
  // the FOV wedge: what the screen currently sees, up = ahead
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath(); ctx.moveTo(0, 0);
  ctx.arc(0, 0, R, -Math.PI / 2 - Math.PI / 6, -Math.PI / 2 + Math.PI / 6); ctx.closePath(); ctx.fill();
  for (const e of entries) {
    const p = radarPoint(e.azT, headingT, e.distCm, R);
    ctx.fillStyle = e.flash ? PAPER : accent;
    ctx.beginPath(); ctx.arc(p.x, p.y, e.kind === 2 ? 3 : 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/* One frame. fx: { muzzle (frames left), lockedIdx, accent } — transient, owned by the view. */
export function renderFrame(ctx, dl, n, st, headingT, pitchT, w, h, fx) {
  ctx.clearRect(0, 0, w, h);
  const entries = sorted(dl, n);
  const cx = w / 2, cy = h / 2;

  for (const e of entries) {
    const p = project(e.azT, e.elT, headingT, pitchT, w, h);
    const r = angRadiusT(e.kind, e.distCm) * p.k;
    if (p.x < -r * 2 || p.x > w + r * 2 || p.y < -r * 2 || p.y > h + r * 2) continue;
    wasp(ctx, e, p.x, p.y, r, fx.accent, st[S.FRAME]);
  }

  // an off-screen nearest threat gets a chevron on its side — the radar tells, this insists
  if (st[S.ALIVE] > 0 && st[S.NAZ] >= 0) {
    const da = wrapT(st[S.NAZ] - headingT);
    if (Math.abs(da) > 320) {
      const sx = da > 0 ? w - 18 : 18, dir = da > 0 ? 1 : -1;
      ctx.globalAlpha = 0.55 + 0.35 * Math.sin(st[S.FRAME] * 0.25);
      ctx.strokeStyle = fx.accent;
      ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(sx - dir * 8, cy - 12); ctx.lineTo(sx, cy); ctx.lineTo(sx - dir * 8, cy + 12);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  if (fx.muzzle > 0) {                                  // four short rays leaving the crosshair
    ctx.strokeStyle = `rgba(255,255,255,${(fx.muzzle / 4).toFixed(2)})`;
    ctx.lineWidth = 2;
    for (const a of [0.6, 2.2, 3.9, 5.4]) {
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 22, cy + Math.sin(a) * 22);
      ctx.lineTo(cx + Math.cos(a) * (30 + fx.muzzle * 3), cy + Math.sin(a) * (30 + fx.muzzle * 3));
      ctx.stroke();
    }
  }

  crosshair(ctx, cx, cy, fx.accent, fx.lockedIdx >= 0, st[S.DEAD] ? 0 : st[S.COOLDOWN] / 16);
  radar(ctx, entries, headingT, 16 + 40, h - 16 - 40, 34, fx.accent);

  if (st[S.INVULN] > 30 || st[S.DEAD]) {                // the sting: an edge vignette, never a flash card
    const a = st[S.DEAD] ? 0.42 : ((st[S.INVULN] - 30) / 15) * 0.35;
    const g = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.35, cx, cy, Math.max(w, h) * 0.72);
    g.addColorStop(0, "rgba(200,40,30,0)");
    g.addColorStop(1, `rgba(200,40,30,${a.toFixed(2)})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
}
