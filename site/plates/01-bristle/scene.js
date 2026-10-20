// 01 Bristle — a katagami window: the technical layer first (tonbo, silk net), then a plum branch
// painted structure-first like a sumi-e painter would, then blossom, ginkgo, tendrils, moss dots, seal.
import { Painter, Stroke, Stamp, PROFILE } from '../../shared/brush.js';
import { run } from '../../shared/runner.js';
import { rng, lerp, clamp, noise1, TAU } from '../../shared/util.js';

const W = 1600, H = 1000;
const C = {
  sumi: [26, 23, 21], verm: [208, 56, 36], verd: [34, 104, 90], ochre: [196, 146, 48],
  coral: [214, 128, 104], blue: [118, 168, 214],
};
const F = { x: 390, y: 90, w: 820, h: 820 };

// infinite line p + t·d clipped to the frame → [t0, t1]
function clip(px, py, dx, dy) {
  let t0 = -1e9, t1 = 1e9;
  for (const [p, d, lo, hi] of [[px, dx, F.x, F.x + F.w], [py, dy, F.y, F.y + F.h]]) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return null; continue; }
    let a = (lo - p) / d, b = (hi - p) / d; if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
  }
  return t1 > t0 + 4 ? [t0, t1] : null;
}

function compose(seed) {
  const r = rng(seed), S = []; let id = 0;
  const add = o => { const s = new Stroke({ seed: seed * 7919 + ++id, ...o }); S.push(s); return s; };

  // ── 1. ruling: tonbo, then the silk net sweeping left to right
  const pen = (pts, start, o = {}) => add({ pts, pen: true, w: .7, color: C.sumi, alpha: .8, speed: 700, start, ease: .2, ...o });
  [[F.x, F.y, -1, -1], [F.x + F.w, F.y, 1, -1], [F.x, F.y + F.h, -1, 1], [F.x + F.w, F.y + F.h, 1, 1]].forEach(([cx, cy, sx, sy], i) => {
    const t = .05 + i * .07;
    for (const d of [0, 9]) {
      pen([[cx + sx * 14, cy - sy * d], [cx + sx * 58, cy - sy * d]], t);
      pen([[cx - sx * d, cy + sy * 14], [cx - sx * d, cy + sy * 58]], t + .04);
    }
  });
  [[F.x + F.w / 2, F.y, 0, -1], [F.x + F.w / 2, F.y + F.h, 0, 1], [F.x, F.y + F.h / 2, -1, 0], [F.x + F.w, F.y + F.h / 2, 1, 0]].forEach(([cx, cy, sx, sy], i) => {
    const t = .3 + i * .05;
    pen([[cx + sx * 14, cy + sy * 14], [cx + sx * 56, cy + sy * 56]], t);
    pen([[cx + sy * 22 + sx * 36, cy + sx * 22 + sy * 36], [cx - sy * 22 + sx * 36, cy - sx * 22 + sy * 36]], t + .05);
  });
  for (const fam of [1, -1]) {
    const a = fam * (56 + r.range(-3, 3)) * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
    const cx = F.x + F.w / 2, cy = F.y + F.h / 2, ext = (F.w + F.h) * .75;
    for (let off = -ext; off < ext; off += r.range(19, 31)) {
      const px = cx + nx * off, py = cy + ny * off, c = clip(px, py, dx, dy); if (!c) continue;
      const pts = [], m = Math.max(2, Math.ceil((c[1] - c[0]) / 55));
      for (let k = 0; k <= m; k++) {
        const t = lerp(c[0], c[1], k / m), j = k === 0 || k === m ? 0 : r.gauss() * .9;
        pts.push([px + dx * t + nx * j, py + dy * t + ny * j]);
      }
      if (fam < 0) pts.reverse();
      const mx = (pts[0][0] + pts[pts.length - 1][0]) / 2;
      pen(pts, .15 + (mx - F.x) / F.w * .8 + (fam < 0 ? .2 : 0) + r() * .08, { w: .55, color: C.blue, alpha: .62, speed: 2800 });
    }
  }

  // ── 2. the branch, structure first: trunk, then limbs, then twigs (breadth-first, one brush)
  let T = .75;
  const tips = [], limbs = [];
  const queue = [{ x: 250, y: 985, a: -.74, len: 200, w: 42, depth: 0, nseg: 4 }];
  while (queue.length) {
    const L = queue.shift();
    let { x, y, a, len, w } = L;
    for (let i = 0; i < L.nseg; i++) {
      const seg = len * r.range(.82, 1.15);
      a += r.range(-.3, .3); if (L.depth === 0) a += (-.78 - a) * .35;
      if (L.depth > 0 && Math.sin(a) > .55) a -= .4;                 // nothing droops too far
      let ex = x + Math.cos(a) * seg, ey = y + Math.sin(a) * seg;
      if (ex > W - 40 || ey < 30 || ex < 40) break;
      const bend = r.range(-.08, .08) * seg, px = -Math.sin(a), py = Math.cos(a), back = w * (L.depth ? .2 : .45);
      const pts = [[x - Math.cos(a) * back, y - Math.sin(a) * back],
        [x + Math.cos(a) * seg * .35 + px * bend, y + Math.sin(a) * seg * .35 + py * bend],
        [x + Math.cos(a) * seg * .7 + px * bend * .6, y + Math.sin(a) * seg * .7 + py * bend * .6], [ex, ey]];
      const s = add({
        pts, w, color: C.sumi, alpha: .94, dry: [.34, .24, .12][L.depth], ink: [.95, 1.2, 2][L.depth], grain: .55,
        profile: [PROFILE.blunt, PROFILE.blunt, PROFILE.taper][L.depth], speed: [760, 980, 1200][L.depth], minDur: .16, start: T, wobble: .14,
      });
      limbs.push({ pts, w, depth: L.depth });
      T = s.end + r.range(.02, .06);
      if (L.depth < 2 && (i > 0 || L.depth > 0) && r() < [.95, .85][L.depth]) {
        const side = (i % 2 ? 1 : -1) * (L.depth ? r.sign() : 1);
        queue.push({ x: ex, y: ey, a: a + side * r.range(.45, .95), len: L.depth ? r.range(50, 90) : len * r.range(.55, .72),
          w: w * (L.depth ? .5 : .46), depth: L.depth + 1, nseg: L.depth ? r.int(1, 2) : r.int(2, 3) });
      }
      x = ex; y = ey; w *= .8;
    }
    if (L.depth > 0) tips.push([x, y]);
  }

  // ── 3. blossom: boneless red plums, a few drawn in outline only, closed buds
  const spots = [];
  const far = (x, y, d) => spots.every(([u, v]) => Math.hypot(u - x, v - y) > d);
  for (const [x, y] of tips) if (far(x, y, 54)) spots.push([x, y]);
  for (const l of limbs) if (l.depth > 0 && r() < .7) {
    const [x, y] = l.pts[2]; const j = [x + r.range(-12, 12), y + r.range(-12, 12)];
    if (far(j[0], j[1], 54)) spots.push(j);
  }
  spots.sort((a, b) => a[0] - b[0]);
  const BT = T - .15, PINK = [226, 104, 82];
  spots.forEach(([x, y], j) => {
    const kind = r() < .16 ? 'bud' : r() < .24 ? 'line' : 'fill', size = kind === 'bud' ? r.range(9, 13) : r.range(24, 33);
    let t = BT + j * .14;
    const base = r() * TAU;
    if (kind === 'bud') {
      add({ pts: [[x, y], [x + 3, y - 2]], w: size, bristles: 12, color: C.verm, alpha: .88, profile: PROFILE.tap, minDur: .08, start: t });
      return;
    }
    for (let i = 0; i < 5; i++) {
      const a = base + i * TAU / 5 + r.range(-.12, .12), ca = Math.cos(a), sa = Math.sin(a);
      if (kind === 'line') {
        const cx = x + ca * size * .4, cy = y + sa * size * .4, pr = size * .3, arc = [];
        for (let k = 0; k <= 14; k++) { const b = a + Math.PI * .95 + k / 14 * TAU * .9; arc.push([cx + Math.cos(b) * pr, cy + Math.sin(b) * pr]); }
        add({ pts: arc, w: 1.5, bristles: 2, color: C.sumi, alpha: .85, dry: .05, ink: 4, profile: PROFILE.hair, speed: 320, minDur: .1, start: t, ease: .4 });
      } else {
        add({
          pts: [[x + ca * size * .12, y + sa * size * .12], [x + ca * size * .5 - sa * size * .05, y + sa * size * .5 + ca * size * .05], [x + ca * size * .78, y + sa * size * .78]],
          wash: true, w: size * r.range(.66, .78), color: r() < .5 ? C.verm : PINK, alpha: r.range(.42, .62), rim: 1.3,
          profile: PROFILE.petal, speed: 160, minDur: .1, start: t, ease: .5, wobble: .06,
        });
      }
      t += .045;
    }
    for (let i = 0; i < 6; i++) {
      const a = base + .3 + i * TAU / 6 + r.range(-.2, .2), l = size * r.range(.38, .58);
      add({ pts: [[x, y], [x + Math.cos(a) * l, y + Math.sin(a) * l]], pen: true, w: .9, color: C.sumi, alpha: .8, speed: 600, minDur: .06, start: t + i * .015 });
      add({ pts: [[x + Math.cos(a) * l, y + Math.sin(a) * l], [x + Math.cos(a) * (l + 2), y + Math.sin(a) * (l + 2)]], w: 3.6, bristles: 5, color: C.sumi, alpha: .9, profile: PROFILE.tap, minDur: .05, start: t + .08 + i * .015 });
    }
    if (kind === 'fill') for (let i = 0; i < 4; i++) {
      const a = r() * TAU, d = r() * size * .14, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      add({ pts: [[px, py], [px + 1.6, py + 1]], w: r.range(3.5, 5), bristles: 6, color: C.ochre, alpha: .95, profile: PROFILE.tap, minDur: .05, start: t + .14 + i * .02 });
    }
  });
  T = BT + spots.length * .14 + .3;

  // ── 4. ginkgo, striated like the katagami wallpaper: one rib at a time, then the ragged edge
  const fan = (bx, by, dir, R, ha, color, t0) => {
    add({ pts: [[bx, by], [bx - Math.cos(dir) * 40 + 6, by - Math.sin(dir) * 40], [bx - Math.cos(dir) * 80 + 12, by - Math.sin(dir) * 80]], w: 5, color, alpha: .85, dry: .3, profile: PROFILE.taper, speed: 600, start: t0 });
    const m = 38, ns = r() * 99;
    const edgeR = f => R * (1 - .2 * Math.exp(-((f / .09) ** 2))) * (.95 + .07 * noise1(f * 9 + ns, 4));
    for (let i = 0; i < m; i++) {
      const f = i / (m - 1) * 2 - 1, th = dir + f * ha, rr = edgeR(f) * r.range(.95, 1);
      const ca = Math.cos(th), sa = Math.sin(th), bend = f * R * .06;
      add({
        pts: [[bx + ca * R * .02, by + sa * R * .02], [bx + ca * rr * .55 - sa * bend, by + sa * rr * .55 + ca * bend], [bx + ca * rr, by + sa * rr]],
        w: 3.4, bristles: 5, color, alpha: .9, dry: .32, ink: 1.2, grain: .5, profile: PROFILE.hair, speed: 2000, minDur: .08, start: t0 + .2 + i * .024,
      });
    }
    const edge = [];
    for (let k = 0; k <= 40; k++) { const f = k / 40 * 2 - 1, th = dir + f * ha * 1.01, rr = edgeR(f); edge.push([bx + Math.cos(th) * rr, by + Math.sin(th) * rr]); }
    add({ pts: edge, w: 5, color, alpha: .9, dry: .55, ink: .8, grain: .6, profile: PROFILE.stroke, speed: 900, start: t0 + .2 + m * .024 + .02 });
    return t0 + .2 + m * .024 + .45;
  };
  let FT = fan(1145, 790, -1.95, 205, .95, C.ochre, T - .3);
  FT = fan(1268, 838, -1.15, 132, .85, C.sumi, FT - .45);

  // ── 5. tendrils hanging from the top of the window, a few leaves each
  [[F.x + 95, 300], [F.x + 230, 520], [F.x + 610, 250], [F.x + 745, 430]].forEach(([x0, len], j) => {
    const pts = [], t0 = T + .1 + j * .22, amp = r.range(5, 12), ph = r() * TAU;
    for (let y = 0; y <= len; y += 40) pts.push([x0 + Math.sin(y / 95 + ph) * amp, F.y + 2 + y]);
    const s = add({ pts, w: 2.6, bristles: 4, color: C.coral, alpha: .9, dry: .18, ink: 3, profile: PROFILE.hair, speed: 520, start: t0, ease: .15 });
    let side = r.sign();
    for (let y = 70 + r() * 40; y < len - 20; y += r.range(110, 170)) {
      const x = x0 + Math.sin(y / 95 + ph) * amp, a = Math.PI / 2 + side * r.range(.6, 1.05), l = r.range(26, 38);
      add({
        pts: [[x, F.y + y], [x + Math.cos(a) * l * .5 + side * 3, F.y + y + Math.sin(a) * l * .5], [x + Math.cos(a) * l, F.y + y + Math.sin(a) * l]],
        w: 13, color: j === 2 ? C.verd : C.coral, alpha: .82, dry: .08, ink: 3, profile: PROFILE.leaf, speed: 300, minDur: .1, start: s.start + s.dur * (y / len) + .04,
      });
      side = -side;
    }
  });

  // ── 6. moss dots along the trunk and limbs, then the seal
  const MT = Math.max(FT, T + 1.3) - .3;
  for (const l of limbs) if (l.depth < 2) {
    for (let i = 0; i < (l.depth ? 2 : 5); i++) {
      if (r() < .25) continue;
      const u = r(), [a, b] = [l.pts[1], l.pts[3]], x = lerp(a[0], b[0], u) + r.range(-1, 1) * l.w * .75, y = lerp(a[1], b[1], u) + r.range(-1, 1) * l.w * .75;
      add({ pts: [[x, y], [x + r.range(-3, 3), y + r.range(2, 6)]], w: r.range(7, 13), bristles: 12, color: C.sumi, alpha: .95, dry: .12, profile: PROFILE.tap, minDur: .07, start: MT + r() * .7 });
    }
  }
  S.push(new Stamp({ x: F.x + F.w - 44, y: F.y + F.h + 26, size: 38, glyph: '始', start: MT + .9, seed: seed + 3 }));
  return S;
}

const painter = new Painter(W, H);
const scene = {
  W, H, duration: 1, canvas: painter.canvas,
  resize: s => painter.resize(s),
  reset(seed) { const S = compose(seed); painter.reset(S); scene.duration = Math.max(...S.map(s => s.end)) + .3; },
  step: (a, b) => painter.step(a, b),
  render: t => painter.render(t),
};
run(scene);
