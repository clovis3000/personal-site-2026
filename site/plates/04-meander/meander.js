// A meandering river, after the bank-erosion models (Ikeda–Parker–Sawai, Howard–Knutson): each point of
// the centreline migrates toward its outer bank at a rate set by curvature *upstream* of it, so bends grow
// and skew downstream. When two stretches of channel touch, the loop between them is cut off and left
// behind as an oxbow lake. Deterministic for a seed.
import { rng, clamp } from '../../shared/util.js';

export function simulate(seed, o = {}) {
  const P = { x0: 700, y0: 30, y1: 970, xmin: 320, xmax: 1080, b: 11, ds: 5, E: 8, sigma: 6, lag: 4, smooth: .06, amp: 12, spin: 1400, steps: 2200, every: 240, ...o };
  const r = rng(seed);
  let pts = [];
  const ph1 = r() * 6.28, ph2 = r() * 6.28;
  for (let y = P.y0; y <= P.y1; y += P.ds) pts.push([P.x0 + r.gauss() * 1.5 + Math.sin(y / 60 + ph1) * P.amp + Math.sin(y / 23 + ph2) * P.amp * .3, y]);

  const courses = [], oxbows = [];
  const step = (i, record) => {
    const n = pts.length, T = [], C = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      T.push([dx / l, dy / l]);
    }
    for (let k = 1; k < n - 1; k++) {
      const [ax, ay] = T[k - 1], [bx, by] = T[k + 1];
      C[k] = (ax * by - ay * bx) / (2 * P.ds);
    }
    // near-bank velocity: curvature smoothed over a few channel widths and read from upstream, so the
    // instability picks out a meander wavelength and erosion peaks just downstream of each apex
    const Cs = new Float32Array(n), R = Math.ceil(P.sigma * 3);
    for (let k = 0; k < n; k++) {
      let s = 0, w = 0;
      for (let j = -R; j <= R; j++) { const q = k + j; if (q < 0 || q >= n) continue; const g = Math.exp(-(j * j) / (2 * P.sigma * P.sigma)); s += C[q] * g; w += g; }
      Cs[k] = s / w;
    }
    for (let k = 1; k < n - 1; k++) {
      const ub = Cs[Math.max(0, k - P.lag)];
      const pin = clamp(k / 12) * clamp((n - 1 - k) / 12);
      const m = -P.E * ub * pin, nx = -T[k][1], ny = T[k][0];
      pts[k][0] += nx * m; pts[k][1] += ny * m;
      // the valley walls
      if (pts[k][0] < P.xmin) pts[k][0] += (P.xmin - pts[k][0]) * .2;
      if (pts[k][0] > P.xmax) pts[k][0] += (P.xmax - pts[k][0]) * .2;
      if (pts[k][1] > P.y1 - 10) pts[k][1] += (P.y1 - 10 - pts[k][1]) * .3;
      if (pts[k][1] < P.y0 + 10) pts[k][1] += (P.y0 + 10 - pts[k][1]) * .3;
    }
    // smooth a touch, then resample to even spacing
    const sm = pts.map((p, k) => (k === 0 || k === n - 1) ? p : [p[0] + P.smooth * (pts[k - 1][0] + pts[k + 1][0] - 2 * p[0]), p[1] + P.smooth * (pts[k - 1][1] + pts[k + 1][1] - 2 * p[1])]);
    const out = [sm[0]]; let acc = 0, want = P.ds;
    for (let k = 1; k < sm.length; k++) {
      const [ax, ay] = sm[k - 1], [bx, by] = sm[k], d = Math.hypot(bx - ax, by - ay);
      while (acc + d >= want && d > 0) { const u = (want - acc) / d; out.push([ax + (bx - ax) * u, ay + (by - ay) * u]); want += P.ds; }
      acc += d;
    }
    out[out.length - 1] = sm[sm.length - 1].slice();
    pts = out;
    // cutoffs: neck closes when two far-apart stretches come within a channel width
    if (i % 3 === 0) {
      const N = pts.length, cell = P.b * 1.3, grid = new Map(), key = (x, y) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
      pts.forEach((p, k) => { const kk = key(p[0], p[1]); (grid.get(kk) || grid.set(kk, []).get(kk)).push(k); });
      outer: for (let k = 0; k < N; k++) {
        const [x, y] = pts[k], cx = Math.floor(x / cell), cy = Math.floor(y / cell);
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of grid.get(`${cx + a},${cy + b}`) || []) {
          if (j > k + 30 && Math.hypot(pts[j][0] - x, pts[j][1] - y) < P.b * 1.15) {
            if (record) oxbows.push({ pts: pts.slice(k, j + 1).map(p => p.slice()), at: i });
            pts = pts.slice(0, k + 1).concat(pts.slice(j));
            break outer;
          }
        }
      }
    }
  };
  for (let i = 0; i < P.spin; i++) step(i, false);
  for (let i = 0; i <= P.steps; i++) {
    step(i, true);
    if (i % P.every === 0) courses.push({ pts: pts.map(p => p.slice()), at: i });
  }
  return { courses, oxbows, final: pts, P };
}
