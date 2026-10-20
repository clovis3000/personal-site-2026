// Ornament in body colour for the bristle timeline. Illumination and block-printing are both opaque paint
// laid flat, so a shape here is the wash brush's envelope painted source-over (later covers earlier, a
// colour never muddies another), then its contour in ink, then white tracery on top, as the illuminators did.
// kit(add, r) takes the plate's own stroke factory so seeds, timing and the stroke list stay the plate's.
import { PROFILE } from './brush.js';
import { clamp, lerp, TAU } from './util.js';

export const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
export const shade = (c, k) => c.map(v => Math.round(clamp(v * k, 0, 255)));
export const mix = (a, b, k) => a.map((v, i) => Math.round(lerp(v, b[i], k)));
const INK = hex('#1c1917'), WHITE = [255, 255, 255];
const OVER = { blend: 'source-over' };

export function kit(add, r, { ink = INK, line = .85 } = {}) {
  // the outline of a wash stroke: down one side of its envelope, round the tip, back up the other
  const contour = (s, start, color = ink, w = line) => {
    const { x, y, nx, ny, n } = s.path, L = [], R = [], step = Math.max(1, Math.floor(n / 48));
    for (let k = 0; ; k = Math.min(n - 1, k + step)) {
      const hw = s.w * .5 * Math.max(.04, s.profile(k / Math.max(1, n - 1)));
      L.push([x[k] + nx[k] * hw, y[k] + ny[k] * hw]); R.push([x[k] - nx[k] * hw, y[k] - ny[k] * hw]);
      if (k === n - 1) break;
    }
    const pts = [...L, ...R.reverse(), L[0]];
    let per = 0; for (let i = 1; i < pts.length; i++) per += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return add({ pts, linear: true, pen: true, w, color, alpha: 1, speed: Math.max(500, per / Math.max(.12, s.dur * 1.1)), minDur: .05, ease: .2, start, ...OVER });
  };

  // a flat shape along pts, w wide at its widest
  const fill = (pts, w, color, start, o = {}) => {
    const { outline = true, ink: oc = ink, ...rest } = o;
    const s = add({ pts, wash: true, w, color, alpha: 1, rim: 0, profile: PROFILE.leaf, speed: 320, minDur: .08, ease: .4, start, ...OVER, ...rest });
    if (outline && line > 0) contour(s, start + s.dur * .35, oc);
    return s;
  };

  const ring = (x, y, rr, m = 40) => Array.from({ length: m + 1 }, (_, i) => [x + Math.cos(i / m * TAU) * rr, y + Math.sin(i / m * TAU) * rr]);
  const disc = (x, y, rr, color, start, o = {}) => {
    const { outline = true, ink: oc = ink, ...rest } = o;
    const s = add({ pts: [[x - .3, y], [x + .3, y]], wash: true, w: rr * 2, color, alpha: 1, rim: 0, profile: PROFILE.flat, minDur: .06, start, ...OVER, ...rest });
    if (outline && line > 0) add({ pts: ring(x, y, rr), pen: true, w: line, color: oc, alpha: 1, speed: Math.max(400, rr * 20), minDur: .06, ease: .2, start: start + .03, ...OVER });
    return s;
  };

  // a pen line: hairline by default, in ink, over the paint
  const pen = (pts, start, o = {}) => add({ pts, pen: true, w: line, color: ink, alpha: 1, speed: 900, minDur: .05, ease: .3, start, ...OVER, ...o });
  const tracery = (pts, start, o = {}) => pen(pts, start, { color: WHITE, w: 1.1, alpha: .95, profile: PROFILE.hair, ...o });

  // a simple pointed leaf from p along unit dir, bent to one side
  const leaf = (p, dir, len, wid, color, start, o = {}) => {
    const { bend = .12, vein, ...rest } = o, nx = -dir[1], ny = dir[0];
    const pts = [p, [p[0] + dir[0] * len * .5 + nx * len * bend, p[1] + dir[1] * len * .5 + ny * len * bend], [p[0] + dir[0] * len, p[1] + dir[1] * len]];
    const s = fill(pts, wid, color, start, rest);
    if (vein) pen([pts[0], [lerp(pts[0][0], pts[1][0], 1.05), lerp(pts[0][1], pts[1][1], 1.05)], [lerp(pts[1][0], pts[2][0], .6), lerp(pts[1][1], pts[2][1], .6)]], start + s.dur * .6, { color: vein, w: .9 });
    return s;
  };

  // An acanthus leaf, the illuminators' and Morris's both: a spine that runs out and curls hard at its tip,
  // lobes of three fingers on its outer (convex) back and smaller pairs inside, and a turnover: the last
  // stretch flips to show its underside in a second colour. cs = +1 curls clockwise. pal = { body, turn }.
  const acanthus = (bx, by, th0, L, cs, wd, pal, t0, dur = 1, o = {}) => {
    const { lobes = 5, curl = 3.6, uT = .64, white = true } = o;
    const m = 36, P = [], Tn = [];
    let x = bx, y = by;
    for (let i = 0; i <= m; i++) {
      const u = i / m, th = th0 + curl * cs * u ** 3;
      P.push([x, y]); Tn.push([Math.cos(th), Math.sin(th)]);
      x += Math.cos(th) * L / m; y += Math.sin(th) * L / m;
    }
    const env = u => clamp(u / .06) ** .5 * (1 - u) ** .7;
    const at = u => { const f = u * m, i = Math.min(m - 1, Math.floor(f)), k = f - i; return [lerp(P[i][0], P[i + 1][0], k), lerp(P[i][1], P[i + 1][1], k)]; };
    const tan = u => Tn[Math.min(m, Math.round(u * m))];
    const col = u => (u < uT ? pal.body : pal.turn);
    const when = u => t0 + dur * u;
    const iT = Math.round(uT * m);
    // the body, in two halves so the turnover is its own colour
    fill(P.slice(0, iT + 1), wd * .62, pal.body, t0, { profile: u => env(u * uT), speed: L * uT / (dur * uT), ease: 0 });
    fill(P.slice(iT), wd * .62, pal.turn, when(uT), { profile: u => env(lerp(uT, 1, u)), speed: L * (1 - uT) / (dur * (1 - uT)), ease: 0 });
    // lobes, base to tip: fingers leave the spine swept forward toward the tip, overlapping like scales,
    // each bending forward again at its end; the back ones first, so each lobe lies over the one behind it
    const light = u => mix(col(u), WHITE, .42);
    const fingers = (u, side, scale, n) => {
      const p = at(u), t = tan(u), no = [cs * t[1] * side, -cs * t[0] * side], len = wd * env(u) * scale * r.range(.9, 1.1);
      if (len < 4) return;
      const spread = n === 3 ? [-.34, 0, .34] : [-.2, .2], ls = n === 3 ? [.7, 1, .82] : [1, .85];
      spread.forEach((da, j) => {
        const a = .78 + da, d = [Math.cos(a) * t[0] + Math.sin(a) * no[0], Math.cos(a) * t[1] + Math.sin(a) * no[1]];
        const q = [p[0] + no[0] * wd * env(u) * .12, p[1] + no[1] * wd * env(u) * .12], l = len * ls[j];
        const mid = [q[0] + d[0] * l * .55, q[1] + d[1] * l * .55];
        const tip = [mid[0] + (d[0] * .45 + t[0] * .35) * l, mid[1] + (d[1] * .45 + t[1] * .35) * l];
        const s = fill([q, mid, tip], l * .6, col(u), when(u) + .04 + j * .03, { speed: 260 });
        if (j === Math.floor(n / 2) && l > 14) {
          fill([q, mid, [lerp(mid[0], tip[0], .4), lerp(mid[1], tip[1], .4)]], l * .24, light(u), s.start + .06, { outline: false, speed: 260 });
          if (white) tracery([[lerp(q[0], mid[0], .5), lerp(q[1], mid[1], .5)], mid, [lerp(mid[0], tip[0], .55), lerp(mid[1], tip[1], .55)]], s.end + .05, { w: .9 });
        }
      });
    };
    for (let i = lobes - 2; i >= 0; i--) fingers(.2 + .62 * (i + .6) / lobes, -1, .7, 2);
    for (let i = 0; i < lobes; i++) fingers(.12 + .7 * (i + .35) / lobes, 1, 1.25, 3);
    // the body's own light: a narrower band of the lighter tone down its middle
    fill(P.slice(0, iT + 1), wd * .26, light(0), t0 + .08, { profile: u => env(u * uT), speed: L * uT / (dur * uT), ease: 0, outline: false });
    // the rib, dark, and a line of white light along the back
    pen(P.slice(1, Math.round(m * .9)), when(.15), { color: shade(pal.body, .45), w: 1.2, speed: L / dur * 1.2 });
    if (white) {
      const back = P.slice(2, Math.round(m * .82)).map(([px, py], i) => { const t = Tn[i + 2], u = (i + 2) / m, h = wd * env(u) * .17; return [px + cs * t[1] * h, py - cs * t[0] * h]; });
      tracery(back, when(.3), { speed: L / dur * 1.1 });
    }
    return { P, at, tan, end: when(1) + .3 };
  };

  // A broad nib on the bristle timeline: the nib is a segment w long at angle deg, and what it sweeps is
  // exactly the union of hairlines run along the path, each translated to its own point on the nib. Corners
  // stay sharp (polylines), and the thick and thin fall out of direction as they do with a real pen.
  const nib = (pts, w, deg, color, start, o = {}) => {
    const a = deg * Math.PI / 180, ex = Math.cos(a), ey = -Math.sin(a), n = Math.max(3, Math.ceil(w / 1.2)), lw = w / n * 1.7;
    let first;
    for (let i = 0; i < n; i++) {
      const f = (i + .5) / n - .5, dx = ex * w * f, dy = ey * w * f;
      const s = add({ pts: pts.map(([x, y]) => [x + dx, y + dy]), pen: true, linear: true, w: lw, color, alpha: 1, speed: 420, minDur: .04, ease: .4, start, ...OVER, ...o });
      first = first || s;
    }
    return first;
  };

  // a flat rectangle, wiped top to bottom in hairline-thin bands (a wash ends round; bands this thin don't show it)
  const rect = (x, y, w, h, color, start, dur = .4, o = {}) => {
    const { outline = true, ...rest } = o, n = Math.max(1, Math.ceil(h / 4));
    for (let i = 0; i < n; i++) { const yy = y + 2 + (h - 4) * (i + .5) / n; fill([[x + 2.4, yy], [x + w - 2.4, yy]], 5.4, color, start + dur * i / n, { profile: PROFILE.flat, outline: false, speed: Math.max(400, w * 6), ease: 0, ...rest }); }
    if (outline && line > 0) pen([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y - .4]], start + dur * .6, { linear: true, speed: (w + h) * 2 / .5 });
  };

  return { contour, fill, disc, ring, pen, tracery, leaf, acanthus, nib, rect };
}
