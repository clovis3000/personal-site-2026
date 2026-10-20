// 04 Meander — after Harold Fisk's 1944 maps of the Mississippi's former courses. A river is simulated
// (meander.js); each of its past courses is then painted down the valley as a watercolour ribbon on the
// GPU wash, oldest first, with its swatch going into the key as it is laid. Oxbows pinch off in blue.
// The map's apparatus (neat line, graticule, key, scale, the live channel's banks) is drawn crisp on top.
import { run } from '../../shared/runner.js';
import { device, Wash, WetStroke } from '../../shared/wash.js';
import { PROFILE } from '../../shared/brush.js';
import { simulate } from './meander.js';
import { smooth, lerp, clamp } from '../../shared/util.js';

const W = 1600, H = 1000;
const F = { x: 300, y: 30, w: 800, h: 940 };
const PAL = ['#e9a3a0', '#f0c27a', '#a8cf8e', '#9cc3e4', '#c9a6d8', '#e98a6a', '#d9d27a', '#7fbfb0', '#e7b3c9', '#b0b8e8'];
const ABS = hex => [1, 3, 5].map(i => -Math.log(Math.max(8, parseInt(hex.slice(i, i + 2), 16)) / 255));
const OX = ABS('#3d6fb0');
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const MUTED = 'rgba(120,126,136,1)', INK = '#1a1816', BLUE = 'rgba(110,160,210,';

const cache = new Map();
const sim = seed => cache.get(seed) || cache.set(seed, simulate(seed, { xmin: F.x + 40, xmax: F.x + F.w - 40, y0: F.y + 2, y1: F.y + F.h - 2 })).get(seed);

const dev = await device();
let wash, model, strokes = [], timing = {}, scale = 1;
const ov = document.createElement('canvas'), o = ov.getContext('2d');
const KEY = { x: 1180, y: 300, row: 30 };

function compose(seed) {
  model = sim(seed);
  const S = [], C = model.courses, every = model.P.every;
  const thin = pts => pts.filter((_, i) => i % 3 === 0 || i === pts.length - 1);
  const cStart = i => 1.1 + i * .72;
  C.forEach((c, i) => {
    const col = ABS(PAL[i % PAL.length]);
    // paint only where this course differs from the next; a reach that never moved is painted once, by the youngest
    const next = C[i + 1], cell = 8, grid = new Set();
    if (next) for (const [px, py] of next.pts) grid.add(`${Math.floor(px / cell)},${Math.floor(py / cell)}`);
    const near = ([px, py]) => { const gx = Math.floor(px / cell), gy = Math.floor(py / cell); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (grid.has(`${gx + a},${gy + b}`)) return true; return false; };
    let run = [];
    const flush = k => {
      if (run.length >= 6) S.push(new WetStroke({ pts: thin(run), w: 19, col, water: .7, pig: .6, ink: 99, dry: 0, flying: 0, speed: 1700, dwell: 0, ease: 0, profile: PROFILE.flat,
        start: cStart(i) + (k - run.length) * model.P.ds / 1700, seed: seed * 31 + i * 101 + k }));
      run = [];
    };
    c.pts.forEach((p, k) => { if (next && near(p)) flush(k); else run.push(p); });
    flush(c.pts.length);
    // the key's swatch, laid with the same brush at the same moment
    const ky = KEY.y + i * KEY.row;
    S.push(new WetStroke({ pts: [[KEY.x, ky], [KEY.x + 40, ky]], w: 15, col, water: .9, pig: .62, ink: 99, flying: 0, speed: 160, dwell: 0, profile: PROFILE.flat, start: cStart(i) + .05, seed: seed * 37 + i }));
  });
  model.oxbows.forEach((ob, j) => {
    const i = Math.min(C.length - 1, Math.floor(ob.at / every) + 1);
    S.push(new WetStroke({ pts: thin(ob.pts), w: 9, col: OX, water: .8, pig: .55, ink: 99, flying: 0, speed: 900, dwell: 0, profile: PROFILE.hair, start: cStart(i) + .5 + j * .1, seed: seed * 41 + j }));
  });
  const oy = KEY.y + C.length * KEY.row + 14;
  S.push(new WetStroke({ pts: [[KEY.x + 4, oy], [KEY.x + 36, oy]], w: 8, col: OX, water: .8, pig: .55, ink: 99, flying: 0, speed: 120, dwell: 0, profile: PROFILE.hair, start: cStart(C.length - 1) + .6, seed: 77 }));
  timing = { courses: C.length, cStart, inkEnd: Math.max(...S.map(s => s.end)) };
  timing.chan = timing.inkEnd + .1;
  return S;
}

// crisp apparatus, drawn on top in 2D
function overlay(t) {
  o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, ov.width, ov.height); o.setTransform(scale, 0, 0, scale, 0, 0);
  if (!dev) { o.fillStyle = MUTED; o.font = '14px Helvetica'; o.fillText('This study needs WebGPU.', 40, 60); return; }
  const seg = (x0, y0, x1, y1, k, w = .8, col = INK) => { if (k <= 0) return; o.lineWidth = w; o.strokeStyle = col; o.beginPath(); o.moveTo(x0, y0); o.lineTo(lerp(x0, x1, k), lerp(y0, y1, k)); o.stroke(); };
  const text = (s, x, y, k, { size = 10, track = .12, align = 'left', col = MUTED, weight = 400 } = {}) => {
    if (k <= 0) return; const n = Math.ceil(s.length * k);
    o.font = `${weight} ${size}px "Helvetica Neue",Helvetica,Arial,sans-serif`; o.letterSpacing = `${track * size}px`; o.textAlign = align; o.fillStyle = col; o.fillText(s.slice(0, n), x, y); o.letterSpacing = '0px';
  };
  // neat line, double, then graticule ticks
  const { x, y, w, h } = F;
  const k1 = smooth(0, .9, t);
  seg(x, y, x + w, y, k1, 1.2); seg(x + w, y, x + w, y + h, k1, 1.2); seg(x + w, y + h, x, y + h, k1, 1.2); seg(x, y + h, x, y, k1, 1.2);
  const k2 = smooth(.2, 1.1, t), d = 6;
  seg(x - d, y - d, x + w + d, y - d, k2, .5); seg(x + w + d, y - d, x + w + d, y + h + d, k2, .5); seg(x + w + d, y + h + d, x - d, y + h + d, k2, .5); seg(x - d, y + h + d, x - d, y - d, k2, .5);
  for (let i = 1; i < 8; i++) {
    const gx = x + i * w / 8, k = smooth(.5 + i * .04, .7 + i * .04, t);
    seg(gx, y - d, gx, y - d - 8 * k, 1, .6); seg(gx, y + h + d, gx, y + h + d + 8 * k, 1, .6);
    if (i % 2 === 0) text(`91°${String(i * 5).padStart(2, '0')}′`, gx, y + h + d + 22, smooth(.8, 1.2, t), { align: 'center', size: 9 });
  }
  for (let i = 1; i < 9; i++) {
    const gy = y + i * h / 9, k = smooth(.5 + i * .04, .7 + i * .04, t);
    seg(x - d, gy, x - d - 8 * k, gy, 1, .6); seg(x + w + d, gy, x + w + d + 8 * k, gy, 1, .6);
    if (i % 2 === 1) text(`32°${String(50 - i * 5).padStart(2, '0')}′`, x - d - 14, gy + 3, smooth(.8, 1.2, t), { align: 'right', size: 9 });
  }
  // key
  text('MEANDER BELT', KEY.x, KEY.y - 92, smooth(.6, 1.4, t), { size: 13, track: .22, col: INK, weight: 600 });
  text('former courses of the channel, oldest first', KEY.x, KEY.y - 70, smooth(.9, 1.8, t), { size: 10, track: .04 });
  seg(KEY.x, KEY.y - 46, KEY.x + 300, KEY.y - 46, smooth(.9, 1.6, t), .6);
  for (let i = 0; i < timing.courses; i++) {
    const ky = KEY.y + i * KEY.row, ts = timing.cStart(i);
    text(`course ${ROMAN[i]}`, KEY.x + 58, ky + 4, smooth(ts + .1, ts + .5, t), { size: 10, track: .06, col: INK });
    text(i === timing.courses - 1 ? 'youngest' : `${(timing.courses - 1 - i) * 40} yr before`, KEY.x + 300, ky + 4, smooth(ts + .2, ts + .6, t), { size: 9, align: 'right' });
  }
  const oy = KEY.y + timing.courses * KEY.row + 14, to = timing.cStart(timing.courses - 1) + .6;
  text('oxbow lake', KEY.x + 58, oy + 4, smooth(to, to + .4, t), { size: 10, track: .06, col: INK });
  const cy = oy + KEY.row, tc = timing.chan;
  seg(KEY.x + 2, cy - 3, KEY.x + 38, cy - 3, smooth(tc, tc + .3, t), .9, '#16304f'); seg(KEY.x + 2, cy + 3, KEY.x + 38, cy + 3, smooth(tc, tc + .3, t), .9, '#16304f');
  text('channel today', KEY.x + 58, cy + 4, smooth(tc, tc + .4, t), { size: 10, track: .06, col: INK });
  // scale bar & north
  const sy = cy + 70, kb = smooth(tc + .3, tc + .9, t);
  if (kb > 0) {
    for (let i = 0; i < 4; i++) { o.fillStyle = i % 2 ? '#fff' : INK; o.strokeStyle = INK; o.lineWidth = .7; const bw = 40 * Math.min(1, kb * 4 - i); if (bw > 0) { o.fillRect(KEY.x + i * 40, sy, bw, 5); o.strokeRect(KEY.x + i * 40, sy, bw, 5); } }
    text('0', KEY.x, sy + 20, kb, { size: 9, align: 'center' }); text('2 miles', KEY.x + 160, sy + 20, kb, { size: 9, align: 'center' });
    const nx = KEY.x + 280, ny = sy - 6;
    o.fillStyle = INK; o.beginPath(); o.moveTo(nx, ny - 26 * kb); o.lineTo(nx + 7, ny); o.lineTo(nx, ny - 6); o.closePath(); o.fill();
    o.lineWidth = .7; o.beginPath(); o.moveTo(nx, ny - 26 * kb); o.lineTo(nx - 7, ny); o.lineTo(nx, ny - 6); o.stroke();
    text('N', nx, ny - 32, kb, { size: 9, align: 'center', col: INK });
  }
  // the channel today: two banks, traced down the valley
  const kc = smooth(tc, tc + 1.4, t);
  if (kc > 0) {
    const P = model.final, n = Math.max(2, Math.floor(P.length * kc));
    for (const side of [-1, 1]) {
      o.beginPath();
      for (let i = 0; i < n; i++) {
        const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
        const px = P[i][0] - dy / l * 4.5 * side, py = P[i][1] + dx / l * 4.5 * side;
        i ? o.lineTo(px, py) : o.moveTo(px, py);
      }
      o.lineWidth = .9; o.strokeStyle = '#16304f'; o.stroke();
    }
  }
  text('PL. 04', x, y - 14, smooth(.3, .8, t), { size: 9, track: .2 });
}

const scene = {
  W, H, duration: 1, canvas: ov, layers: [ov],
  resize(s) { scale = s; ov.width = Math.round(W * s); ov.height = Math.round(H * s); wash?.resize(s); },
  reset(seed) {
    wash?.reset(); strokes = compose(seed);
    scene.duration = timing.chan + 2.4;
  },
  step(t0, t1) { if (!wash) return; for (const s of strokes) s.emit(wash, t0, t1); wash.step(); },
  render(t) { wash?.render(); overlay(t); },
  settle: () => wash?.settle(),
};
if (dev) {
  wash = new Wash(dev, { W, H, res: 1, params: { inkScale: 1, theta: .5, mob: .45, edge: 5, evap: .0012, gran: .35 } });
  scene.canvas = wash.canvas; scene.layers = [wash.canvas, ov];
}
run(scene);
