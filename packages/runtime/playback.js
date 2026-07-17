

export const RESUME_MIN = 30;          
export const RESUME_TAIL = 0.98;       
export function resumeAt(saved, duration) {
  const t = Number(saved), d = Number(duration);
  if (!isFinite(t) || t < RESUME_MIN) return 0;
  if (!isFinite(d) || d <= 0) return 0;                 
  if (t >= d * RESUME_TAIL) return 0;
  return t;
}
