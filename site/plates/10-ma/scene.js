// 10 Ma — a Morris wallpaper in medieval body colour, and one perfect circle cut out of it. The repeat is
// Morris's turnover on an ogee lattice: two families of sinuous stems that kiss, and in every lens between
// them a stalk, a pair of acanthus, a flower. It grows up the page from the bottom edge, and every gap is
// filled with hairline sprays and gold, the way a Book of Hours border is. Then the interval (間, ma) opens:
// a white disc, and inside it, in hairline only, the construction the ornament was grown on.
import { run } from '../../shared/runner.js';
import { device } from '../../shared/wash.js';
import { Stroke } from '../../shared/brush.js';
import { GPage } from '../../shared/gpage.js';
import { morris } from '../../shared/morris.js';
import { rng, smooth, TAU } from '../../shared/util.js';

const GUIDE = '#79b0e6', INKCSS = '#1c1917', MUTED = '#8a8f98';

let W = 1600, H = 1000, scale = 1, page, plan = {}, laid = '';
const ov = document.createElement('canvas'), o = ov.getContext('2d');
const dev = await device();
const EMBED = new URLSearchParams(location.search).has('embed');

function compose(seed) {
  const r = rng(seed), S = []; let id = 0;
  const add = opt => { const s = new Stroke({ seed: seed * 7919 + ++id, ...opt }); S.push(s); return s; };
  const M = morris(add, r, { W, H });
  plan = { guides: M.guides, h: M.h, TH: M.TH, end: Math.max(...S.map(s => s.end)) };
  return S;
}

// the interval: a white disc opens out of the painting, and in it the construction, in hairline
function overlay(t) {
  o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, ov.width, ov.height); o.setTransform(scale, 0, 0, scale, 0, 0);
  if (!dev) { o.fillStyle = MUTED; o.font = '14px Helvetica'; o.fillText('This plate needs WebGPU.', 40, 60); return; }
  const { cx, cy, R, t0 } = plan.void, k = smooth(t0, t0 + 1.3, t), e = 1 - (1 - k) ** 3, rr = R * e;
  if (rr <= .5) return;
  o.save(); o.beginPath(); o.arc(cx, cy, rr, 0, TAU); o.fillStyle = '#fff'; o.fill(); o.clip();
  // the construction, as it was drawn before any paint
  o.strokeStyle = GUIDE; o.lineWidth = .6; o.globalAlpha = smooth(t0 + .3, t0 + 1.2, t) * .9;
  for (const g of plan.guides) { o.beginPath(); g.pts.forEach(([x, y], i) => (i ? o.lineTo(x, y) : o.moveTo(x, y))); o.stroke(); }
  o.globalAlpha = 1; o.restore();
  // the rim: a hairline, and a second, just outside
  o.strokeStyle = INKCSS; o.lineWidth = .9; o.beginPath(); o.arc(cx, cy, rr, 0, TAU); o.stroke();
  o.lineWidth = .5; o.beginPath(); o.arc(cx, cy, rr + 7 * e, -Math.PI / 2, -Math.PI / 2 + TAU * smooth(t0 + .6, t0 + 1.8, t)); o.stroke();
  // type, set inside the interval; left out when the plate is shown inside the site, which carries no Japanese text
  if (EMBED) return;
  const text = (s, x, y, kk, { size = 11, track = .1, col = MUTED, weight = 400, font = '"Helvetica Neue",Helvetica,Arial,sans-serif', align = 'left' } = {}) => {
    if (kk <= 0) return; o.font = `${weight} ${size}px ${font}`; o.letterSpacing = `${track * size}px`; o.fillStyle = col; o.textAlign = align;
    o.fillText(s.slice(0, Math.ceil(s.length * kk)), x, y); o.letterSpacing = '0px';
  };
  const tx = cx - R * .52, ty = cy - R * .1, t1 = t0 + 1.2;
  const ky = smooth(t1, t1 + .5, t);
  if (ky > 0) { o.globalAlpha = ky; o.font = `300 92px "Hiragino Mincho ProN","Yu Mincho",serif`; o.fillStyle = INKCSS; o.textAlign = 'left'; o.fillText('間', tx - 6, ty); o.globalAlpha = 1; }
  text('MA', tx, ty + 34, smooth(t1 + .3, t1 + .6, t), { size: 13, track: .3, col: INKCSS, weight: 600 });
  text('the interval', tx + 40, ty + 34, smooth(t1 + .4, t1 + .9, t), { size: 13, track: .02, col: INKCSS });
  const notes = ['turnover repeat on an ogee lattice', `h ${plan.h} · period ${plan.TH} · amplitude h/2`, 'after William Morris, 1834–1896'];
  notes.forEach((s, i) => text(s, tx, ty + 64 + i * 16, smooth(t1 + .6 + i * .2, t1 + 1.3 + i * .2, t), { size: 10, track: .04 }));
  // a seal, small, vermilion
  const ks = smooth(t1 + 1.3, t1 + 1.5, t);
  if (ks > 0) {
    const sx = tx, sy = ty + 122, sz = 22;
    o.globalAlpha = ks; o.fillStyle = '#e2391d'; o.fillRect(sx, sy, sz, sz);
    o.fillStyle = '#fff'; o.font = `600 15px "Hiragino Mincho ProN",serif`; o.textAlign = 'center'; o.fillText('間', sx + sz / 2, sy + 16.5); o.globalAlpha = 1;
  }
  text('PL. 10', cx + R * .52, cy + R * .62, smooth(t1 + .8, t1 + 1.2, t), { size: 9, track: .2, col: INKCSS, align: 'right' });
}

const scene = {
  fill: true, W, H, duration: 1, canvas: ov, layers: [ov],
  setSize(w, h) { W = scene.W = w; H = scene.H = h; },
  resize(s) { scale = s; ov.width = Math.round(W * s); ov.height = Math.round(H * s); page?.resize(W, H, s); },
  reset(seed) {
    const key = `${seed}:${W}x${H}`;
    const S = compose(seed);
    if (page && key !== laid) { page.bristles.load(S); laid = key; }
    // the interval: on a wide page right of centre, on a tall one high
    const wide = W / H > 1.1;
    plan.void = { cx: wide ? W * .6 : W / 2, cy: wide ? H * .5 : H * .4, R: Math.min(H * .33, W * .42), t0: plan.end + .3 };
    scene.duration = plan.void.t0 + 4.2;
  },
  step() {},
  render(t) { page?.render(t); overlay(t); },
};
if (dev) { page = new GPage(dev); scene.canvas = page.canvas; scene.layers = [page.canvas, ov]; scene.page = page; }
run(scene);
