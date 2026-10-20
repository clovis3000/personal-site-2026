// 14 Byōbu — the page painted out to every edge, no white left: a six-fold screen. First a wet ground, dark,
// in broad sweeps that bloom and granulate; then, as the Rinpa painters did, gold leaf laid early, a moon and
// two bands of cloud; then body colour over it in broad, dry, chalky strokes, layer over layer: mounds, a
// fingerprint orb, ferns, crescents, fans in shell gold, tendrils let down over everything. The screen folds,
// so each panel takes the light its own way, and the gold flashes panel by panel as the light moves.
import { run } from '../../shared/runner.js';
import { device, Wash, WetStroke } from '../../shared/wash.js';
import { Stroke, PROFILE } from '../../shared/brush.js';
import { Bristles } from '../../shared/bristles.js';
import { kit, hex } from '../../shared/ornament.js';
import { lamp } from '../../shared/lamp.js';
import { rng, lerp, clamp, noise1, TAU } from '../../shared/util.js';

const ABS = (h, k = 1) => hex(h).map(v => -Math.log(Math.max(6, v) / 255) * k);
const C = {
  sumi: hex('#171414'), cream: hex('#f0e4c4'), pink: hex('#d49a94'), maroon: hex('#6c2638'), verm: hex('#d8452b'),
  teal: hex('#2a8a7d'), deep: hex('#1d5c55'), coral: hex('#e2876f'), ochre: hex('#d7a03a'), plum: hex('#4b1d33'),
  rose: hex('#b8616c'), ink: hex('#1c1917'),
};

let W = 1600, H = 1000, wash, bristles, wet = [], plan = {}, laid = '', light;
const dev = await device();

function compose(seed) {
  const r = rng(seed), S = [], WS = []; let id = 0;
  const add = o => { const s = new Stroke({ seed: seed * 7919 + ++id, blend: 'source-over', ...o }); S.push(s); return s; };
  const wetAdd = o => { const s = new WetStroke({ seed: seed * 313 + WS.length, ...o }); WS.push(s); return s; };
  const K = kit(add, r), { fill, disc } = K;
  const X = u => u * W;

  // ── 1. the ground: wet sweeps edge to edge, overlapping well past each other, dark and warm, then a second
  // pass of deeper colour laid into it while it's wet, to bloom
  const rows = 9;
  for (let i = 0; i < rows; i++) {
    const y = -50 + i * (H + 100) / (rows - 1) + r.range(-15, 15), pts = [];
    for (let x = -120; x <= W + 120; x += 160) pts.push([x, y + Math.sin(x / 300 + i) * 22]);
    if (i % 2) pts.reverse();
    const col = ['#6a5560', '#62525b', '#5a4f55', '#544e52', '#4e4d50', '#4a4e50', '#474f50', '#454d4e', '#434a4c'][i];
    wetAdd({ pts, w: 240, col: ABS(col, 1), water: 1.5, pig: .55, ink: 99, dry: 0, flying: .04, speed: 2300, dwell: .02, ease: .2, profile: PROFILE.blunt, start: .05 + i * .16 });
  }
  for (let j = 0; j < 7; j++) {
    const x0 = X(r.range(-.05, 1)), y0 = r.range(80, H - 80), a = r.range(-.5, .5), l = r.range(300, 600);
    const col = ['#7a3a5a', '#2f6060', '#6a4a30', '#35304a'][j % 4];
    wetAdd({ pts: [[x0, y0], [x0 + Math.cos(a) * l * .5, y0 + Math.sin(a) * l * .5 + 30], [x0 + Math.cos(a) * l, y0 + Math.sin(a) * l]], w: r.range(120, 220), col: ABS(col, 1), water: 2.4, pig: .6, ink: 99, dry: 0, flying: .1, speed: 1400, dwell: .08, ease: .3, profile: PROFILE.leaf, start: 1.1 + j * .12 });
  }

  // ── 2. gold first, as on a screen: a moon, and two bands of cloud with stepped, rounded ends
  let T = 1.9;
  disc(X(.8), 250, 168, C.ink, T, { gold: true, outline: false });
  const cloud = (x0, x1, y, t0) => {
    // a band built of stacked bars, each a little shorter or longer than the last: the stepped edge
    const n = 4, th = 34;
    for (let i = 0; i < n; i++) {
      const yy = y + (i - (n - 1) / 2) * th * .82, a = x0 + r.range(-60, 90) * (i % 2 ? 1 : .4), b = x1 - r.range(-40, 120) * (i % 2 ? .5 : 1);
      fill([[a, yy], [b, yy]], th, C.ink, t0 + i * .08, { gold: true, outline: false, profile: PROFILE.flat, speed: 1800, ease: .3 });
      // lobes swelling off the band's ends and edges: the cloud's scalloped outline
      for (const [x, k] of [[a + th * .2, -1], [b - th * .2, 1]]) disc(x, yy + k * th * .1 * (i % 2 ? 1 : -1), th * r.range(.62, .78), C.ink, t0 + i * .08 + .15, { gold: true, outline: false });
    }
    for (let j = 0; j < 3; j++) disc(lerp(x0, x1, r.range(.15, .85)), y + r.sign() * th * 1.5, th * r.range(.5, .7), C.ink, t0 + .3 + j * .05, { gold: true, outline: false });
  };
  cloud(X(-.05), X(.56), 110, T + .2);
  cloud(X(.38), X(1.05), H - 190, T + .45);
  cloud(X(.62), X(1.04), 520, T + .7);

  // ── 3. masses in body colour: broad dry brushes, chalky where the tooth catches, the dark showing through
  T = 2.9;
  const mass = (cx, cy, rx, ry, rot, color, t0, o = {}) => {
    const n = Math.max(3, Math.round(ry / 55)), w = ry * 2 / n * 1.55, ca = Math.cos(rot), sa = Math.sin(rot), ph = r() * 99;
    const P = (u, v) => [cx + u * ca - v * sa, cy + u * sa + v * ca];
    for (let i = 0; i < n; i++) {
      const v = ((i + .5) / n * 2 - 1) * .9, half = rx * Math.sqrt(1 - v * v) * (.9 + .25 * noise1(i * .7 + ph, 2)) + w * .6;
      // each pass bows with the mass's own curve and lifts off at both ends, as a loaded flat brush does
      const bow = ry * .16 * (1 - Math.abs(v));
      const pts = [P(-half, v * ry + bow), P(-half * .45, v * ry - bow * .4), P(half * .4, v * ry - bow * .5 + r.range(-10, 10)), P(half, v * ry + bow * .8)];
      if (i % 2) pts.reverse();
      add({ pts, w, bristles: Math.round(w * .7), color, alpha: .97, dry: .07, ink: 5, grain: .4, wobble: .05, profile: u => Math.sin(Math.PI * clamp(u)) ** .45, speed: 1500, ease: .25, start: t0 + i * .07, ...o });
    }
  };
  mass(X(.48), 860, X(.3), 190, -.04, C.pink, T);
  mass(X(.16), 640, X(.12), 300, .1, C.verm, T + .3);
  mass(X(.78), 930, X(.2), 150, .06, C.maroon, T + .5);
  mass(X(.33), 740, X(.1), 110, -.25, C.sumi, T + .7);
  mass(X(.92), 420, X(.08), 230, -.08, C.rose, T + .85);
  // striations dragged through the maroon and the pink while they're 'wet': a dry rake of a darker tone
  const rake = (cx, cy, rx, ry, color, t0, n = 12) => {
    for (let i = 0; i < n; i++) {
      const v = (i + .5) / n * 2 - 1, half = rx * Math.sqrt(1 - v * v) * .9, y = cy + v * ry * .8;
      add({ pts: [[cx - half, y + 10], [cx, y - 12], [cx + half, y + 8]], w: 5, bristles: 4, color, alpha: .9, dry: .35, ink: 2, grain: .5, profile: PROFILE.taper, speed: 1300, start: t0 + i * .04 });
    }
  };
  rake(X(.78), 930, X(.2), 150, C.plum, T + 1.1, 10);
  rake(X(.48), 860, X(.28), 180, C.rose, T + 1.2, 14);

  // ── 4. the fingerprint orb: rings outside in, black and cream by turns, each wavering its own way
  T = 4.3;
  const ox = X(.42), oy = 360, OR = 205;
  disc(ox, oy, OR + 6, C.sumi, T - .2, { outline: false });
  for (let k = 0; k < 22; k++) {
    const rr = OR * (1 - k / 23), pts = [], ph = r() * TAU, f = r.int(4, 8);
    for (let i = 0; i <= 80; i++) {
      const a = i / 80 * TAU + ph, wob = Math.sin(a * f + k * .9) * 5 + (noise1(i * .25 + k * 13, 4) - .5) * 9;
      const q = clamp(rr + wob, 2, OR);
      pts.push([ox + Math.cos(a) * q, oy + Math.sin(a) * q]);
    }
    add({ pts, w: 4.6, bristles: 4, color: C.cream, alpha: .95, dry: .3, ink: 1.6, grain: .6, profile: PROFILE.flat, speed: 2600, start: T + k * .05, ease: .2 });
  }

  // ── 5. ferns, striated rib by rib in teal, up from the bottom edge and in from the sides
  T = 5.0;
  const fern = (bx, by, ang, len, wid, color, t0, bend = .25) => {
    const mid = [], m = 18, sd = r.sign();
    for (let i = 0; i <= m; i++) { const u = i / m, a = ang + bend * u * u * sd; mid.push([bx + Math.cos(a) * len * u, by + Math.sin(a) * len * u]); }
    add({ pts: mid, w: 6, color, alpha: .95, dry: .25, profile: PROFILE.taper, speed: 1500, start: t0 });
    let t = t0 + .1;
    for (let i = 2; i < m * 5; i++) {
      const u = i / (m * 5), k = Math.min(m - 1, Math.floor(u * m)), f = u * m - k;
      const px = lerp(mid[k][0], mid[k + 1][0], f), py = lerp(mid[k][1], mid[k + 1][1], f);
      const tx = mid[k + 1][0] - mid[k][0], ty = mid[k + 1][1] - mid[k][1], tl = Math.hypot(tx, ty);
      const hw = wid * Math.sin(Math.PI * u ** .7) * (.85 + .3 * noise1(i * .4, 3));
      for (const side of [-1, 1]) {
        const nx = -ty / tl * side, ny = tx / tl * side, fx = tx / tl, fy = ty / tl;
        const ex = px + nx * hw + fx * hw * .55, ey = py + ny * hw + fy * hw * .55;
        add({ pts: [[px, py], [lerp(px, ex, .5) + nx * hw * .06, lerp(py, ey, .5) + ny * hw * .06], [ex, ey]], w: 4.2, bristles: 5, color, alpha: .92, dry: .3, ink: 1.4, grain: .5, profile: PROFILE.taper, speed: 1900, minDur: .05, start: t });
      }
      t += .011;
    }
  };
  fern(X(.02), H + 20, -1.15, 720, 105, C.teal, T);
  fern(X(.6), H + 30, -1.75, 600, 90, C.deep, T + .3);
  fern(X(1.02), 640, Math.PI + .5, 520, 80, C.teal, T + .55);
  fern(X(.25), -20, 1.25, 380, 64, C.deep, T + .8);
  fern(X(.7), -30, 2.05, 560, 92, C.teal, T + 1.0, -.3);

  // ── 6. cream crescents, bold, a black underlay first so they sit in a shadow of their own
  T = 6.1;
  const crescent = (cx, cy, rr, a0, a1, w, t0) => {
    const pts = []; for (let i = 0; i <= 18; i++) { const a = lerp(a0, a1, i / 18); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * .8]); }
    add({ pts, w: w + 10, bristles: 36, color: C.sumi, alpha: .96, dry: .15, ink: 3, grain: .5, profile: PROFILE.leaf, speed: 950, start: t0 });
    add({ pts, w, bristles: 32, color: C.cream, alpha: .98, dry: .1, ink: 3, grain: .5, profile: PROFILE.leaf, speed: 950, start: t0 + .08 });
  };
  crescent(X(.45), 830, 260, Math.PI * 1.05, Math.PI * 1.72, 50, T);
  crescent(X(.7), 880, 180, Math.PI * 1.15, Math.PI * 1.9, 40, T + .25);
  crescent(X(.2), 560, 160, Math.PI * 1.55, Math.PI * 2.2, 34, T + .45);
  crescent(X(.88), 360, 130, Math.PI * .85, Math.PI * 1.55, 30, T + .6);

  // ── 7. fans in shell gold: ginkgo, striated, so the light runs along their ribs
  T = 6.9;
  const fan = (bx, by, dir, Rf, ha, t0) => {
    const m = 30;
    for (let i = 0; i < m; i++) {
      const f = i / (m - 1) * 2 - 1, th = dir + f * ha, rr = Rf * (1 - .18 * Math.exp(-((f / .1) ** 2))) * r.range(.94, 1);
      add({ pts: [[bx + Math.cos(th) * Rf * .05, by + Math.sin(th) * Rf * .05], [bx + Math.cos(th) * rr * .55, by + Math.sin(th) * rr * .55], [bx + Math.cos(th) * rr, by + Math.sin(th) * rr]],
        w: 5.5, bristles: 5, gold: true, color: C.ochre, alpha: .95, dry: .25, profile: PROFILE.hair, speed: 2200, minDur: .06, start: t0 + i * .018 });
    }
  };
  fan(X(.9), H + 10, -1.85, 250, .95, T);
  fan(X(.06), 300, -.4, 170, .85, T + .3);
  fan(X(.57), 610, -1.4, 160, .9, T + .55);

  // ── 8. stipple: cream on the pink, gold seeds on the maroon
  T = 7.6;
  for (let i = 0; i < 300; i++) {
    const z = i % 3 === 0 ? [X(.78), 920, X(.15), 100, true] : [X(.48), 830, X(.24), 130, false];
    const a = r() * TAU, d = Math.sqrt(r()), x = z[0] + Math.cos(a) * d * z[2], y = z[1] + Math.sin(a) * d * z[3];
    add({ pts: [[x, y], [x + 1.5, y + 1]], w: r.range(4, 7), bristles: 7, color: z[4] ? C.ochre : C.cream, gold: z[4], alpha: .92, profile: PROFILE.tap, minDur: .05, start: T + r() * 1.4 });
  }

  // ── 9. tendrils let down from the top edge over everything, the page's full width, leaves on them
  T = 8.0;
  const nT = Math.max(6, Math.round(W / 190));
  for (let j = 0; j < nT; j++) {
    const x0 = X((j + .5 + r.range(-.3, .3)) / nT), len = r.range(280, 720), pts = [], amp = r.range(5, 14), ph = r() * TAU, t0 = T + j * .12;
    for (let y = -10; y <= len; y += 40) pts.push([x0 + Math.sin(y / 95 + ph) * amp, y]);
    const s = add({ pts, w: 3.4, bristles: 4, color: C.coral, alpha: .95, dry: .12, ink: 3, profile: PROFILE.hair, speed: 700, start: t0, ease: .1 });
    let side = r.sign();
    for (let y = 70 + r() * 40; y < len - 20; y += r.range(90, 140)) {
      const x = x0 + Math.sin(y / 95 + ph) * amp, a = Math.PI / 2 + side * r.range(.6, 1.05), l = r.range(28, 44);
      add({ pts: [[x, y], [x + Math.cos(a) * l * .5 + side * 3, y + Math.sin(a) * l * .5], [x + Math.cos(a) * l, y + Math.sin(a) * l]],
        w: 16, color: C.coral, alpha: .95, dry: .06, ink: 3, profile: PROFILE.leaf, speed: 320, minDur: .1, start: s.start + s.dur * ((y + 10) / (len + 10)) + .03 });
      side = -side;
    }
  }

  plan.end = Math.max(...S.map(s => s.end), ...WS.map(s => s.end));
  wet = WS;
  return S;
}

const scene = {
  fill: true, W, H, duration: 1, canvas: null, live: true,
  setSize(w, h) { W = scene.W = w; H = scene.H = h; wash.setSize(w, h); },
  resize(s) { wash.resize(s); bristles.resize(wash.canvas.width, wash.canvas.height, s); },
  reset(seed) {
    wash.reset();
    const S = compose(seed), key = `${seed}:${W}x${H}`;
    if (key !== laid) { bristles.load(S); laid = key; }
    bristles.page = [W, H]; bristles.folds = Math.max(2, Math.round(W / H * 3.75)); bristles.foldTilt = .2; bristles.leaf = 30;
    scene.duration = plan.end + 1;
  },
  step(t0, t1) { for (const s of wet) s.emit(wash, t0, t1); wash.step(); },
  render(t) { bristles.light = light(t); wash.render(); bristles.render(wash.ctx.getCurrentTexture().createView(), t); },
  settle: () => wash.settle(),
};
if (dev) {
  wash = new Wash(dev, { W, H, res: .6, params: { inkScale: 1, theta: .2, mob: .7, kFlow: .2, edge: 3, evap: .0011, gran: .8, rim: .12 } });
  bristles = new Bristles(dev, wash.format);
  scene.canvas = wash.canvas; scene.wash = wash; scene.bristles = bristles;
  light = lamp(scene, { z: 520 });
  run(scene);
} else document.querySelector('.stage').textContent = 'This plate needs WebGPU.';
