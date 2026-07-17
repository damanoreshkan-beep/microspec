
const PLAYABLE = /\.(mp4|m4v|webm|ogv)$/i;
const THUMBS = /(^|\/)[^/]*\.thumbs\//i;
const RANK = [/h\.?\s*264|avc/i, /mpeg-?\s*4|mp4/i, /webm|vp[89]/i, /ogg|ogv|theora/i];
const rankOf = (f) => {
  const s = `${f.format || ""} ${f.name || ""}`;
  const i = RANK.findIndex((re) => re.test(s));
  return i < 0 ? RANK.length : i;
};
export function pickFile(files) {
  const ok = (files || []).filter((f) => f?.name && PLAYABLE.test(f.name) && !THUMBS.test(f.name));
  if (!ok.length) return null;
  return ok.sort((a, b) => rankOf(a) - rankOf(b) || (Number(b.size) || 0) - (Number(a.size) || 0))[0];
}

export const RESUME_MIN = 30;          
export const RESUME_TAIL = 0.98;       
export function resumeAt(saved, duration) {
  const t = Number(saved), d = Number(duration);
  if (!isFinite(t) || t < RESUME_MIN) return 0;
  if (!isFinite(d) || d <= 0) return 0;                 
  if (t >= d * RESUME_TAIL) return 0;
  return t;
}
