// The seafaring map's demonstration: the method, built step by step as the page scrolls past a pinned chart
// of the Arabian Sea. Each step's marks are timed to its own second of the scroll's clock (step k paints in
// k..k+1), so scrolling back unpaints them. The coast as it stood, cut into stretches, waterlines off it (the
// seam with seigaiha); the monsoons and a fan of drift; every stretch scored by how much drift passes it,
// blind to the sites; the known sites and their sea roads; then the prediction: high scores with no site yet.
// A sketch of the method, not the model's output.
import { PROFILE, spline } from './shared/brush.js';
import { hex, shade } from './shared/ornament.js';
import { rng, lerp, clamp, noise1, TAU } from './shared/util.js';

// the chart's window, in degrees
const LON0 = 43, LON1 = 76, LAT0 = 8, LAT1 = 29;
export const ASPECT = (LON1 - LON0) * Math.cos(18 * Math.PI / 180) / (LAT1 - LAT0);
export const STEPS = 6;

const LAND = {
  arabia: [[38, 31], [47.9, 29.9], [48.5, 28.4], [49.6, 27.0], [50.1, 26.5], [50.6, 25.6], [50.8, 24.8], [51.0, 25.6], [51.25, 26.15], [51.55, 25.9], [51.6, 24.9], [52.6, 24.2], [54.0, 24.2], [54.6, 24.5], [55.3, 25.2], [55.9, 25.7], [56.1, 26.1], [56.35, 26.38], [56.45, 26.2], [56.3, 25.6], [56.6, 24.5], [57.4, 23.9], [58.6, 23.6], [59.4, 22.9], [59.8, 22.5], [59.3, 21.4], [58.6, 20.4], [57.8, 19.5], [57.7, 18.9], [56.6, 18.0], [55.3, 17.3], [54.1, 17.0], [52.2, 16.0], [51.4, 15.3], [49.1, 14.5], [48.0, 14.0], [46.0, 13.4], [45.0, 12.8], [43.5, 12.6], [43.2, 13.6], [42.6, 15.2], [40, 19], [36, 31]],
  africa: [[36, 6], [36, 14], [41.5, 12.2], [43.2, 11.5], [44.5, 10.4], [45.0, 10.45], [46.5, 10.7], [48.0, 11.1], [49.3, 11.3], [50.4, 11.6], [51.25, 11.85], [51.1, 11.0], [51.2, 10.4], [50.8, 9.3], [50.3, 8.2], [49.6, 6.8], [48, 5]],
  socotra: [[53.3, 12.6], [53.9, 12.72], [54.5, 12.55], [54.2, 12.3], [53.6, 12.35]],
  bahrain: [[50.45, 26.27], [50.65, 26.25], [50.6, 25.82], [50.5, 25.85]],
  asia: [[46, 33], [48.2, 30.0], [49.5, 30.0], [50.3, 29.3], [50.8, 28.9], [51.5, 27.9], [52.6, 27.3], [54.0, 26.7], [54.9, 26.6], [55.7, 26.9], [56.3, 27.2], [56.9, 27.0], [57.3, 25.9], [57.8, 25.6], [59.0, 25.4], [60.6, 25.3], [61.6, 25.15], [62.3, 25.1], [63.5, 25.25], [64.6, 25.2], [65.5, 25.4], [66.6, 25.4], [67.0, 24.8], [67.4, 24.0], [67.8, 23.6], [68.4, 23.5], [68.8, 23.0], [69.6, 22.9], [70.3, 22.9], [70.2, 22.6], [69.1, 22.4], [69.0, 22.2], [69.6, 21.6], [70.4, 21.0], [71.0, 20.75], [71.6, 21.0], [72.2, 21.6], [72.3, 22.3], [72.6, 22.2], [72.7, 21.5], [72.8, 21.1], [72.85, 20.4], [72.85, 19.6], [72.8, 19.0], [73.0, 18.0], [73.3, 17.0], [73.6, 16.0], [73.8, 15.4], [74.2, 14.5], [74.6, 13.6], [74.8, 12.9], [75.2, 12.0], [75.6, 11.2], [76.0, 10.4], [76.3, 9.5], [76.6, 8.6], [77, 7], [82, 7], [82, 33]],
};
// radiocarbon-dated Bronze Age sites (Harappan, Magan, Dilmun); a harbour is where each meets the sea
const SITES = [
  { name: 'Lothal', at: [72.25, 22.52], port: [72.42, 22.05] },
  { name: 'Dholavira', at: [70.21, 23.89], port: [68.75, 23.05] },
  { name: 'Balakot', at: [66.7, 25.42], port: [66.55, 25.15] },
  { name: 'Sutkagan Dor', at: [61.66, 25.51], port: [61.65, 24.98] },
  { name: 'Ras al-Jinz', at: [59.83, 22.43], port: [60.05, 22.45] },
  { name: 'Tell Abraq', at: [55.8, 25.45], port: [55.55, 25.55] },
  { name: 'Umm an-Nar', at: [54.5, 24.44], port: [54.5, 24.62] },
  { name: "Qal'at al-Bahrain", at: [50.52, 26.23], port: [50.72, 26.3] },
];
// sea roads between harbours, by way of open water (degrees), and how much each is used
const ROUTES = [
  [[[50.72, 26.3], [52.0, 26.55], [53.5, 26.15], [54.7, 25.85], [55.55, 25.55]], 2.4],
  [[[54.5, 24.62], [54.9, 25.05], [55.3, 25.4], [55.55, 25.55]], 1.6],
  [[[55.55, 25.55], [56.0, 26.15], [56.55, 26.62], [56.95, 25.95], [57.25, 25.0], [58.1, 24.3], [59.1, 23.45], [60.05, 22.6]], 3],
  [[[60.05, 22.6], [60.8, 23.6], [61.65, 24.98]], 2],
  [[[61.65, 24.98], [63.4, 24.75], [65.2, 24.85], [66.55, 25.15]], 1.8],
  [[[60.15, 22.55], [62.6, 23.5], [64.9, 24.25], [66.55, 25.15]], 2.2],
  [[[66.55, 25.15], [67.0, 24.3], [67.7, 23.3], [68.75, 23.05]], 2],
  [[[68.75, 23.05], [68.65, 22.05], [69.35, 21.2], [70.6, 20.45], [71.6, 20.55], [72.2, 21.2], [72.42, 22.05]], 1.8],
  [[[60.15, 22.3], [63.6, 21.6], [67.5, 21.0], [70.6, 20.45]], 2.6],
];
const SEAS = [['Arabian Sea', 63.5, 15.5], ['Gulf of Oman', 58.6, 24.4], ['Gulf of Aden', 47.5, 12.1]];
const SEA = hex('#0c5e66'), INK = hex('#1c1917'), WHITE = [255, 255, 255], SKY = hex('#79b0e6'), CREAM = hex('#efe3c4'), VERM = hex('#e2391d');

export function seaMap({ add, K, mask, R }) {
  const r = rng(29), labels = [];
  const at = (k, u) => k + clamp(u) * .85;    // step k's own second on the scroll's clock
  const P = ([lon, lat]) => [R.x + (lon - LON0) / (LON1 - LON0) * R.w, R.y + (LAT1 - lat) / (LAT1 - LAT0) * R.h];
  const polys = Object.values(LAND).map(p => p.map(P));
  const onLand = (x, y) => {
    let inside = false;
    for (const poly of polys) for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const inFrame = (x, y) => x > R.x && x < R.x + R.w && y > R.y && y < R.y + R.h;
  const isSea = (x, y) => inFrame(x, y) && !onLand(x, y);
  const frame = mask(2, R.x, R.y, R.x + R.w, R.y + R.h);
  const u = R.w / 900;   // the chart's own unit, so it reads the same at any width

  // ── 0. the coast as it stood: frame, sea, graticule, the inked shore, waterlines, the stretches ticked
  K.pen([[R.x, R.y], [R.x + R.w, R.y], [R.x + R.w, R.y + R.h], [R.x, R.y + R.h], [R.x, R.y - .4]], at(0, 0), { linear: true, w: 1.2, speed: (R.w + R.h) * 2 / .3 });
  K.pen([[R.x - 7, R.y - 7], [R.x + R.w + 7, R.y - 7], [R.x + R.w + 7, R.y + R.h + 7], [R.x - 7, R.y + R.h + 7], [R.x - 7, R.y - 7.4]], at(0, .05), { linear: true, w: .6, speed: (R.w + R.h) * 2 / .3 });
  for (let lon = 45; lon < LON1; lon++) { const [x] = P([lon, 0]), l = lon % 5 ? 4 : 7; for (const [y, d] of [[R.y - 7, 1], [R.y + R.h + 7, -1]]) K.pen([[x, y], [x, y + d * l]], at(0, .1), { linear: true, w: .6 }); }
  for (let lat = 9; lat < LAT1; lat++) { const [, y] = P([0, lat]), l = lat % 5 ? 4 : 7; for (const [x, d] of [[R.x - 7, 1], [R.x + R.w + 7, -1]]) K.pen([[x, y], [x + d * l, y]], at(0, .1), { linear: true, w: .6 }); }
  for (let lon = 45; lon < LON1; lon += 5) labels.push({ text: `${lon}°E`, at: [P([lon, 0])[0], R.y + R.h + 22], kind: 'deg', step: 0 });
  for (let lat = 10; lat < LAT1; lat += 5) labels.push({ text: `${lat}°N`, at: [R.x - 14, P([0, lat])[1]], kind: 'deg l', step: 0 });
  for (let y = R.y + 1.5, i = 0; y < R.y + R.h; y += 3, i++) {
    const xs = [];
    for (const poly of polys) for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
      const [x1, y1] = poly[a], [x2, y2] = poly[b];
      if ((y1 > y) !== (y2 > y)) xs.push(x1 + (y - y1) * (x2 - x1) / (y2 - y1));
    }
    xs.sort((p, q) => p - q);
    const spans = []; let x = R.x - 4, land = false;
    for (const c of xs) { if (!land) spans.push([x, c]); x = c; land = !land; }
    if (!land) spans.push([x, R.x + R.w + 4]);
    for (const [a, b] of spans) {
      const lo = Math.max(a, R.x - 4), hi = Math.min(b, R.x + R.w + 4);
      if (hi - lo > 2.4) K.fill([[lo + 1.6, y], [hi - 1.6, y]], 3.9, SEA, at(0, .08 + i / (R.h / 3) * .35), { outline: false, profile: PROFILE.flat, speed: Math.max(4000, (hi - lo) * 14), ease: 0, mask: frame });
    }
  }
  for (let lon = 45; lon < LON1; lon += 5) { const [x] = P([lon, 0]); K.pen([[x, R.y], [x, R.y + R.h]], at(0, .45), { linear: true, w: .6, color: SKY, speed: R.h / .25 }); }
  for (let lat = 10; lat < LAT1; lat += 5) { const [, y] = P([0, lat]); K.pen([[R.x, y], [R.x + R.w, y]], at(0, .47), { linear: true, w: .6, color: SKY, speed: R.w / .25 }); }
  const coasts = polys.map(poly => spline([...poly, poly[0]], 3));
  const sideOf = (c, k) => (isSea(c.x[k] + c.nx[k] * 4, c.y[k] + c.ny[k] * 4) ? 1 : isSea(c.x[k] - c.nx[k] * 4, c.y[k] - c.ny[k] * 4) ? -1 : 0);
  coasts.forEach(c => {
    K.pen(Array.from(c.x, (x, k) => [x, c.y[k]]), at(0, .3), { w: 1.3, speed: c.L / .45, mask: frame });
    [5, 10, 16, 24].forEach((d, j) => {
      let run = [];
      const flush = () => { if (run.length > 6) add({ pts: run, pen: true, w: .8, color: WHITE, alpha: .75 - j * .15, speed: 2400, minDur: .1, start: at(0, .55 + j * .06), mask: frame }); run = []; };
      for (let k = 0; k < c.n; k += 2) {
        const sd = sideOf(c, k), x = c.x[k] + c.nx[k] * d * u * sd, y = c.y[k] + c.ny[k] * d * u * sd;
        if (sd && isSea(x, y)) run.push([x, y]); else flush();
      }
      flush();
    });
  });
  SEAS.forEach(([name, lon, lat]) => labels.push({ text: name, at: P([lon, lat]), kind: 'sea', step: 0 }));
  labels.push({ text: 'Arabia', at: P([52.5, 20.5]), kind: 'land', step: 0 }, { text: 'Makran', at: P([62.5, 26.6]), kind: 'land', step: 0 }, { text: 'Gujarat', at: P([71.4, 23.6]), kind: 'land', step: 0 }, { text: 'Socotra', at: P([54, 13.25]), kind: 'land sm', step: 0 });

  // ── 1. the weather: both monsoons as streamlines, and drift, month by month, from every stretch of coast
  const wind = (x, y, summer) => {
    const lat = LAT1 - (y - R.y) / R.h * (LAT1 - LAT0), n = (noise1(x * .006 / u + y * .004 / u, summer ? 3 : 9) - .5) * .9;
    return summer ? -0.62 - (lat - 14) * .022 + n : Math.PI - 0.55 + (lat - 18) * .015 + n;
  };
  for (const summer of [true, false]) {
    const gs = (summer ? 92 : 118) * u;
    for (let gx = R.x + gs * .5; gx < R.x + R.w; gx += gs) for (let gy = R.y + gs * .5; gy < R.y + R.h; gy += gs) {
      let x = gx + r.range(-gs * .4, gs * .4), y = gy + r.range(-gs * .4, gs * .4);
      if (!isSea(x, y)) continue;
      const pts = [[x, y]];
      for (let i = 0; i < 18; i++) { const a = wind(x, y, summer); x += Math.cos(a) * 8 * u; y += Math.sin(a) * 8 * u; if (!isSea(x, y)) break; pts.push([x, y]); }
      if (pts.length < 8) continue;
      add({ pts, w: summer ? 1.3 : 1.1, bristles: 2, color: summer ? WHITE : SKY, alpha: summer ? .62 : .75, dry: 0, ink: 99, profile: PROFILE.taper, speed: 600, ease: .2, start: at(1, (summer ? 0 : .3) + r() * .25), mask: frame, blend: 'source-over' });
    }
  }
  // drift: a float let go from each stretch in each month, carried by that month's sea; the tracks are the
  // model's raw material, and the density of them along the coast is what gets scored
  const month = m => .5 - .5 * Math.cos(TAU * (m - .5) / 12);   // 0 in January, 1 in July
  const drift = (x, y, m, steps = 46) => {
    const s = month(m), pts = [[x, y]];
    for (let i = 0; i < steps; i++) {
      const a = lerp(Math.PI - .5, -.7, s) + (noise1(i * .08 + m * 3.1 + x * .01, 5) - .5) * 1.4 + Math.sin(i * .17 + m * 1.7) * .5;
      x += Math.cos(a) * 6 * u; y += Math.sin(a) * 6 * u;
      if (!isSea(x, y)) { pts.push([x, y]); break; }
      pts.push([x, y]);
    }
    return pts;
  };
  const G = 14 * u, gw = Math.ceil(R.w / G) + 1, gh = Math.ceil(R.h / G) + 1, dens = new Float32Array(gw * gh);
  const seeds = [];
  coasts.forEach(c => { for (let k = 0; k < c.n; k += 9) { const sd = sideOf(c, k); if (sd && inFrame(c.x[k], c.y[k])) seeds.push([c.x[k] + c.nx[k] * sd * 6 * u, c.y[k] + c.ny[k] * sd * 6 * u]); } });
  for (const [sx, sy] of seeds) for (let m = 0; m < 12; m += 1) for (const [x, y] of drift(sx, sy, m, 40)) {
    const gx = Math.floor((x - R.x) / G), gy = Math.floor((y - R.y) / G);
    if (gx >= 0 && gy >= 0 && gx < gw && gy < gh) dens[gy * gw + gx]++;
  }
  // the fan we draw: from every fourth seed, in four months, thin, in the chart's own whites and blues
  seeds.forEach(([sx, sy], i) => {
    if (i % 9) return;
    [0, 6].forEach((m, j) => {
      const pts = drift(sx, sy, m + (i % 3));
      if (pts.length < 6) return;
      const col = [SKY, CREAM][j];
      add({ pts, w: 1.4, bristles: 2, color: col, alpha: .6, dry: 0, ink: 99, profile: u2 => .4 + .6 * (1 - u2), speed: 700, ease: .2, start: at(1, .45 + (i / seeds.length) * .4), mask: frame, blend: 'source-over' });
    });
  });

  // ── 2. every stretch scored by the drift that passes it: a bar out to sea, saffron to vermilion
  const scoreAt = (x, y) => {
    let v = 0;
    const gx = Math.floor((x - R.x) / G), gy = Math.floor((y - R.y) / G);
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const X = gx + a, Y = gy + b; if (X >= 0 && Y >= 0 && X < gw && Y < gh) v += dens[Y * gw + X]; }
    return v;
  };
  const segs = [];
  coasts.forEach(c => { for (let k = 0; k < c.n; k += 4) { const sd = sideOf(c, k); if (sd && inFrame(c.x[k], c.y[k])) segs.push({ x: c.x[k], y: c.y[k], nx: c.nx[k] * sd, ny: c.ny[k] * sd, s: scoreAt(c.x[k], c.y[k]) }); } });
  const sorted = segs.map(s => s.s).sort((a, b) => a - b), q = v => sorted.findIndex(x => x >= v) / sorted.length;
  segs.forEach(sg => { sg.q = q(sg.s); });
  segs.forEach(({ x, y, nx, ny, q: s }) => {
    const t = at(2, (x - R.x) / R.w * .8);
    if (s < .45) { K.pen([[x - nx * 2, y - ny * 2], [x + nx * 3, y + ny * 3]], t, { linear: true, w: .7, speed: 200 }); return; }
    const l = (3 + (s - .45) / .55 * 28) * u;
    K.pen([[x + nx * 2, y + ny * 2], [x + nx * l, y + ny * l]], t, { linear: true, w: 2.4, color: [Math.round(lerp(244, 226, s)), Math.round(lerp(180, 57, s)), Math.round(lerp(0, 29, s))], speed: 300, mask: frame });
  });

  // ── 3. the sites already dug, and the sea roads between them, in leaf gold; a dotted line inland
  ROUTES.forEach(([way, w], i) => {
    const pts = way.map(P), sp = spline(pts, 3), out = Array.from(sp.x, (x, k) => [x, sp.y[k]]);
    let wet = 0; out.forEach(([x, y]) => { if (isSea(x, y)) wet++; });
    if (wet < out.length * .9) console.warn('route crosses land', i, (1 - wet / out.length).toFixed(2));
    add({ pts, wash: true, w: w * 1.5 * u + 1.2, color: INK, gold: true, alpha: 1, rim: 0, profile: PROFILE.flat, speed: 1800, ease: .3, start: at(3, .25 + i * .05), mask: frame });
  });
  SITES.forEach(({ name, at: a, port }, i) => {
    const [x, y] = P(a), [hx, hy] = P(port), t = at(3, i * .05);
    if (Math.hypot(x - hx, y - hy) > 6) for (let j = 0; j < 4; j++) { const f0 = j / 4 + .04, f1 = f0 + .12; K.pen([[lerp(x, hx, f0), lerp(y, hy, f0)], [lerp(x, hx, f1), lerp(y, hy, f1)]], t + .1, { linear: true, w: 1, speed: 200 }); }
    K.disc(x, y, 6.5 * u + 1, WHITE, t, { outline: false });
    K.disc(x, y, 4.2 * u + .8, VERM, t + .03, { outline: false });
    labels.push({ text: name, at: [x, y], kind: 'site' + ([1, 2, 3, 6].includes(i) ? ' up' : ''), step: 3 });
  });

  // ── 4. the prediction: the best-scored stretches with no site near them, ringed in gold
  const sites = SITES.map(s => P(s.at));
  const cands = segs.filter(sg => sg.q > .8 && sites.every(([x, y]) => Math.hypot(sg.x - x, sg.y - y) > 70 * u)).sort((a, b) => b.s - a.s), picks = [];
  for (const c of cands) { if (picks.every(p2 => Math.hypot(p2.x - c.x, p2.y - c.y) > 80 * u)) picks.push(c); if (picks.length === 6) break; }
  picks.forEach(({ x, y, nx, ny }, i) => {
    const cx = x + nx * 14 * u, cy = y + ny * 14 * u, t = at(4, .1 + i * .1);
    add({ pts: K.ring(cx, cy, 15 * u + 3, 48), pen: true, w: 3.2, color: INK, gold: true, alpha: 1, speed: 400, minDur: .15, start: t, blend: 'source-over' });
    add({ pts: K.ring(cx, cy, 21 * u + 4, 48), pen: true, w: 1, color: INK, gold: true, alpha: 1, speed: 500, minDur: .15, start: t + .08, blend: 'source-over' });
    K.disc(cx, cy, 3, CREAM, t + .12, { outline: false });
  });

  // ── 5. the test: the dated events it was checked against, 42 of them, scattered about the known sites
  for (let i = 0; i < 42; i++) {
    const [sx, sy] = sites[i % sites.length], a = r() * TAU, d = r.range(6, 22) * u;
    if (!onLand(sx + Math.cos(a) * d, sy + Math.sin(a) * d) && !isSea(sx + Math.cos(a) * d, sy + Math.sin(a) * d)) continue;
    K.disc(sx + Math.cos(a) * d, sy + Math.sin(a) * d, 1.8, VERM, at(5, i / 42 * .7), { outline: false });
  }

  return { labels, steps: STEPS };
}
