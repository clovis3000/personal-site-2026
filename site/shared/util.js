export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const TAU = Math.PI * 2;

export function rng(seed = 1) {            // mulberry32
  let a = seed >>> 0;
  const f = () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.range = (a, b) => a + (b - a) * f();
  f.int = (a, b) => Math.floor(f.range(a, b + 1));
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  f.sign = () => (f() < .5 ? -1 : 1);
  f.gauss = () => { let u = 0, v = 0; while (!u) u = f(); while (!v) v = f(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };
  return f;
}

export function hash(i, s = 0) {
  let h = Math.imul((i | 0) ^ Math.imul(s | 0, 0x9E3779B1), 0x27d4eb2d);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
// smooth value noise, 0..1
export function noise1(x, s = 0) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash(i, s), hash(i + 1, s), u);
}
export function noise2(x, y, s = 0) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const h = (a, b) => hash(Math.imul(a, 73856093) ^ Math.imul(b, 19349663), s);
  return lerp(lerp(h(i, j), h(i + 1, j), u), lerp(h(i, j + 1), h(i + 1, j + 1), u), v);
}
export const fbm1 = (x, s = 0) => noise1(x, s) * .6 + noise1(x * 2.3, s + 7) * .3 + noise1(x * 5.1, s + 13) * .1;

export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
  }
  for (const k of kids) e.append(k);
  return e;
}
