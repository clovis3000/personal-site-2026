// 13 Folio — 10 and 12 together: a text island, ruled and plain, inside a bar of gold leaf, and outside the
// bar Morris's wallpaper growing out from the border to the page edges. The island's head is gilded: a word
// in textura from a broad nib in shell gold, and a Lombardic initial laid in leaf over gesso on a blue
// ground. The gold is lit: leaf in squares that tilt each their own way, raised edges, and a light that
// follows the pointer (or drifts, left alone), so the gilding flashes as it would on a turned page.
import { run } from '../../shared/runner.js';
import { device } from '../../shared/wash.js';
import { Stroke, PROFILE } from '../../shared/brush.js';
import { GPage } from '../../shared/gpage.js';
import { kit } from '../../shared/ornament.js';
import { morris, C } from '../../shared/morris.js';
import { lamp } from '../../shared/lamp.js';
import { rng, lerp, clamp, smooth, noise1, TAU } from '../../shared/util.js';

const INKCSS = '#1c1917', MUTED = '#8a8f98';
const TEXT = 'Let the pattern run to the edges of the page and stop at the border, as a garden stops at its wall. Inside, the text keeps its island: ruled, plain, set in a grotesk and left ragged, with one gilded letter at its head. Outside, the wallpaper is Morris’s, grown on its lattice. Between the two runs a bar of gold leaf, laid in squares over raised gesso, and it catches whatever light you bring to it.';
const LH = 30, FS = 18;

// textura quadrata, after plate 03. Units: nib widths; x right, y up from the baseline; x-height 5.
const MIN = (x, top = 5.05, foot = true, exit = true) => {
  const s = [[x, top - .5], [x + .5, top], [x + 1, top - .5], [x + 1, foot ? .5 : 0]];
  if (foot) { s.push([x + 1.5, 0]); if (exit) s.push([x + 1.85, .35]); }
  return s;
};
const ARCH = x => [[x, 4.55], [x + .55, 5.05], [x + 1.1, 4.55]];
const G = {
  i: { w: 1.85, s: [MIN(0), [[.55, 6.65], [1.05, 6.15]]] },
  n: { w: 2.95, s: [MIN(0, 5.05, false), [...ARCH(1), [2.1, .5], [2.6, 0], [2.95, .35]]] },
  c: { w: 2.5, s: [[[0, 4.55], [.5, 5.05], [1, 4.55], [1, .5], [1.5, 0], [2.3, 0], [2.6, .45]], [[.55, 5.05], [1.95, 5.05], [2.4, 4.4]]] },
  p: { w: 2.15, s: [[[0, 4.55], [.5, 5.05], [1, 4.55], [1, -2.6]], [[.45, -2.6], [1.55, -2.6]], [...ARCH(1), [2.1, .6], [1.6, 0], [1, .15]]] },
  t: { w: 2.05, s: [[[.5, 6.75], [1, 6.25], [1, .5], [1.5, 0], [1.85, .35]], [[.15, 5.05], [2.05, 5.05]]] },
};

let W = 1600, H = 1000, scale = 1, page, plan = {}, laid = '', light;
const PACE = .55;   // the whole choreography, quickened: composed at leisure, played at this rate
const ov = document.createElement('canvas'), o = ov.getContext('2d');
const dev = await device();

function layout() {
  const wide = W / H > 1.1;
  const ix0 = wide ? Math.round(W * .2) : 40, ix1 = wide ? Math.round(W * .2 + Math.min(760, W * .5)) : W - 40;
  const tx = ix0 + 72, tw = ix1 - ix0 - 144, P = 4 * LH + 18;
  o.font = `400 ${FS}px "Helvetica Neue",Helvetica,Arial,sans-serif`; o.letterSpacing = '0px';
  const lines = []; let cur = '';
  const avail = i => tw - (i < 5 ? P + 22 : 0);
  for (const w of TEXT.slice(1).split(' ')) {
    const tryL = cur ? cur + ' ' + w : w;
    if (o.measureText(tryL).width > avail(lines.length) && cur) { lines.push(cur); cur = w; } else cur = tryL;
  }
  lines.push(cur);
  // the island fits its text, with a generous foot, and sits in the middle of the page's height
  const hgt = 128 + 96 + Math.max(5, lines.length) * LH + 150, iy0 = Math.round((H - hgt) / 2), iy1 = iy0 + hgt, hy = iy0 + 128, ty0 = hy + 96;
  return { wide, ix0, ix1, iy0, iy1, tx, tw, hy, ty0, P, lines };
}

function compose(seed) {
  const r = rng(seed), S = []; let id = 0;
  const add = opt => { const s = new Stroke({ seed: seed * 7919 + ++id, ...opt }); S.push(s); return s; };
  const K = kit(add, r), { fill, disc, pen, tracery, nib, rect } = K;
  const L = layout(), { ix0, ix1, iy0, iy1, tx, tw, hy, ty0, P } = L;
  const guide = (pts, start) => add({ pts, pen: true, linear: true, w: .5, color: C.sky, alpha: .75, speed: 3000, minDur: .1, ease: .3, start });

  // ── 0. the island's ruling, and the pricking down its right edge
  for (let i = 0; i < L.lines.length + 1; i++) guide([[tx - 20, ty0 + i * LH], [tx + tw + 20, ty0 + i * LH]], .1 + i * .03);
  guide([[tx, iy0 + 30], [tx, iy1 - 30]], .05); guide([[tx + tw, iy0 + 30], [tx + tw, iy1 - 30]], .08);
  guide([[tx - 20, hy], [tx + tw + 20, hy]], .1);
  for (let i = 0; i < L.lines.length + 1; i++) add({ pts: [[ix1 - 24, ty0 + i * LH], [ix1 - 23.5, ty0 + i * LH]], pen: true, w: 2, color: C.ink, alpha: .6, minDur: .03, start: .3 + i * .03 });

  // ── 1. the head: 'incipit' in textura, a broad nib at 40°, in shell gold
  const UN = 8.5, T1 = .5;
  let x = tx, TT = T1;
  for (const ch of 'incipit') {
    for (const st of G[ch].s) { const s = nib(st.map(([u, v]) => [x + u * UN, hy - v * UN]), UN, 40, C.ink, TT, { gold: true, speed: 520 }); TT = s.end + .02; }
    x += (G[ch].w + .55) * UN;
  }

  // ── 2. the initial: a Lombardic L in leaf on a blue ground, white filigree in the ground, red penwork below
  const px = tx, py = ty0 - FS - 4, T2 = TT + .1, U = (u, v) => [px + u * P, py + v * P];
  rect(px, py, P, P, C.ultra, T2, .35);
  for (const [u, v, rr, d] of [[.72, .28, .1, 1], [.66, .52, .08, -1], [.16, .5, .06, 1], [.86, .9, .05, -1]]) {
    const [cx, cy] = U(u, v);
    tracery(Array.from({ length: 22 }, (_, i) => { const th = i / 21 * 1.7 * TAU, q = rr * P * Math.exp(-th * .22); return [cx + Math.cos(d * th) * q, cy + Math.sin(d * th) * q]; }), T2 + .45, { w: 1, speed: 160 });
  }
  for (let i = 0; i < 9; i++) disc(...U(.12 + (i % 3) * .05, .84 + Math.floor(i / 3) * .04), 1.4, C.white, T2 + .5 + i * .02, { outline: false });
  fill([U(.2, .18), U(.36, .155), U(.54, .18)], P * .085, C.ink, T2 + .6, { gold: true, outline: false, profile: PROFILE.flat, speed: 300 });
  fill([U(.37, .2), U(.37, .5), U(.37, .79)], P * .2, C.ink, T2 + .7, { gold: true, outline: false, profile: u => .78 + .22 * Math.sin(Math.PI * u), speed: 260 });
  fill([U(.3, .79), U(.5, .835), U(.7, .8), U(.8, .68)], P * .13, C.ink, T2 + 1, { gold: true, outline: false, profile: u => 1 - .5 * u, speed: 260 });
  disc(...U(.8, .66), P * .065, C.ink, T2 + 1.2, { gold: true, outline: false });
  // penwork: a red line let down the margin from the panel's corner, beaded, with blue hairline curls off it
  const pl = Array.from({ length: 30 }, (_, i) => [px - 16 + Math.sin(i * .7) * 3, py + P * .2 + i * 10]);
  pen(pl, T2 + .9, { color: C.verm, w: 1.3, speed: 320 });
  for (let i = 3; i < 30; i += 4) {
    const [qx, qy] = pl[i], d = i % 8 === 3 ? -1 : 1;
    disc(qx, qy, 2.2, C.verm, T2 + .9 + i * .03, { outline: false });
    pen(Array.from({ length: 12 }, (_, j) => { const th = j / 11 * 1.5 * TAU, q = 9 * Math.exp(-th * .25); return [qx + d * 10 + Math.cos(Math.PI + d * th) * q * d, qy + Math.sin(th) * q * .8]; }), T2 + 1 + i * .03, { color: C.ultra, w: .8, speed: 140 });
  }

  // ── 3. the border: a bar of gold leaf on the island's edge, ink rules either side, bosses at the corners
  const T3 = T2 + 1.2, bw = 16, sides = [[[ix0, iy0], [ix1, iy0]], [[ix1, iy0], [ix1, iy1]], [[ix1, iy1], [ix0, iy1]], [[ix0, iy1], [ix0, iy0]]];
  sides.forEach((pts, i) => fill(pts, bw, C.ink, T3 + i * .3, { gold: true, profile: PROFILE.flat, speed: 1500, ease: .2 }));
  for (const d of [-13, 13]) pen([[ix0 - d, iy0 - d], [ix1 + d, iy0 - d], [ix1 + d, iy1 + d], [ix0 - d, iy1 + d], [ix0 - d, iy0 - d - .4]], T3 + .6, { linear: true, w: .9, speed: 3200 });
  for (const [cx, cy] of [[ix0, iy0], [ix1, iy0], [ix1, iy1], [ix0, iy1]]) {
    disc(cx, cy, 22, C.ink, T3 + 1.1, { gold: true });
    disc(cx, cy, 9, C.verm, T3 + 1.3); disc(cx - 2.5, cy - 2.5, 2.2, C.white, T3 + 1.4, { outline: false });
  }

  // ── 4. outside: Morris, grown from the border out to the page edges, kept off the island by the clip
  const cx0 = (ix0 + ix1) / 2, cy0 = (iy0 + iy1) / 2, far = Math.hypot(Math.max(cx0, W - cx0), Math.max(cy0, H - cy0));
  const dIsle = (x, y) => Math.hypot(Math.max(ix0 - x, 0, x - ix1), Math.max(iy0 - y, 0, y - iy1));
  const T4 = T3 + .8;
  const grow = (x, y) => T4 + clamp(dIsle(x, y) / (far * .8)) * 4.6 + (noise1(x * .003 + y * .002, 7) - .5) * .5;
  const M = morris(add, r, { W, H, reserve: [[ix0 - 10, iy0 - 10, ix1 + 10, iy1 + 10]], clip: true, gold: true, grow, cellMargin: -110 });

  plan = { L, clip: [ix0 - 14, iy0 - 14, ix1 + 14, iy1 + 14], guides: M.guides, end: Math.max(...S.map(s => s.end)) };
  return S;
}

function overlay(t) {
  o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, ov.width, ov.height); o.setTransform(scale, 0, 0, scale, 0, 0);
  if (!dev) { o.fillStyle = MUTED; o.font = '14px Helvetica'; o.fillText('This plate needs WebGPU.', 40, 60); return; }
  const { L, end } = plan, { lines, tx, tw, ty0, P, hy, iy1 } = L;
  const text = (s, x, y, kk, { size = 10, track = .12, col = MUTED, weight = 400, align = 'left' } = {}) => {
    if (kk <= 0) return; o.font = `${weight} ${size}px "Helvetica Neue",Helvetica,Arial,sans-serif`; o.letterSpacing = `${track * size}px`; o.textAlign = align; o.fillStyle = col;
    o.fillText(s.slice(0, Math.ceil(s.length * kk)), x, y); o.letterSpacing = '0px';
  };
  text('PL. 13', tx + tw, hy, smooth(.8, 1.2, t), { size: 9, track: .2, col: INKCSS, align: 'right' });
  text('FOLIO', tx + tw, hy - 16, smooth(.9, 1.3, t), { size: 9, track: .2, align: 'right' });
  // the text types itself in round the initial, on the ruling
  const t0 = 1.6, cps = 150;
  o.font = `400 ${FS}px "Helvetica Neue",Helvetica,Arial,sans-serif`; o.fillStyle = INKCSS; o.textAlign = 'left'; o.letterSpacing = '0px';
  let at = 0;
  lines.forEach((ln, i) => {
    const shown = clamp((t - t0) * cps - at, 0, ln.length); at += ln.length;
    if (shown > 0) o.fillText(ln.slice(0, Math.ceil(shown)), tx + (i < 5 ? P + 22 : 0), ty0 + i * LH);
  });
  const kn = smooth(end - 1.2, end - .2, t);
  text('gold leaf in 26-unit squares over gesso · shell gold from a 40° nib · the light is the pointer', tx, iy1 - 40, kn, { size: 9, track: .06 });
}

const scene = {
  fill: true, W, H, duration: 1, canvas: ov, layers: [ov], live: true,
  setSize(w, h) { W = scene.W = w; H = scene.H = h; },
  resize(s) { scale = s; ov.width = Math.round(W * s); ov.height = Math.round(H * s); page?.resize(W, H, s); },
  reset(seed) {
    const S = compose(seed), key = `${seed}:${W}x${H}`;
    for (const s of S) { s.start *= PACE; s.dur *= PACE; s.end = s.start + s.dur; }
    if (page && key !== laid) { page.bristles.load(S); laid = key; }
    if (page) { page.bristles.clip = plan.clip; page.bristles.page = [W, H]; }
    scene.duration = plan.end * PACE + .8;
  },
  step() {},
  render(t) { if (page) { page.bristles.light = light(t); page.render(t); } overlay(t / PACE); },
};
if (dev) { page = new GPage(dev); scene.canvas = page.canvas; scene.layers = [page.canvas, ov]; scene.page = page; light = lamp(scene); }
run(scene);
