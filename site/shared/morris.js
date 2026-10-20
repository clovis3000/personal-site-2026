// Morris's turnover repeat on an ogee lattice, grown up the page, as a plate's ground: two families of
// sinuous stems that kiss, in every lens a stalk, two pairs of acanthus and a flower, a bud under each kiss,
// and every gap left filled last with hairline sprays and gold. Plates 10 and 13 grow it.
//   morris(add, r, { W, H, reserve, clip, gold }) -> { guides, cells, h, TH, ... }
//   add: the plate's stroke factory. reserve: [[x0, y0, x1, y1]] rects to leave alone (no cells there, no
//   sprays); clip: flag every stroke to be kept out of Bristles.clip; gold: clasps in gold leaf; cellMargin:
//   how far round a reserve a flower's centre must be to be grown.
import { PROFILE } from './brush.js';
import { kit, hex } from './ornament.js';
import { lerp, clamp, noise1, TAU } from './util.js';

export const C = {
  ink: hex('#1c1917'), ultra: hex('#2340b8'), verm: hex('#e2391d'), emer: hex('#0e8a5a'), forest: hex('#0d5a3f'),
  leaf: hex('#7dbb36'), saffron: hex('#f4b400'), rose: hex('#e0457b'), madder: hex('#a8173f'), sky: hex('#79b0e6'),
  white: [255, 255, 255], teal: hex('#109a9c'), violet: hex('#5b3aa8'),
};
export const PALS = [
  { body: C.ultra, turn: C.verm }, { body: C.rose, turn: C.saffron }, { body: C.emer, turn: C.ultra },
  { body: C.verm, turn: C.teal }, { body: C.violet, turn: C.leaf },
];

export function morris(add0, r, { W, H, reserve = [], clip = false, gold = false, grow: growO, cellMargin = 60, sprays: withSprays = true } = {}) {
  const inR = (x, y, m = 0) => reserve.some(([a, b, c, d]) => x > a - m && x < c + m && y > b - m && y < d + m);
  const add = opt => { const s = add0(clip ? { ...opt, clip: true } : opt); occupy(s); return s; };
  const K = kit(add, r), { fill, disc, pen, tracery, leaf, acanthus } = K;
  const guides = [];
  const guide = (pts, start, o2 = {}) => { guides.push({ pts, ...o2 }); return add({ pts, pen: true, w: .6, color: C.sky, alpha: .6, speed: 2400, minDur: .1, ease: .3, start, ...o2 }); };

  // occupancy, so the hairline sprays can find the gaps last
  const G = 10, gw = Math.ceil(W / G) + 2, gh = Math.ceil(H / G) + 2, occ = new Uint8Array(gw * gh);
  function occupy(s) {
    if (s.pen && s.w < .7) return;   // guides only
    const { x, y, n } = s.path;
    for (let k = 0; k < n; k += 3) {
      const hw = (s.wash ? s.w * .5 * Math.max(.04, s.profile(k / Math.max(1, n - 1))) : s.w * .5) + 3;
      const g0 = Math.floor((x[k] - hw) / G), g1 = Math.floor((x[k] + hw) / G), h0 = Math.floor((y[k] - hw) / G), h1 = Math.floor((y[k] + hw) / G);
      for (let gx = Math.max(0, g0); gx <= Math.min(gw - 1, g1); gx++) for (let gy = Math.max(0, h0); gy <= Math.min(gh - 1, h1); gy++) occ[gy * gw + gx] = 1;
    }
  }
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) if (inR((gx + .5) * G, (gy + .5) * G, 4)) occ[gy * gw + gx] = 1;
  const free = (px, py, c = 1) => {
    const gx = Math.floor(px / G), gy = Math.floor(py / G);
    for (let a = -c; a <= c; a++) for (let b = -c; b <= c; b++) { const X = gx + a, Y = gy + b; if (X < 0 || Y < 0 || X >= gw || Y >= gh || occ[Y * gw + X]) return false; }
    return true;
  };

  // ── the lattice: line k is x = k·h ± a·sin(2π(y - y0)/TH), alternating sign, a = h/2, so neighbours kiss
  const h = 200, TH = 560, a = h / 2, y0 = -40 + r.range(-30, 30);
  const sg = k => (((k % 2) + 2) % 2 ? -1 : 1);
  const LX = (k, y) => k * h + a * sg(k) * Math.sin(TAU * (y - y0) / TH);
  const grow = growO || ((x, y) => .9 + clamp((H + 60 - y) / (H + 160)) * 4.4 + (noise1(x * .003, 7) - .5) * .5);
  const k0 = -1, k1 = Math.ceil(W / h) + 1;

  // 0. the construction, hairline: the lattice, then the lens axes and the compass circles of the flowers
  for (let k = k0; k <= k1; k++) {
    const pts = []; for (let y = H + 20; y >= -20; y -= 14) pts.push([LX(k, y), y]);
    guide(pts, .05 + (k - k0) * .035);
  }
  const cells = [];
  for (let k = k0; k < k1; k++) {
    // the lens between k and k+1 is widest where sg(k)·sin = -1; the kisses are on its axis, TH/2 above and below
    const ph = sg(k) > 0 ? .75 : .25, mx = k * h + h / 2;
    for (let n = -1; n < 4; n++) {
      const cy = y0 + (ph + n) * TH;
      if (cy < -TH * .45 || cy > H + TH * .45) continue;
      if (inR(mx, cy - .05 * TH, cellMargin)) continue;   // negative: keep cells that only reach under a clipped reserve
      cells.push({ k, mx, cy, type: ((k + n) % 2 + 2) % 2 });
    }
  }
  for (const c of cells) {
    guide([[c.mx, c.cy + TH / 2], [c.mx, c.cy - TH / 2]], .4 + (c.k - k0) * .03, { alpha: .45 });
    const R = 74, cy = c.cy - .05 * TH, ring = []; for (let i = 0; i <= 48; i++) ring.push([c.mx + Math.cos(i / 48 * TAU) * R, cy + Math.sin(i / 48 * TAU) * R]);
    guide(ring, .55 + (c.k - k0) * .03, { alpha: .45 });
  }

  // 1. stems: each lattice line in pieces between kisses, painted bottom to top with the wave
  for (let k = k0; k <= k1; k++) {
    const first = y0 + TH / 4;
    for (let n = -2; n < 6; n++) {
      const ya = first + n * TH / 2, yb = ya + TH / 2;
      if (yb < -40 || ya > H + 40) continue;
      const pts = []; for (let y = yb; y >= ya - .1; y -= 12) pts.push([LX(k, y), y]);
      const t0 = grow(LX(k, yb), yb), t1 = grow(LX(k, ya), ya);
      let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      add({ pts, w: 8, bristles: 9, color: C.forest, alpha: .95, dry: .1, ink: 5, grain: .3, profile: PROFILE.flat, speed: len / Math.max(.3, t1 - t0), ease: 0, wobble: .04, start: t0 });
      // small leaves, alternate sides, not near the kisses
      let side = r.sign();
      for (let j = 2; j < pts.length - 3; j += 3) {
        const [px, py] = pts[j], [qx, qy] = pts[j + 1], tl = Math.hypot(qx - px, qy - py) || 1, t = [(qx - px) / tl, (qy - py) / tl];
        const ang = .95 * side, d = [Math.cos(ang) * t[0] - Math.sin(ang) * t[1], Math.sin(ang) * t[0] + Math.cos(ang) * t[1]];
        const len2 = r.range(30, 42), tt = grow(px, py) + .08;
        leaf([px, py], d, len2, len2 * .42, side > 0 ? C.leaf : C.emer, tt, { bend: .1 * side, vein: C.forest });
        side = -side;
      }
    }
    // a clasp at every kiss with the next line: four saffron petals and a vermilion boss
    for (let n = -2; n < 6; n++) {
      const yk = y0 + (sg(k) > 0 ? .25 : .75) * TH + n * TH, xk = LX(k, yk);
      if (yk < -30 || yk > H + 30) continue;
      const tt = grow(xk, yk) + .15;
      for (let i = 0; i < 4; i++) { const an = TAU * (i + .5) / 4; leaf([xk, yk], [Math.cos(an), Math.sin(an)], 22, 15, C.saffron, tt + i * .03, { bend: 0, gold }); }
      disc(xk, yk, 7, C.verm, tt + .15);
      disc(xk - 2, yk - 2, 1.6, C.white, tt + .3, { outline: false });
    }
  }

  // 2. in every lens: a stalk, two pairs of acanthus, a flower, and a bud hung from the kiss above
  for (const c of cells) {
    const { mx, cy } = c, base = cy + TH / 2, fy = cy - .05 * TH, R = 74;
    const ts = grow(mx, base);
    const pts = []; for (let i = 0; i <= 10; i++) { const v = i / 10; pts.push([mx + Math.sin(v * Math.PI) * 6, lerp(base, fy + R * .6, v)]); }
    add({ pts, w: 9, bristles: 10, color: C.forest, alpha: .95, dry: .08, ink: 6, grain: .3, profile: PROFILE.blunt, speed: (base - fy) / Math.max(.4, grow(mx, fy) - ts), ease: 0, start: ts });
    const p1 = PALS[(c.k * 3 + Math.round(cy / TH) * 2 + 7) % PALS.length], p2 = PALS[(c.k * 3 + Math.round(cy / TH) * 2 + 9) % PALS.length];
    for (const s of [-1, 1]) {
      const yb = cy + .3 * TH, tb = grow(mx, yb) + .1;
      acanthus(mx + s * 3, yb, -Math.PI / 2 + s * .55, 250, s, 64, p1, tb, 1.2);
      const yu = cy + .14 * TH, tu = grow(mx, yu) + .25;
      acanthus(mx + s * 3, yu, -Math.PI / 2 + s * 1.0, 150, s, 42, p2, tu, .95, { lobes: 4 });
    }
    const tf = grow(mx, fy) + .35;
    if (c.type === 0) rosette(mx, fy, R, tf); else pomegranate(mx, fy, R, tf);
    // the bud below the kiss above
    const ky = cy - TH / 2, tk = grow(mx, ky) + .3;
    fill([[mx, ky + 8], [mx, ky + 34], [mx, ky + 58]], 30, C.rose, tk, { profile: PROFILE.petal, speed: 200 });
    for (const s of [-1, 1]) leaf([mx, ky + 10], [s * .55, .83], 34, 13, C.emer, tk + .1, { bend: -.15 * s });
    tracery([[mx - 4, ky + 26], [mx - 5, ky + 40], [mx - 3, ky + 50]], tk + .4, { w: .9 });
  }

  function rosette(x, y, R, t0) {
    const n = 9, b0 = r() * TAU;
    for (let i = 0; i < n; i++) {
      const an = b0 + i / n * TAU, d = [Math.cos(an), Math.sin(an)];
      fill([[x + d[0] * R * .25, y + d[1] * R * .25], [x + d[0] * R * .66, y + d[1] * R * .66], [x + d[0] * R, y + d[1] * R]], R * .62, C.verm, t0 + i * .035, { profile: PROFILE.petal, speed: 260 });
    }
    for (let i = 0; i < n; i++) {
      const an = b0 + (i + .5) / n * TAU, d = [Math.cos(an), Math.sin(an)];
      fill([[x + d[0] * R * .15, y + d[1] * R * .15], [x + d[0] * R * .45, y + d[1] * R * .45], [x + d[0] * R * .7, y + d[1] * R * .7]], R * .4, C.saffron, t0 + .4 + i * .03, { profile: PROFILE.petal, speed: 220 });
    }
    for (let i = 0; i < n; i++) {
      const an = b0 + i / n * TAU, d = [Math.cos(an), Math.sin(an)];
      tracery([[x + d[0] * R * .74, y + d[1] * R * .74], [x + d[0] * R * .9, y + d[1] * R * .9]], t0 + .75 + i * .02, { w: 1.2 });
    }
    disc(x, y, R * .27, C.ultra, t0 + .75);
    for (let i = 0; i < 12; i++) { const an = i / 12 * TAU; disc(x + Math.cos(an) * R * .17, y + Math.sin(an) * R * .17, 2.2, C.white, t0 + .9 + i * .015, { outline: false }); }
    disc(x, y, R * .07, C.saffron, t0 + 1.05);
  }

  function pomegranate(x, y, R, t0) {
    // the crown first, behind, then the fruit, then the split showing the seeds
    for (let i = -2; i <= 2; i++) { const an = -Math.PI / 2 + i * .32; leaf([x, y - R * .62], [Math.cos(an), Math.sin(an)], R * (.62 - Math.abs(i) * .07), R * .2, C.madder, t0 + Math.abs(i) * .04, { bend: 0 }); }
    disc(x, y, R * .82, C.verm, t0 + .15);
    fill([[x, y - R * .55], [x, y], [x, y + R * .62]], R * .78, C.saffron, t0 + .4, { profile: PROFILE.leaf, speed: 240 });
    for (let row = -3; row <= 3; row++) {
      const yy = y + row * R * .15 + R * .03, half = Math.max(0, Math.sin(Math.PI * (row + 3.7) / 7.4)) * R * .28;
      for (let xx = -half; xx <= half + .1; xx += R * .14) {
        disc(x + xx, yy, R * .055, C.madder, t0 + .7 + (row + 3) * .04 + r() * .05, { outline: false });
        disc(x + xx - 1.2, yy - 1.2, 1.1, C.white, t0 + 1 + (row + 3) * .04, { outline: false });
      }
    }
    tracery(Array.from({ length: 12 }, (_, i) => { const an = Math.PI * (.9 + i / 11 * .5); return [x + Math.cos(an) * R * .7, y + Math.sin(an) * R * .7]; }), t0 + .9, { w: 1.4 });
  }

  // 3. every gap filled, last: hairline sprays with gold ivy leaves and dots, after the wave has passed
  const sprays = withSprays ? Math.round(W * H / 900) : 0;
  for (let i = 0; i < sprays; i++) {
    const x = r() * W, y = r() * H;
    if (!free(x, y, 1)) continue;
    const R0 = r.range(9, 24), dir = r.sign(), a0 = r() * TAU, pts = [];
    let ok = true;
    for (let j = 0; j <= 16; j++) {
      const th = j / 16 * 1.6 * TAU, rr = R0 * Math.exp(-th * .22), p = [x + Math.cos(a0 + dir * th) * rr, y + Math.sin(a0 + dir * th) * rr];
      if (j % 2 === 0 && !free(p[0], p[1], 0)) { ok = false; break; }
      pts.push(p);
    }
    if (!ok) continue;
    const t0 = grow(x, y) + 1.1 + r() * .4;
    // a stem in from outside the spiral
    const s0 = pts[0], out = [s0[0] + Math.cos(a0) * R0 * 1.2, s0[1] + Math.sin(a0) * R0 * 1.2];
    pen([out, ...pts], t0, { w: .8, speed: 260 });
    const [lx, ly] = out, la = a0 + r.sign() * 1.2;
    leaf([lx, ly], [Math.cos(la), Math.sin(la)], 13, 8, C.saffron, t0 + .05, { bend: .2, ink: C.ink });
    disc(pts[pts.length - 1][0], pts[pts.length - 1][1], 2.6, r() < .5 ? C.saffron : C.verm, t0 + .5, { outline: true });
  }
  return { guides, cells, h, TH, a, y0, k0, k1, free, grow };
}
