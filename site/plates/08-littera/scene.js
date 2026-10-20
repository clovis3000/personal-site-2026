// 08 Littera — a plate after Hoefnagel's model alphabet (Mira calligraphiae monumenta, #3 and #18 on the
// board) and the psalter B of #1: a constructed capital on its construction, the counters inhabited (a
// globe, a moth), a strapwork plinth, columns carrying globes, acanthus scrolls let loose across the page,
// pearls, cherries, beetles. Everything mirrored grows in mirrored pairs.
import { Painter, Stroke, Stamp, PROFILE } from '../../shared/brush.js';
import { Nib, Label, Dot } from '../../shared/pen.js';
import { run } from '../../shared/runner.js';
import { rng, lerp, clamp, noise1, TAU } from '../../shared/util.js';

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const C = {
  sumi: hex('#1b1918'), lapis: hex('#22449c'), blue: hex('#76a8d6'), verm: hex('#cf3a24'), ochre: hex('#cf9530'),
  verd: hex('#2c7a62'), forest: hex('#24483a'), cream: hex('#fbf3dc'), plum: hex('#6c2a40'), coral: hex('#de8a6c'),
  sky: hex('#9cc1e2'), mute: hex('#8a8f98'), cherry: hex('#b7222c'),
};

let W = 1600, H = 1000;
const painter = new Painter(W, H);

function compose(seed) {
  const r = rng(seed), S = []; let id = 0;
  const push = o => (S.push(o), o);
  const add = o => push(new Stroke({ seed: seed * 7919 + ++id, ...o }));
  const pen = (pts, start, o = {}) => add({ pts, pen: true, linear: true, w: .7, color: C.blue, alpha: .85, speed: 1100, start, ease: .3, ...o });
  const cx = W / 2, k = Math.min(1, W / 1500), Sz = 500 * Math.max(.75, k), bx = cx - Sz * .52, by = 140;
  const X = u => bx + u * Sz, Y = v => by + v * Sz;
  const mir = pts => pts.map(([x, y]) => [2 * cx - x, y]);
  const both = (pts, fn) => { fn(pts); fn(mir(pts)); };
  const circ = (x, y, rr, a0 = 0, sw = TAU, m = 48, sy = 1) => Array.from({ length: m + 1 }, (_, i) => [x + Math.cos(a0 + sw * i / m) * rr, y + Math.sin(a0 + sw * i / m) * rr * sy]);

  // ── 0. the page: axis, tonbo
  pen([[cx, 0], [cx, H]], .05, { w: .5, alpha: .5, speed: 2400 });
  pen([[0, Y(.5)], [W, Y(.5)]], .15, { w: .5, alpha: .5, speed: 3200 });
  for (const [x, y, sx, sy] of [[28, 28, 1, 1], [W - 28, 28, -1, 1], [28, H - 28, 1, -1], [W - 28, H - 28, -1, -1]])
    for (const d of [0, 8]) { pen([[x, y + sy * d], [x + sx * 44, y + sy * d]], .1, { color: C.sumi, alpha: .7 }); pen([[x + sx * d, y], [x + sx * d, y + sy * 44]], .14, { color: C.sumi, alpha: .7 }); }

  // ── 1. construction of the B
  pen([[X(0), Y(0)], [X(1), Y(0)], [X(1), Y(1)], [X(0), Y(1)], [X(0), Y(0)]], .2, { w: .9, speed: 1600 });
  for (let i = 1; i < 10; i++) { pen([[X(i / 10), Y(0)], [X(i / 10), Y(1)]], .4 + i * .03, { w: .4, alpha: .4, speed: 2600 }); pen([[X(0), Y(i / 10)], [X(1), Y(i / 10)]], .42 + i * .03, { w: .4, alpha: .4, speed: 2600 }); }
  pen([[X(0), Y(0)], [X(1), Y(1)]], .75, { w: .55 }); pen([[X(1), Y(0)], [X(0), Y(1)]], .8, { w: .55 });
  add({ pts: circ(X(.49), Y(.27), Sz * .23, -1.5, TAU, 64), pen: true, w: .7, color: C.blue, alpha: .85, speed: 1700, start: .9 });
  add({ pts: circ(X(.55), Y(.71), Sz * .265, -1.5, TAU, 64), pen: true, w: .7, color: C.blue, alpha: .85, speed: 1700, start: 1.0 });
  [[.49, .27], [.55, .71]].forEach(([u, v], i) => push(new Dot({ x: X(u), y: Y(v), r: 1.6, color: C.blue, start: .9 + i * .1 })));

  // ── 2. the B, lapis, broad nib at 30°, stem a tenth of the height
  let T = 1.35;
  const NW = Sz / 10;
  const lap = (pts, o = {}) => { const s = push(new Nib({ pts: pts.map(([u, v]) => [X(u), Y(v)]), w: NW, angle: 30, color: C.lapis, speed: 520, start: T, ease: .5, curve: pts.length > 2, ...o })); T = s.end + .04; return s; };
  lap([[.28, .065], [.28, .935]]);
  lap([[.24, .068], [.5, .062], [.64, .085], [.72, .15], [.735, .26], [.69, .38], [.58, .455], [.4, .478], [.28, .478]].map(([u, v]) => [u, v]), { speed: 640 });
  lap([[.28, .478], [.5, .478], [.68, .51], [.8, .58], [.845, .7], [.81, .83], [.68, .915], [.48, .94], [.2, .94]], { speed: 680 });
  lap([[.2, .066], [.33, .066]], { angle: 4, w: NW * .55 });
  lap([[.19, .934], [.33, .934]], { angle: 4, w: NW * .55 });
  // white heightening in the stem and bowls, the Lombardic way
  const hl = (pts, t0) => add({ pts: pts.map(([u, v]) => [X(u), Y(v)]), pen: true, w: 1.6, color: C.cream, alpha: 1, speed: 900, start: t0, blend: 'source-over' });
  hl([[.28, .13], [.28, .87]], T);
  hl([[.6, .1], [.69, .17], [.7, .26], [.66, .36], [.58, .42]], T + .15);
  hl([[.68, .55], [.78, .62], [.8, .71], [.76, .82], [.66, .88]], T + .3);
  for (let i = 0; i < 9; i++) push(new Dot({ x: X(.28), y: Y(.16 + i * .085), r: 2.1, color: C.cream, start: T + .4 + i * .03, blend: 'source-over' }));
  T += .7;

  // ── 3. the plinth: strapwork in double line, a vermilion field, the plate's name in it
  const pl = { x0: X(-.12), x1: X(1.12), y0: Y(1) + 26, y1: Y(1) + 92 };
  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  add({ pts: [[pl.x0 + 30, (pl.y0 + pl.y1) / 2], [pl.x1 - 30, (pl.y0 + pl.y1) / 2]], w: pl.y1 - pl.y0 - 14, bristles: 70, color: C.verm, alpha: .8, dry: .06, ink: 5, grain: .3, profile: PROFILE.flat, speed: 1300, start: T, ease: .2, wobble: 0 });
  pen(rect(pl.x0, pl.y0, pl.x1, pl.y1), T + .2, { color: C.sumi, w: 1.2, speed: 2200 });
  pen(rect(pl.x0 + 6, pl.y0 + 6, pl.x1 - 6, pl.y1 - 6), T + .3, { color: C.sumi, w: .6, speed: 2200 });
  both([[pl.x0, pl.y0], [pl.x0 - 40, pl.y0 - 18], [pl.x0 - 52, pl.y0 + 10], [pl.x0 - 30, pl.y1]], pts => add({ pts, pen: true, w: 1.1, color: C.sumi, alpha: .9, speed: 600, start: T + .5 }));
  push(new Label({ x: cx, y: (pl.y0 + pl.y1) / 2 + 5, text: 'LITTERA  B  ·  CONSTRUCTA', align: 'center', size: 13, track: .4, color: C.cream, weight: 600, start: T + .7, cps: 40, blend: 'source-over' }));

  // ── 4. columns, each carrying a globe (mirrored)
  const D = Math.min(W / 2 - 110, Sz * 1.05), colX = cx - D, cTop = Y(.34), cBot = pl.y1;
  const T4 = T + .3;
  both([[colX - 13, cBot], [colX - 13, cTop]], p => pen(p, T4, { color: C.sumi, w: 1, speed: 900 }));
  both([[colX + 13, cBot], [colX + 13, cTop]], p => pen(p, T4 + .05, { color: C.sumi, w: 1, speed: 900 }));
  for (let i = -1; i <= 1; i++) both([[colX + i * 6, cBot - 4], [colX + i * 6, cTop + 8]], p => pen(p, T4 + .3, { color: C.sumi, w: .4, alpha: .6, speed: 1200 }));
  both(rect(colX - 24, cTop - 12, colX + 24, cTop), p => pen(p, T4 + .5, { color: C.sumi, w: 1, speed: 800 }));
  both(rect(colX - 26, cBot - 14, colX + 26, cBot), p => pen(p, T4 + .2, { color: C.sumi, w: 1, speed: 800 }));
  const gR = 52, gy = cTop - 12 - gR - 6;
  const globe = (gx, gy2, R, t0, tint = C.sky) => {
    push(new Dot({ x: gx, y: gy2, r: R, color: tint, alpha: .55, start: t0 }));
    add({ pts: circ(gx, gy2, R, -1.5, TAU, 56), pen: true, w: 1.2, color: C.sumi, alpha: .95, speed: 900, start: t0 + .05 });
    for (let i = 1; i < 6; i++) { const rx = R * Math.cos(i / 6 * Math.PI); add({ pts: circ(gx, gy2, Math.abs(rx), -Math.PI / 2, Math.PI, 24, R / Math.max(1, Math.abs(rx))).map(([x, y]) => [rx < 0 ? 2 * gx - x : x, y]), pen: true, w: .6, color: C.sumi, alpha: .8, speed: 700, start: t0 + .25 + i * .05 }); }
    for (let i = -2; i <= 2; i++) { const yy = gy2 + R * Math.sin(i / 3 * 1.2), hw2 = Math.sqrt(Math.max(0, R * R - (yy - gy2) ** 2)); add({ pts: [[gx - hw2, yy], [gx + hw2, yy]], pen: true, linear: true, w: .6, color: C.sumi, alpha: .8, speed: 900, start: t0 + .5 + (i + 2) * .04 }); }
    add({ pts: circ(gx, gy2, R + 7, Math.PI * .15, Math.PI * .7, 20), pen: true, w: 2.2, color: C.ochre, alpha: .95, speed: 500, start: t0 + .6 });
  };
  globe(colX, gy, gR, T4 + .7); globe(2 * cx - colX, gy, gR, T4 + .7, hex('#c8d9a8'));

  // ── 5. acanthus: big scrolls from the plinth's ends, curling out across the page, leaves on their backs
  const T5 = T4 + 1.1;
  // a volute: a log spiral from the base, up and over and in, with acanthus leaves on its outer back
  const scroll = (x0, y0, R0, turns, dir, color, t0, w = 15, rot = 0) => {
    const pts = [], m = 70, kk = Math.log(1 / .14) / (turns * TAU), cxs = x0 + dir * R0 * Math.cos(rot), cys = y0 + R0 * Math.sin(rot);
    for (let i = 0; i <= m; i++) {
      const th = i / m * turns * TAU, rr = R0 * Math.exp(-kk * th), a = Math.PI + rot + th;
      pts.push([cxs + dir * Math.cos(a) * rr, cys + Math.sin(a) * rr]);
    }
    const s = add({ pts, w, color, alpha: .94, dry: .18, ink: 2.5, grain: .5, profile: PROFILE.taper, speed: 600, start: t0, wobble: .05 });
    for (let j = 2; j < m - 8; j += 2) {
      const [px, py] = pts[j], [qx, qy] = pts[j + 1], tx = qx - px, ty = qy - py, tl = Math.hypot(tx, ty) || 1;
      const ox = px - cxs, oy = py - cys, ol = Math.hypot(ox, oy) || 1, nx = ox / ol, ny = oy / ol;   // outward from the volute's eye
      const l = lerp(R0 * .62, R0 * .14, j / m) * r.range(.8, 1.2), back = -.45;
      add({ pts: [[px, py], [px + nx * l * .55 + tx / tl * l * back * .5, py + ny * l * .55 + ty / tl * l * back * .5], [px + nx * l + tx / tl * l * back, py + ny * l + ty / tl * l * back]],
        w: l * .45, color: [color, C.forest, C.verd, C.ochre][(j / 2) % 4 === 3 ? 3 : (j / 2) % 3 === 2 ? 1 : 0] || color, alpha: .9, dry: .08, ink: 3, profile: PROFILE.leaf, speed: 360, minDur: .08, start: s.start + s.dur * (j / m) + .04 });
    }
    return pts;
  };
  const sc = (x0, y0, R0, turns, color, t0, w, rot = 0) => { scroll(x0, y0, R0, turns, -1, color, t0, w, rot); scroll(2 * cx - x0, y0, R0, turns, 1, color, t0, w, rot); };
  sc(pl.x0 - 20, pl.y1 - 6, Math.min(170, (cx - 60) * .3) * Math.max(.7, k), 1.35, C.verd, T5, 18);
  sc(pl.x0 - 70, pl.y0 - 40, 80 * Math.max(.7, k), 1.2, C.verm, T5 + .45, 11, -.9);
  sc(colX - 40, cTop + 120, 90 * Math.max(.7, k), 1.25, C.ochre, T5 + .9, 11, .5);
  sc(colX + 30, H - 70, 120 * Math.max(.7, k), 1.3, C.forest, T5 + 1.2, 13, .2);

  // gilded strapwork round the letter's square: a gold band between two black rules, volutes at the corners
  const fr = 26, fx0 = X(0) - fr, fy0 = Y(0) - fr, fx1 = X(1) + fr, fy1 = Y(1) + fr;
  add({ pts: [[fx0, fy0], [fx1, fy0], [fx1, fy1], [fx0, fy1], [fx0, fy0 - 1]], linear: true, w: 15, bristles: 26, color: C.ochre, alpha: .9, dry: .25, ink: 6, grain: .7, profile: PROFILE.flat, speed: 1500, start: T5 - .3, wobble: 0 });
  pen([[fx0 - 9, fy0 - 9], [fx1 + 9, fy0 - 9], [fx1 + 9, fy1 + 9], [fx0 - 9, fy1 + 9], [fx0 - 9, fy0 - 9]], T5 - .1, { color: C.sumi, w: 1.1, speed: 2600 });
  pen([[fx0 + 9, fy0 + 9], [fx1 - 9, fy0 + 9], [fx1 - 9, fy1 - 9], [fx0 + 9, fy1 - 9], [fx0 + 9, fy0 + 9]], T5, { color: C.sumi, w: .8, speed: 2600 });
  for (const [x, y, sx, sy] of [[fx0, fy0, -1, -1], [fx1, fy0, 1, -1]]) {
    const pts = Array.from({ length: 41 }, (_, i) => { const th = i / 40 * 1.6 * TAU, rr = 30 * Math.exp(-th * .3); return [x + sx * 30 + sx * Math.cos(Math.PI + th) * rr, y + sy * 4 + Math.sin(Math.PI + th) * rr * -sy]; });
    add({ pts, w: 7, color: C.sumi, alpha: .9, dry: .2, profile: PROFILE.taper, speed: 400, start: T5 + .2 });
  }

  // a festoon over the top, globe to globe: leaves, fruit and flowers, dense
  const festoon = (x0, y0, x1, y1, sag, t0) => {
    const P = []; for (let i = 0; i <= 50; i++) { const u = i / 50; P.push([lerp(x0, x1, u), lerp(y0, y1, u) + Math.sin(u * Math.PI) * sag]); }
    add({ pts: P, w: 5, color: C.forest, alpha: .9, dry: .2, profile: PROFILE.hair, speed: 900, start: t0 });
    P.forEach(([x, y], i) => {
      if (i % 2) return;
      const tt = t0 + i * .02, a = r() * TAU;
      for (const sgn of [-1, 1]) { const aa = -Math.PI / 2 + sgn * r.range(.5, 1.3), l = r.range(22, 36); add({ pts: [[x, y], [x + Math.cos(aa) * l * .5, y + Math.sin(aa) * l * .5 + 4], [x + Math.cos(aa) * l, y + Math.sin(aa) * l]], w: l * .42, color: r() < .6 ? C.verd : C.forest, alpha: .9, dry: .06, ink: 3, profile: PROFILE.leaf, speed: 300, minDur: .07, start: tt }); }
      if (i % 6 === 0) { const fc = r.pick([C.cherry, C.verm, C.ochre, C.coral]); add({ pts: [[x - 3, y + 14], [x + 3, y + 14]], wash: true, w: r.range(16, 24), color: fc, alpha: .82, rim: 1.3, profile: PROFILE.petal, speed: 60, minDur: .12, start: tt + .1 }); push(new Dot({ x: x - 3, y: y + 10, r: 2.4, color: C.cream, start: tt + .25, blend: 'source-over' })); }
      else if (i % 6 === 3) { for (let q = 0; q < 5; q++) { const qa = a + q * TAU / 5; add({ pts: [[x, y + 6], [x + Math.cos(qa) * 13, y + 6 + Math.sin(qa) * 13]], wash: true, w: 11, color: C.cream, alpha: .95, rim: 1, profile: PROFILE.petal, speed: 80, minDur: .06, start: tt + .1 + q * .02, blend: 'source-over' }); } push(new Dot({ x, y: y + 6, r: 3, color: C.ochre, start: tt + .25 })); }
    });
  };
  festoon(colX + 20, gy - gR - 10, fx0 - 12, fy0 - 12, 110, T5 + .2);
  festoon(2 * cx - colX - 20, gy - gR - 10, fx1 + 12, fy0 - 12, 110, T5 + .2);
  festoon(fx0 + 30, fy0 - 14, fx1 - 30, fy0 - 14, -46, T5 + .9);

  // fruit heaped at the plinth's ends: a pear, a pomegranate, cherries
  const T5b = T5 + 1.5;
  const fruit = (x, y, t0, s) => {
    add({ pts: [[x, y - 30], [x + s * 4, y - 6], [x, y + 18]], wash: true, w: 34, color: C.ochre, alpha: .78, rim: 1.4, profile: u => Math.sin(Math.PI * u) ** .5 * (.55 + .45 * u), speed: 120, minDur: .2, start: t0 });
    add({ pts: [[x, y - 30], [x + s * 3, y - 44]], pen: true, w: 1.6, color: C.sumi, alpha: .9, speed: 200, start: t0 + .2 });
    add({ pts: [[x + s * 34, y + 4], [x + s * 36, y + 6]], wash: true, w: 40, color: C.cherry, alpha: .8, rim: 1.6, profile: PROFILE.petal, speed: 30, minDur: .2, start: t0 + .15 });
    for (let q = 0; q < 4; q++) add({ pts: [[x + s * 34, y - 14], [x + s * (28 + q * 4), y - 26]], w: 4, bristles: 4, color: C.plum, alpha: .9, profile: PROFILE.taper, speed: 200, minDur: .05, start: t0 + .35 + q * .03 });
    add({ pts: [[x + s * 24, y - 10], [x + s * 6, y - 40], [x - s * 20, y - 30]], w: 26, color: C.verd, alpha: .88, dry: .06, profile: PROFILE.leaf, speed: 260, start: t0 + .1 });
  };
  fruit(pl.x0 + 26, pl.y0 - 22, T5b, 1); fruit(pl.x1 - 26, pl.y0 - 22, T5b, -1);

  // ── 6. pearl swags from the globe stands to the B's shoulders, a cherry pair at each low point
  const T6 = T5 + 1.6;
  const swag = (x0, y0, x1, y1, sag, t0) => {
    const pts = []; for (let i = 0; i <= 26; i++) { const u = i / 26; pts.push([lerp(x0, x1, u), lerp(y0, y1, u) + Math.sin(u * Math.PI) * sag]); }
    add({ pts, pen: true, w: .7, color: C.sumi, alpha: .7, speed: 700, start: t0 });
    pts.forEach(([x, y], i) => i % 2 || push(new Dot({ x, y, r: 3.4, color: C.sumi, ring: true, start: t0 + i * .02 })));
    const [mx, my] = pts[13];
    for (const s of [-1, 1]) {
      add({ pts: [[mx, my], [mx + s * 8, my + 22], [mx + s * 12, my + 40]], pen: true, w: 1.1, color: C.forest, alpha: .9, speed: 300, start: t0 + .5 });
      add({ pts: [[mx + s * 12 - 3, my + 48], [mx + s * 12 + 3, my + 48]], wash: true, w: 18, color: C.cherry, alpha: .8, rim: 1.2, profile: PROFILE.petal, speed: 60, minDur: .12, start: t0 + .7 });
      push(new Dot({ x: mx + s * 12 - 3, y: my + 44, r: 2, color: C.cream, start: t0 + .85, blend: 'source-over' }));
    }
    add({ pts: [[mx, my], [mx + 10, my + 6], [mx + 22, my + 2]], w: 12, color: C.verd, alpha: .85, profile: PROFILE.leaf, speed: 200, minDur: .1, start: t0 + .55 });
  };
  swag(colX + 10, cTop - 4, X(.1), Y(.06), 90, T6); swag(2 * cx - colX - 10, cTop - 4, X(.95), Y(.06), 90, T6);

  // ── 7. the counters inhabited: a globe above, a moth below
  const T7 = T6 + .4;
  globe(X(.48), Y(.27), Sz * .1, T7, hex('#e8c47a'));
  const mx = X(.555), my = Y(.705), ms = Sz * .12;
  const wing = (ax, ay, len, wid, col, t0) => {
    for (const s of [-1, 1]) {
      const ex = mx + s * ax, ey = my + ay;
      add({ pts: [[mx + s * 3, my], [lerp(mx, ex, .55), lerp(my, ey, .55) - wid * .2], [ex, ey]], wash: true, w: wid, color: col, alpha: .7, rim: 1.4, profile: PROFILE.petal, speed: 220, minDur: .2, start: t0 });
      for (let v = 0; v < 4; v++) add({ pts: [[mx + s * 4, my], [lerp(mx, ex, .9) + s * (v - 1.5) * 4, lerp(my, ey, .9) + (v - 1.5) * wid * .18]], pen: true, w: .6, color: C.sumi, alpha: .7, speed: 500, start: t0 + .25 + v * .04 });
      push(new Dot({ x: lerp(mx, ex, .62), y: lerp(my, ey, .62), r: wid * .13, color: C.sumi, ring: true, start: t0 + .4 }));
      push(new Dot({ x: lerp(mx, ex, .62), y: lerp(my, ey, .62), r: wid * .06, color: C.plum, start: t0 + .45 }));
    }
  };
  wing(ms * 1.05, -ms * .55, ms, ms * .95, C.ochre, T7 + .5);
  wing(ms * .8, ms * .55, ms * .8, ms * .7, C.coral, T7 + .7);
  add({ pts: [[mx, my - ms * .35], [mx, my + ms * .45]], w: 9, bristles: 12, color: C.plum, alpha: .95, profile: PROFILE.leaf, speed: 200, start: T7 + .9 });
  for (const s of [-1, 1]) add({ pts: [[mx, my - ms * .35], [mx + s * 10, my - ms * .7], [mx + s * 22, my - ms * .85]], pen: true, w: .8, color: C.sumi, alpha: .9, speed: 300, start: T7 + 1.0 });

  // ── 8. red penwork in the B's square, wherever the letter and its tenants aren't
  const T8 = T7 + 1.1;
  const inB = (u, v, m) => (Math.abs(u - .28) < .06 + m && v > .03 - m && v < .97 + m) || (Math.hypot(u - .49, v - .27) < .26 + m && u > .25 - m) || (Math.hypot(u - .555, v - .705) < .3 + m && u > .25 - m);
  const spir = [];
  for (let tries = 0; tries < 900 && spir.length < 9; tries++) {
    const rr = r.range(.035, .06), u = r.range(.04 + rr, .96 - rr), v = r.range(.04 + rr, .96 - rr);
    if (inB(u, v, rr + .02) || spir.some(([a, b, c]) => Math.hypot(a - u, b - v) < (c + rr) * 1.2)) continue;
    spir.push([u, v, rr]);
  }
  spir.forEach(([u, v, rr], i) => {
    const a0 = r() * TAU, dir = r.sign(), turns = r.range(1.6, 2.3), m = 70;
    const pts = Array.from({ length: m + 1 }, (_, j) => { const f = j / m, a = a0 + dir * f * turns * TAU, q = rr * Sz * ((1 - f) ** 1.15 + .06); return [X(u) + Math.cos(a) * q, Y(v) + Math.sin(a) * q]; });
    add({ pts, pen: true, w: .95, color: C.verm, alpha: .92, speed: 500, start: T8 + i * .1 });
    push(new Dot({ x: pts[m][0], y: pts[m][1], r: 2.1, color: C.verm, start: T8 + i * .1 + .5 }));
  });

  // ── 9. beetles, specimen-pinned, and the plate's notes
  const T9 = T8 + .9;
  const beetle = (x, y, s, ang, col, t0) => {
    const ca = Math.cos(ang), sa = Math.sin(ang), P = (u, v) => [x + (u * ca - v * sa) * s, y + (u * sa + v * ca) * s];
    for (const side of [-1, 1]) for (let l = 0; l < 3; l++) add({ pts: [P(side * .25, -.3 + l * .35), P(side * .7, -.45 + l * .45), P(side * .95, -.2 + l * .55)], pen: true, linear: true, w: .9, color: C.sumi, alpha: .9, speed: 400, start: t0 + l * .04 });
    for (const side of [-1, 1]) add({ pts: [P(0, -.55), P(side * .3, -1.0), P(side * .5, -1.2)], pen: true, w: .7, color: C.sumi, alpha: .9, speed: 300, start: t0 + .1 });
    add({ pts: [P(0, -.55), P(0, -.4)], wash: true, w: s * .45, color: C.sumi, alpha: .9, rim: 1, profile: PROFILE.petal, speed: 40, minDur: .1, start: t0 + .2 });
    add({ pts: [P(0, -.35), P(0, .2), P(0, .75)], wash: true, w: s * .8, color: col, alpha: .85, rim: 1.4, profile: PROFILE.petal, speed: 120, minDur: .2, start: t0 + .25 });
    add({ pts: [P(0, -.3), P(0, .72)], pen: true, linear: true, w: .7, color: C.sumi, alpha: .8, speed: 300, start: t0 + .45 });
  };
  beetle(X(-.12) - 60 * k, Y(.08), 30, -.5, C.verd, T9);
  beetle(X(1.12) + 70 * k, Y(.12), 26, .6, C.plum, T9 + .2);
  beetle(cx - D * .55, Y(.62), 20, .2, C.ochre, T9 + .4);
  beetle(cx + D * .6, Y(.45), 22, -.3, C.lapis, T9 + .6);
  const note = (x, y, text, align, t0) => push(new Label({ x, y, text, align, size: 10, track: .14, color: C.mute, start: t0, cps: 50 }));
  note(X(0), Y(0) - 14, 'FIG. B — CAPITALIS, NIB 30°, STEM 1/10', 'left', T9 + .6);
  note(colX, cBot + 26, 'GLOBUS TERRESTRIS', 'center', T9 + .8);
  note(2 * cx - colX, cBot + 26, 'GLOBUS CAELESTIS', 'center', T9 + .9);
  push(new Stamp({ x: X(1) + 34, y: Y(0) - 8, size: 30, glyph: 'B', font: '"Hoefler Text","Baskerville",serif', start: T9 + 1.2, seed: seed + 5 }));
  return S;
}

const scene = {
  fill: true, W, H, duration: 1, canvas: painter.canvas,
  setSize(w, h) { W = scene.W = w; H = scene.H = h; painter.setSize(w, h); },
  resize: s => painter.resize(s),
  reset(seed) { const S = compose(seed); painter.reset(S); scene.duration = Math.max(...S.map(s => s.end)) + .4; },
  step: (a, b) => painter.step(a, b),
  render: t => painter.render(t),
};
run(scene);
