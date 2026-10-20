// 09 Bristle, GPU: 07 Hortus's painting with the bristle brush moved onto the GPU. Every bristle of every
// stroke is laid out once, at reset, as segments stamped with the moment the brush reaches them; a frame is
// one instanced draw against the clock, so the cost doesn't climb as the ferns put hundreds of ribs in flight
// at once. Washes and bristles share a device and composite into one canvas. The composition is 07's,
// copied with the same seeds, so the two plates can be laid side by side bristle for bristle.
import { run } from '../../shared/runner.js';
import { device, Wash, WetStroke } from '../../shared/wash.js';
import { Stroke, PROFILE } from '../../shared/brush.js';
import { Bristles } from '../../shared/bristles.js';
import { rng, lerp, clamp, noise1, TAU } from '../../shared/util.js';

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const ABS = (h, k = 1) => hex(h).map(v => -Math.log(Math.max(6, v) / 255) * k);
const C = {
  sumi: hex('#1d1a1a'), teal: hex('#1f6f6a'), forest: hex('#2c4a3a'), coral: hex('#d9816a'), cream: hex('#f1e2b8'),
  ochre: hex('#d29a2e'), verm: hex('#d0402a'), plum: hex('#6e2638'), rose: hex('#d98c8c'), pink: hex('#e7a6a0'),
};

let W = 1600, H = 1000, wash, bristles, wet = [], plan = {}, laid = '';
const dev = await device();

function compose(seed) {
  const r = rng(seed), S = [], WS = []; let id = 0;
  const add = o => { const s = new Stroke({ seed: seed * 7919 + ++id, ...o }); S.push(s); return s; };
  const wetAdd = o => { const s = new WetStroke({ seed: seed * 313 + WS.length, ...o }); WS.push(s); return s; };
  const X = u => u * W;

  // ── 1. wet masses: lobed shapes, filled with strokes that overlap enough to run together into one wash
  const blob = (cx, cy, rx, ry, rot, col, t0, k = 1) => {
    const w = Math.max(60, ry * .55), n = Math.max(3, Math.ceil(ry * 2 / (w * .42))), ph = r() * 99, ca = Math.cos(rot), sa = Math.sin(rot);
    const P = (u, v) => [cx + u * ca - v * sa, cy + u * sa + v * ca];
    for (let i = 0; i < n; i++) {
      const v = ((i + .5) / n * 2 - 1) * .92, half = rx * Math.sqrt(1 - v * v) * (.75 + .5 * noise1(i * .7 + ph, 2)) + w * .2;
      const off = (noise1(i * .5 + ph, 9) - .5) * rx * .3;
      const pts = [P(-half + off, v * ry), P(off * .5, v * ry + r.range(-12, 12)), P(half + off, v * ry)];
      if (i % 2) pts.reverse();
      wetAdd({ pts, w, col: ABS(col, k), water: 1.6, pig: .42, ink: 99, dry: 0, flying: .1, speed: 1900, dwell: .03, ease: .3, profile: PROFILE.blunt, start: t0 + i * .07 });
    }
  };
  blob(X(.46), 830, X(.34), 190, -.04, '#e3a09c', .1);                 // rose mound
  blob(X(.1), 520, X(.13), 400, .08, '#3a8a80', .3, .85);              // teal column, left
  blob(X(.6), 330, 205, 205, .3, '#e3b04a', .6, .95);                  // ochre sun
  blob(X(.83), 905, X(.22), 150, .05, '#7b2c3e', .8, .85);             // maroon, lower right
  blob(X(.91), 360, X(.12), 270, -.1, '#9ec5b2', 1.0, .75);            // mint, right
  blob(X(.31), 150, X(.17), 130, .12, '#f0c39a', 1.15, .8);            // apricot, upper left
  blob(X(.24), 880, X(.13), 140, -.2, '#5a2340', 1.3, .7);             // plum, lower left
  blob(X(.77), 610, X(.1), 120, .4, '#e9b2a6', 1.45, .9);              // pink lobe
  blob(X(.37), 480, X(.12), 130, -.3, '#c9d9a8', 1.6, .8);             // sage, the middle

  // ── 2. the ringed sphere over the sun: wavy rings, outside in
  let T = 2.0;
  const cx = X(.6), cy = 330, R = 195;
  for (let k = 0; k < 30; k++) {
    const rr = R * (1 - k / 30), pts = [], ph = r() * TAU, f = r.int(5, 9);
    for (let i = 0; i <= 72; i++) {
      const a = i / 72 * TAU + ph, wob = Math.sin(a * f + k * .7) * 4.5 + (noise1(i * .3 + k * 11, 7) - .5) * 7;
      const q = Math.min(R, Math.max(2, rr + wob));
      pts.push([cx + Math.cos(a) * q, cy + Math.sin(a) * q]);
    }
    add({ pts, w: 2.6, bristles: 3, color: C.sumi, alpha: .92, dry: .28, ink: 1.4, grain: .6, profile: PROFILE.flat, speed: 2600, start: T + k * .05, ease: .2 });
  }
  T += 30 * .05 + .3;

  // ── 3. fern leaves, striated rib by rib, rising from the page's lower edge
  const leaf = (bx, by, ang, len, wid, color, t0, bend = .25) => {
    const mid = [], m = 18, side0 = r.sign();
    for (let i = 0; i <= m; i++) { const u = i / m, a = ang + bend * u * u * side0; mid.push([bx + Math.cos(a) * len * u + Math.cos(ang + Math.PI / 2) * Math.sin(u * Math.PI) * len * .06 * side0, by + Math.sin(a) * len * u + Math.sin(ang + Math.PI / 2) * Math.sin(u * Math.PI) * len * .06 * side0]); }
    add({ pts: mid, w: 6, color, alpha: .9, dry: .25, profile: PROFILE.taper, speed: 1400, start: t0 });
    let t = t0 + .1;
    for (let i = 2; i < m * 6; i++) {
      const u = i / (m * 6), k = Math.min(m - 1, Math.floor(u * m)), f = u * m - k;
      const px = lerp(mid[k][0], mid[k + 1][0], f), py = lerp(mid[k][1], mid[k + 1][1], f);
      const tx = mid[k + 1][0] - mid[k][0], ty = mid[k + 1][1] - mid[k][1], tl = Math.hypot(tx, ty);
      const hw = wid * Math.sin(Math.PI * u ** .7) * (.85 + .3 * noise1(i * .4, 3));
      for (const side of [-1, 1]) {
        const nx = -ty / tl * side, ny = tx / tl * side, fx = tx / tl, fy = ty / tl;
        const ex = px + nx * hw + fx * hw * .55, ey = py + ny * hw + fy * hw * .55;
        add({ pts: [[px, py], [lerp(px, ex, .5) + nx * hw * .06, lerp(py, ey, .5) + ny * hw * .06], [ex, ey]], w: 3.8, bristles: 5, color, alpha: .88, dry: .3, ink: 1.4, grain: .5, profile: PROFILE.taper, speed: 1800, minDur: .05, start: t });
      }
      t += .012;
    }
    return t;
  };
  let LT = leaf(X(.03), H + 20, -1.2, 780, 110, C.teal, T);
  leaf(X(.17), H + 30, -1.5, 650, 95, C.forest, T + .25);
  leaf(X(.99), H + 20, -1.95, 720, 100, C.teal, T + .5);
  leaf(X(.34), H + 40, -1.0, 480, 75, C.sumi, T + .75);
  leaf(X(.88), H + 40, -2.35, 560, 85, C.forest, T + 1.0);
  leaf(X(-.02), 300, -.25, 420, 70, C.sumi, T + 1.2);
  LT = leaf(X(1.02), 160, Math.PI + .35, 460, 75, C.teal, T + 1.4);

  // ── 4. ginkgo fans
  const fan = (bx, by, dir, Rf, ha, color, t0) => {
    const m = 30;
    for (let i = 0; i < m; i++) {
      const f = i / (m - 1) * 2 - 1, th = dir + f * ha, rr = Rf * (1 - .18 * Math.exp(-((f / .1) ** 2))) * r.range(.94, 1);
      add({ pts: [[bx + Math.cos(th) * Rf * .03, by + Math.sin(th) * Rf * .03], [bx + Math.cos(th) * rr * .55, by + Math.sin(th) * rr * .55], [bx + Math.cos(th) * rr, by + Math.sin(th) * rr]],
        w: 4, bristles: 5, color, alpha: .9, dry: .3, profile: PROFILE.hair, speed: 2200, minDur: .06, start: t0 + i * .02 });
    }
    add({ pts: [[bx, by], [bx - Math.cos(dir) * 70 + 8, by - Math.sin(dir) * 70]], w: 5, color, alpha: .9, dry: .3, profile: PROFILE.taper, speed: 800, start: t0 });
  };
  fan(X(.7), 880, -1.8, 230, .95, C.ochre, T + .5);
  fan(X(.5), 700, -1.35, 210, 1.05, C.sumi, T + .9);
  fan(X(.08), 250, -.5, 150, .9, C.coral, T + 1.4);
  fan(X(.62), 1010, -1.3, 260, .9, C.sumi, T + 1.7);
  fan(X(.4), 420, -2.0, 140, .8, C.ochre, T + 2.0);

  // ── 5. cream crescents, bold, over the masses
  T = LT - .4;
  const crescent = (cx2, cy2, rr, a0, a1, w, t0) => {
    const pts = []; for (let i = 0; i <= 16; i++) { const a = lerp(a0, a1, i / 16); pts.push([cx2 + Math.cos(a) * rr, cy2 + Math.sin(a) * rr * .8]); }
    add({ pts, w: w + 9, bristles: 34, color: C.sumi, alpha: .95, dry: .2, ink: 3, grain: .5, profile: PROFILE.leaf, speed: 900, start: t0 });
    add({ pts, w, bristles: 30, color: C.cream, alpha: .97, dry: .08, ink: 3, grain: .4, profile: PROFILE.leaf, speed: 900, start: t0 + .08, blend: 'source-over' });
  };
  crescent(X(.42), 790, 250, Math.PI * 1.05, Math.PI * 1.75, 46, T);
  crescent(X(.64), 860, 190, Math.PI * 1.2, Math.PI * 1.95, 40, T + .25);
  crescent(X(.24), 720, 150, Math.PI * 1.1, Math.PI * 1.8, 32, T + .5);
  crescent(X(.82), 580, 140, Math.PI * .9, Math.PI * 1.6, 30, T + .7);
  crescent(X(.15), 330, 120, Math.PI * 1.6, Math.PI * 2.3, 28, T + .9);

  // ── 6. stipple on the rose mound and the maroon
  for (let i = 0; i < 260; i++) {
    const zone = i % 3 === 0 ? [X(.8), 880, X(.15), 90, C.cream] : [X(.46), 800, X(.24), 120, C.plum];
    const a = r() * TAU, d = Math.sqrt(r()), x = zone[0] + Math.cos(a) * d * zone[2], y = zone[1] + Math.sin(a) * d * zone[3];
    add({ pts: [[x, y], [x + 1.5, y + 1]], w: r.range(4, 7), bristles: 7, color: zone[4], alpha: .9, profile: PROFILE.tap, minDur: .05, start: T + .6 + r() * 1.6, blend: zone[4] === C.cream ? 'source-over' : 'multiply' });
  }

  // ── 7. plum blossom, boneless
  for (let j = 0; j < 9; j++) {
    const x = X(r.range(.15, .95)), y = r.range(120, 620), size = r.range(22, 32), base = r() * TAU, t0 = T + 1 + j * .14;
    for (let i = 0; i < 5; i++) {
      const a = base + i * TAU / 5, ca = Math.cos(a), sa = Math.sin(a);
      add({ pts: [[x + ca * size * .12, y + sa * size * .12], [x + ca * size * .5, y + sa * size * .5], [x + ca * size * .78, y + sa * size * .78]], wash: true, w: size * .72, color: r() < .5 ? C.verm : C.coral, alpha: .62, rim: 1.2, profile: PROFILE.petal, speed: 200, minDur: .1, start: t0 + i * .04 });
    }
    add({ pts: [[x, y], [x + 2, y + 1]], w: 6, bristles: 7, color: C.ochre, alpha: .95, profile: PROFILE.tap, minDur: .05, start: t0 + .25 });
  }

  // ── 8. tendrils let down from the top edge, the full width of the page
  const nT = Math.max(5, Math.round(W / 210));
  for (let j = 0; j < nT; j++) {
    const x0 = X((j + .5 + r.range(-.25, .25)) / nT), len = r.range(220, 560), pts = [], amp = r.range(5, 12), ph = r() * TAU, t0 = T + 1.4 + j * .16;
    for (let y = -10; y <= len; y += 40) pts.push([x0 + Math.sin(y / 95 + ph) * amp, y]);
    const color = j % 3 === 2 ? C.ochre : C.coral;
    const s = add({ pts, w: 3, bristles: 4, color, alpha: .92, dry: .15, ink: 3, profile: PROFILE.hair, speed: 600, start: t0, ease: .1 });
    let side = r.sign();
    for (let y = 60 + r() * 40; y < len - 20; y += r.range(80, 130)) {
      const x = x0 + Math.sin(y / 95 + ph) * amp, a = Math.PI / 2 + side * r.range(.6, 1.05), l = r.range(26, 40);
      add({ pts: [[x, y], [x + Math.cos(a) * l * .5 + side * 3, y + Math.sin(a) * l * .5], [x + Math.cos(a) * l, y + Math.sin(a) * l]],
        w: 14, color: j % 4 === 1 ? C.teal : color, alpha: .9, dry: .06, ink: 3, profile: PROFILE.leaf, speed: 320, minDur: .1, start: s.start + s.dur * ((y + 10) / (len + 10)) + .03 });
      side = -side;
    }
  }
  plan.end = Math.max(...S.map(s => s.end), ...WS.map(s => s.end));
  wet = WS;
  return S;
}

const scene = {
  fill: true, W, H, duration: 1, canvas: null,
  setSize(w, h) { W = scene.W = w; H = scene.H = h; wash.setSize(w, h); },
  resize(s) { wash.resize(s); bristles.resize(wash.canvas.width, wash.canvas.height, s); },
  reset(seed) {
    wash.reset();
    const S = compose(seed);
    // laying out every bristle takes a moment (~0.15 s); a replay of the same page reuses it
    const key = `${seed}:${W}x${H}`;
    if (key !== laid) { bristles.load(S); laid = key; }
    scene.duration = plan.end + 1.2;
  },
  step(t0, t1) { for (const s of wet) s.emit(wash, t0, t1); wash.step(); },
  render(t) { wash.render(); bristles.render(wash.ctx.getCurrentTexture().createView(), t); },
  settle: () => wash.settle(),
};
if (dev) {
  wash = new Wash(dev, { W, H, res: .75, params: { inkScale: 1, theta: .3, mob: .6, kFlow: .2, edge: 4, evap: .0009, gran: .6, rim: .12 } });
  bristles = new Bristles(dev, wash.format);
  scene.canvas = wash.canvas; scene.wash = wash; scene.bristles = bristles;   // for poking at from devtools
  run(scene);
} else document.querySelector('.stage').textContent = 'This plate needs WebGPU.';
