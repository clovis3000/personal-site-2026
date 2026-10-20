// 02 Sumi — 永, the character calligraphy teachers use because its five strokes hold all eight
// principles (永字八法). The practice grid goes down first in non-photo blue, the ink goes on wet and
// bleeds into the fibre while it dries, then the eight principles are labelled like a technical plate.
import { run } from '../../shared/runner.js';
import { device, Wash, WetStroke } from '../../shared/wash.js';
import { Stamp, PROFILE } from '../../shared/brush.js';
import { clamp, smooth, lerp } from '../../shared/util.js';

const W = 1600, H = 1000;
const B = { x: 480, y: 150, s: 660 };
const U = ([u, v]) => [B.x + u * B.s, B.y + v * B.s];
const BLUE = 'rgba(110,160,210,', MUTED = '#8a8f98';
const SUMI = [1, 1.03, 1.08];

const P = {
  dot: u => Math.sin(Math.PI * (.3 + .7 * u)) ** .4 * (.7 + .3 * u),
  na: u => (.25 + .75 * smooth(0, .82, u)) * (1 - smooth(.86, 1, u) * .92),   // 磔: thin entry, swelling, cut away
  ...PROFILE,
};

// [principle no., kanji, reading, gloss, anchor (unit coords), side]
const EIGHT = [
  [1, '側', 'soku', 'the dot', [.515, .1], -1],
  [2, '勒', 'roku', 'horizontal', [.42, .248], -1],
  [3, '努', 'do', 'vertical', [.565, .56], 1],
  [4, '趯', 'teki', 'hook', [.5, .83], 1],
  [5, '策', 'saku', 'rising stroke', [.34, .43], -1],
  [6, '掠', 'ryaku', 'long sweep left', [.25, .665], -1],
  [7, '啄', 'taku', 'short sweep left', [.72, .425], 1],
  [8, '磔', 'taku', 'sweep right', [.85, .7], 1],
];

function compose(seed) {
  const S = [], s = B.s;
  let T = 1.25;
  const add = (pts, o) => { const st = new WetStroke({ pts: pts.map(U), col: SUMI, seed: seed * 101 + S.length, start: T, ...o }); S.push(st); T = st.end + (o.gap ?? .28); return st; };
  // 1 側
  add([[.475, .055], [.52, .1], [.55, .148]], { w: .085 * s, profile: P.dot, speed: 260, dwell: .2, water: 1.3, pig: 1.5, gap: .4 });
  // 2 勒 努 趯 — one stroke, three movements: across, press at the corner, down, press, kick
  add([[.31, .262], [.43, .25], [.565, .238]], { w: .056 * s, profile: P.blunt, speed: 560, dwell: .12, water: 1, pig: 1.3, gap: 0 });
  add([[.56, .236], [.568, .5], [.562, .862]], { w: .07 * s, profile: P.blunt, speed: 520, dwell: .16, water: 1, pig: 1.3, ink: 1.4, gap: 0 });
  add([[.562, .862], [.525, .835], [.47, .79]], { w: .062 * s, profile: P.taper, speed: 900, dwell: .14, water: .9, pig: 1.2, flying: .6, gap: .42 });
  // 3 策 掠
  add([[.24, .45], [.35, .428], [.44, .408]], { w: .05 * s, profile: P.blunt, speed: 600, dwell: .1, water: 1, pig: 1.3, gap: 0 });
  add([[.44, .405], [.39, .5], [.3, .62], [.15, .755]], { w: .064 * s, profile: P.taper, speed: 820, dwell: .12, water: 1, pig: 1.25, flying: .7, ink: 1.5, gap: .38 });
  // 4 啄
  add([[.81, .325], [.73, .42], [.625, .5]], { w: .056 * s, profile: P.taper, speed: 950, dwell: .1, water: .9, pig: 1.2, flying: .6, gap: .3 });
  // 5 磔
  add([[.615, .47], [.71, .585], [.83, .7], [.965, .79]], { w: .12 * s, profile: P.na, speed: 520, dwell: .1, water: 1.15, pig: 1.35, ink: 1.6, gap: 0 });
  return S;
}

const dev = await device();
let wash, scene;
const ov = document.createElement('canvas'), o = ov.getContext('2d');
let strokes = [], inkEnd = 0, scale = 1;
const seal = new Stamp({ x: B.x + B.s + 34, y: B.y + B.s - 46, size: 40, glyph: '法', seed: 9 });

function overlay(t) {
  o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, ov.width, ov.height); o.setTransform(scale, 0, 0, scale, 0, 0);
  if (!dev) { o.fillStyle = MUTED; o.font = '14px Helvetica'; o.fillText('This study needs WebGPU.', 40, 60); return; }
  // practice grid: frame, then cross, then diagonals (dashed), each drawn in
  const line = (x0, y0, x1, y1, a, b, w, dash) => {
    const k = smooth(a, b, t); if (k <= 0) return;
    o.setLineDash(dash || []); o.lineWidth = w; o.strokeStyle = BLUE + '.75)';
    o.beginPath(); o.moveTo(x0, y0); o.lineTo(lerp(x0, x1, k), lerp(y0, y1, k)); o.stroke();
  };
  const { x, y, s } = B, m = s / 2;
  line(x, y, x + s, y, .05, .45, 1.2); line(x + s, y, x + s, y + s, .2, .6, 1.2);
  line(x + s, y + s, x, y + s, .35, .75, 1.2); line(x, y + s, x, y, .5, .9, 1.2);
  line(x + m, y, x + m, y + s, .6, 1.0, .8, [7, 7]); line(x, y + m, x + s, y + m, .7, 1.1, .8, [7, 7]);
  line(x, y, x + s, y + s, .8, 1.2, .7, [3, 6]); line(x + s, y, x, y + s, .85, 1.25, .7, [3, 6]);
  o.setLineDash([]);
  // the eight principles, numbered in order, after the ink has gone down
  EIGHT.forEach(([n, kj, rd, gl, a, side], i) => {
    const t0 = inkEnd + .5 + i * .2, k = smooth(t0, t0 + .45, t), kt = smooth(t0 + .3, t0 + .7, t);
    if (k <= 0) return;
    const [ax, ay] = U(a), cx = side < 0 ? x - 60 : x + s + 60, ex = lerp(ax, cx, k);
    o.strokeStyle = BLUE + '.9)'; o.fillStyle = BLUE + '.9)'; o.lineWidth = .9;
    o.beginPath(); o.arc(ax, ay, 4.5 * Math.min(1, k * 3), 0, Math.PI * 2); o.stroke();
    o.beginPath(); o.moveTo(ax + side * 4.5, ay); o.lineTo(ex, ay); o.stroke();
    if (kt <= 0) return;
    o.globalAlpha = kt; o.textBaseline = 'alphabetic';
    const tx = cx + side * 12;
    o.textAlign = side < 0 ? 'right' : 'left';
    o.fillStyle = '#1a1816'; o.font = '500 30px "Hiragino Mincho ProN","Yu Mincho",serif'; o.fillText(kj, tx, ay + 10);
    const kw = o.measureText(kj).width;
    o.fillStyle = 'rgba(110,160,210,1)'; o.font = '600 12px "Helvetica Neue",Helvetica,Arial,sans-serif';
    o.fillText(String(n), tx + side * (kw + 10), ay + 4);
    o.fillStyle = MUTED; o.font = '11px "Helvetica Neue",Helvetica,Arial,sans-serif';
    o.fillText(`${rd} — ${gl}`, tx, ay + 28);
    o.globalAlpha = 1;
  });
  if (t >= seal.start) seal.draw(o);
}

scene = {
  W, H, duration: 1, canvas: ov, layers: [ov],
  resize(s) { scale = s; ov.width = Math.round(W * s); ov.height = Math.round(H * s); wash?.resize(s); },
  reset(seed) {
    wash?.reset(); strokes = compose(seed);
    inkEnd = Math.max(...strokes.map(s => s.end));
    seal.start = inkEnd + .5 + 8 * .2 + .5;
    scene.duration = seal.start + .6;
  },
  step(t0, t1) { if (!wash) return; for (const s of strokes) s.emit(wash, t0, t1); wash.step(); },
  render(t) { wash?.render(); overlay(t); },
  settle: () => wash?.settle(),
};
if (dev) {
  wash = new Wash(dev, { W, H, res: 1, params: { inkScale: 1.7, theta: .26, mob: .45 } });
  scene.canvas = wash.canvas; scene.layers = [wash.canvas, ov];
}
run(scene);
