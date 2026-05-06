// =============================================================
// Tiny helpers used across the project. Kept pure & dependency-free.
// =============================================================

export const rand = (a, b) => a + Math.random() * (b - a);
export const randi = (n) => (Math.random() * n) | 0;
export const choice = (arr) => arr[(Math.random() * arr.length) | 0];
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;

// Standard normal via Box-Muller, used for gene mutation.
export function gaussian(mean = 0, std = 1) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// HSL → CSS color string. Used so heritable hue genes can drive visuals.
export const hsl = (h, s, l, a = 1) => `hsla(${h | 0},${s}%,${l}%,${a})`;

// 2D distance squared (avoids sqrt where possible).
export const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};

// Wrap a coordinate to [0, n).
export const wrap = (v, n) => {
  if (v < 0) return v + n;
  if (v >= n) return v - n;
  return v;
};

// Smoothstep for easing visual transitions (day/night).
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// Pick weighted item: arr is [[item, weight], ...]
export function weighted(arr) {
  let total = 0;
  for (const e of arr) total += e[1];
  let r = Math.random() * total;
  for (const e of arr) {
    r -= e[1];
    if (r <= 0) return e[0];
  }
  return arr[arr.length - 1][0];
}
