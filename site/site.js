// 15 Emaki — the site as a scroll. The text is DOM and scrolls; one WebGPU canvas sits fixed behind it and
// paints the world the text scrolls through. The ornament is placed by measuring the DOM's own layout (the
// DOM is the scribe), and each section paints itself as it comes into view, quickly, then holds: ink you
// have seen stays. Opening a project slides the whole world left so its page comes in from the right; back
// slides it home. Each column of the world has its own camera and clock in the bristle engine.
//
// The Japanese-modernist half: each project is one flat geometric plane in one ink (a circle, a square, the
// half-disc of a horizon), and up close the plane is a katagami stencil, its Morris pattern cut out of it
// in white. Heraldry and mon meet in the gold emblems; emaki cloud bands in gold divide the sections.
import { device } from './shared/wash.js';
import { Stroke, PROFILE } from './shared/brush.js';
import { GPage } from './shared/gpage.js';
import { Bristles } from './shared/bristles.js';
import { kit, hex, shade } from './shared/ornament.js';
import { morris } from './shared/morris.js';
import { seaMap } from './demo-sea.js';
import { mountMagi } from './demo-magi.js';
import { rng, clamp, lerp, noise1, TAU } from './shared/util.js';

const WHITE = [255, 255, 255], INK = hex('#1c1917'), SKY = hex('#79b0e6'), VERM = hex('#e2391d'), ULTRA = hex('#2340b8');
const VINE = [{ body: hex('#2340b8'), turn: hex('#79b0e6') }, { body: hex('#6f9f8a'), turn: hex('#e0457b') }, { body: hex('#e0457b'), turn: hex('#f4b400') }, { body: hex('#3b63d4'), turn: hex('#a9c9ef') }];
const SPAN = 2.2;             // a section's own paint time, played as it comes into view
const PROJ = ['pum', 'magi', 'sea', 'making'];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
const index = $('#index'), detail = $('#detail'), track = $('#track'), rail = $('#rail');
const secs = $$('section[data-sec]', index);

const st = { track: 0, from: 0, to: 0, t0: 0, open: -1, main: 0, rev: 0, det: -1, drev: 0, ptr: null, light: null };
let vw = innerWidth, vh = innerHeight, page, B, raf = 0, last = 0, gen = 0;
const D = [];   // each project's page has its own layer, built in idle time once the index has painted

// ── composing the world from the page's layout ─────────────────────────────────────────────────────────────
function compose(only = null) {
  vw = innerWidth; vh = innerHeight;
  const S = [], masks = []; let id = 0, demo = null, sea = null;
  const r = rng(7);
  const add = o => { const s = new Stroke({ seed: 7919 + ++id, blend: 'source-over', ...o }); S.push(s); return s; };
  const K = kit(add, r);
  const mask = (kind, a, b, c, d) => (masks.push([kind, a, b, c, d]), masks.length);
  // measure the layout as it will rest, not mid-entrance (see .measuring in the CSS)
  document.documentElement.classList.add('measuring'); void index.offsetHeight;
  const box = index.getBoundingClientRect();
  const wr = el => { const b = el.getBoundingClientRect(); return { x: b.left - box.left, y: b.top - box.top + index.scrollTop, w: b.width, h: b.height }; };

  // a plane: one ink laid in broad bands, kept to its shape by a stencil mask, a little brush in it; then
  // the katagami: its pattern as white, cut out of it, its lines in the plane's own ink
  function plane(R, { plane: kind, tint, pattern }, T, s = .42, gild = null) {
    if (kind === 'arch') return arch(R, T);
    const col = hex(tint), cx = R.x + R.w / 2;
    let m;
    if (kind === 'circle') m = mask(1, cx, R.y + R.h / 2, Math.min(R.w, R.h) / 2, 0);
    else if (kind === 'half') m = mask(3, cx, R.y + R.h, R.w / 2, 0);
    else m = mask(2, R.x, R.y, R.x + R.w, R.y + R.h);
    // the construction, hairline and unmasked: it shows where the plane hasn't reached
    const g = (pts, t) => add({ pts, pen: true, linear: true, w: .6, color: SKY, alpha: .9, speed: 3000, minDur: .12, ease: .3, start: t });
    if (kind === 'circle') K.pen(K.ring(cx, R.y + R.h / 2, Math.min(R.w, R.h) / 2, 72), T, { color: SKY, w: .6, speed: 3000 });
    else if (kind === 'half') K.pen(Array.from({ length: 49 }, (_, i) => [cx + Math.cos(Math.PI + i / 48 * Math.PI) * R.w / 2, R.y + R.h + Math.sin(Math.PI + i / 48 * Math.PI) * R.w / 2]), T, { color: SKY, w: .6, speed: 3000 });
    g([[R.x - 40, R.y + R.h / 2], [R.x + R.w + 40, R.y + R.h / 2]], T); g([[cx, R.y - 40], [cx, R.y + R.h + 40]], T + .05);
    if (kind !== 'circle') g([[R.x, R.y], [R.x + R.w, R.y], [R.x + R.w, R.y + R.h], [R.x, R.y + R.h], [R.x, R.y - .4]], T + .02);
    K.rect(R.x, R.y, R.w, R.h, col, T + .12, .35, { outline: false, mask: m });
    for (let i = 0; i < 7; i++) {
      const y = R.y + R.h * (i + .5) / 7;
      add({ pts: [[R.x - 20, y], [cx, y + r.range(-6, 6)], [R.x + R.w + 20, y + r.range(-6, 6)]], w: R.h / 7 * 1.3, bristles: 40, color: shade(col, i % 2 ? .9 : 1.08), alpha: .5, dry: .45, ink: 3, grain: .7, profile: PROFILE.flat, speed: (R.w + 40) / .3, ease: .2, start: T + .2 + i * .04, mask: m });
    }
    const cut = { morris: katMorris, trellis: katTrellis, waves: katWaves }[pattern];
    cut(R, col, m, T + .5, s, gild);
  }

  // gild(u, v) over the plane's unit square: 2 lays a shape in leaf, 1 traces its lines in gold, 0 leaves it;
  // the gilding goes on after the cut, as a second hand would, sweeping across
  function katMorris(R, col, m, T, s, gild) {
    const loc = []; let n = 0;
    const addL = o => { const x = new Stroke({ seed: 31 + m * 9973 + ++n, ...o }); loc.push(x); return x; };
    const VW = R.w / s, VH = R.h / s, far = Math.hypot(VW, VH) / 2;
    morris(addL, rng(11 + m), { W: VW, H: VH, sprays: false, grow: (x, y) => Math.hypot(x - VW / 2, y - VH / 2) / far });
    for (const x of loc) {
      const P = x.path;
      for (let k = 0; k < P.n; k++) { P.x[k] = R.x + P.x[k] * s; P.y[k] = R.y + P.y[k] * s; }
      P.L *= s; P.step *= s;
      x.w = x.pen ? Math.max(1, x.w * s * 1.6) : x.w * s;
      x.color = x.pen ? col : WHITE; x.gold = false; x.blend = 'source-over'; x.mask = m; x.alpha = 1;
      x.start = T + x.start * .45; x.dur *= .35; x.end = x.start + x.dur;
      S.push(x);
      if (!gild) continue;
      const k = P.n >> 1, u = (P.x[k] - R.x) / R.w, v = (P.y[k] - R.y) / R.h, g = gild(u, v, x);
      if (!g || (g === 1 && !x.pen) || (g === 2 && !x.wash && !x.pen)) continue;
      const t = T + 1.05 + (1 - u) * .35 + v * .25;
      S.push(Object.assign(Object.create(Stroke.prototype), x, { B: null, gold: true, start: t, end: t + x.dur, w: x.pen ? Math.max(x.w, 1.4) : x.w }));
    }
  }

  function katTrellis(R, col, m, T) {
    const g = Math.max(56, Math.min(96, R.w / 6.5)), when = (x, y) => T + ((x - R.x) + (y - R.y)) / (R.w + R.h) * .9;
    for (let c = -R.h; c <= R.w + R.h; c += g) {
      K.fill([[R.x + c - R.h - 20, R.y + R.h + 20], [R.x + c + 20, R.y - 20]], 7, WHITE, when(R.x + c - R.h / 2, R.y), { outline: false, profile: PROFILE.flat, speed: 2400, mask: m, linear: true });
      K.fill([[R.x + c - 20, R.y - 20], [R.x + c + R.h + 20, R.y + R.h + 20]], 7, WHITE, when(R.x + c, R.y) + .1, { outline: false, profile: PROFILE.flat, speed: 2400, mask: m, linear: true });
    }
    // knots where the bars cross, and a star or a triad of dots in each diamond: the entities in the mesh
    for (let a = -R.h - g; a <= R.w + g; a += g) for (let b = 0; b <= R.w + R.h + 2 * g; b += g) {
      const x = R.x + (a + b) / 2, y = R.y + (b - a) / 2;
      if (x < R.x - 20 || x > R.x + R.w + 20 || y < R.y - 20 || y > R.y + R.h + 20) continue;
      const t = when(x, y) + .25;
      for (let i = 0; i < 4; i++) { const an = i * Math.PI / 2; K.leaf([x, y], [Math.cos(an), Math.sin(an)], g * .26, g * .17, WHITE, t, { outline: false, bend: 0, mask: m }); }
      K.disc(x, y, 2.6, col, t + .1, { outline: false, mask: m });
      const dx = x + g / 2, dy = y, tt = t + .15;
      if ((Math.round(a / g) + Math.round(b / g)) % 2) {
        for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4; K.leaf([dx, dy], [Math.cos(an), Math.sin(an)], g * (i % 2 ? .13 : .22), g * .07, WHITE, tt, { outline: false, bend: 0, mask: m }); }
      } else for (let i = 0; i < 3; i++) { const an = -Math.PI / 2 + i * TAU / 3; K.disc(dx + Math.cos(an) * g * .1, dy + Math.sin(an) * g * .1, g * .05, WHITE, tt + i * .03, { outline: false, mask: m }); }
    }
  }

  function katWaves(R, col, m, T) {
    // seigaiha: rows of scales, each a disc of the plane's ink with white rings in it, laid top to bottom so
    // each row covers the lower halves of the last; then a few currents drawn through in white
    const Rw = Math.max(30, R.w / 11), rows = Math.ceil(R.h / (Rw * .5)) + 2, cols = Math.ceil(R.w / (Rw * 2)) + 2;
    for (let j = 0; j < rows; j++) for (let i = -1; i < cols; i++) {
      const cx = R.x + i * Rw * 2 + (j % 2) * Rw, cy = R.y + j * Rw * .5, t = T + j * .045 + Math.abs(i - cols / 2) * .01;
      K.disc(cx, cy, Rw, col, t, { outline: false, mask: m });
      for (const k of [.86, .62, .38]) add({ pts: K.ring(cx, cy, Rw * k, 28), pen: true, w: Rw * .1, color: WHITE, alpha: 1, speed: 900, minDur: .08, start: t + .05, mask: m });
      K.disc(cx, cy, Rw * .13, WHITE, t + .08, { outline: false, mask: m });
    }
    for (let k = 0; k < 5; k++) {
      const y0 = R.y + R.h * (.3 + k * .15), pts = [];
      for (let x = R.x - 20; x <= R.x + R.w + 20; x += 24) pts.push([x, y0 + Math.sin(x / 90 + k * 1.7) * 14 - (x - R.x) * .08]);
      add({ pts, w: 3.2, bristles: 4, color: WHITE, alpha: 1, dry: .2, ink: 4, grain: .4, profile: PROFILE.hair, speed: 1600, start: T + .9 + k * .08, mask: m });
    }
  }

  // a mon: a ring of leaf gold, white within, a figure in gold; the light catches them
  function mon(R, kind, T) {
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2, Rr = R.w / 2, G = { gold: true, outline: false };
    K.disc(cx, cy, Rr, INK, T, G);
    K.disc(cx, cy, Rr * .84, WHITE, T + .06, { outline: false });
    if (kind === 'jelly') {
      // Pum's jellyfish: a bell, frilled arms, tentacles trailing
      const mb = mask(3, cx, cy + Rr * .02, Rr * .5, 0);
      K.disc(cx, cy + Rr * .02, Rr * .5, INK, T + .12, { ...G, mask: mb });
      for (let i = 0; i < 4; i++) {
        const x0 = cx + (i - 1.5) * Rr * .26, pts = Array.from({ length: 9 }, (_, j) => [x0 + Math.sin(j * .9 + i) * Rr * .05, cy + Rr * .06 + j * Rr * .07]);
        add({ pts, wash: true, w: Rr * .055, color: INK, gold: true, alpha: 1, rim: 0, profile: u => 1 - u * .7, speed: 300, minDur: .1, start: T + .2 + i * .03 });
      }
      for (const d of [-1, 1]) K.leaf([cx + d * Rr * .07, cy + Rr * .06], [d * .25, 1], Rr * .46, Rr * .13, INK, T + .22, { ...G, bend: .25 * d });
      K.disc(cx - Rr * .14, cy - Rr * .2, Rr * .06, WHITE, T + .3, { outline: false });
    } else if (kind === 'delta') {
      // MAGI's mark, the wordmark's A: an equilateral and its crossbar
      const k = Rr * 1.2 / 32, P = ([x, y]) => [cx + (x - 16) * k, cy + (y - 18.6) * k];
      const tri = [[5.81, 25.88], [16, 8.24], [26.19, 25.88], [5.81, 25.88]].map(P);
      for (let i = 0; i < 3; i++) K.fill([tri[i], tri[i + 1]], 2.3 * k, INK, T + .12 + i * .05, { ...G, profile: PROFILE.flat, linear: true, speed: 300 });
      K.fill([P([9.77, 19.02]), P([22.23, 19.02])], 2.1 * k, INK, T + .3, { ...G, profile: PROFILE.flat, linear: true, speed: 300 });
    } else if (kind === 'rose') {
      // the seafaring map's wind rose: four winds long, four short, a vermilion eye
      for (let i = 0; i < 8; i++) {
        const an = -Math.PI / 2 + i * Math.PI / 4, l = i % 2 ? Rr * .42 : Rr * .7;
        K.leaf([cx, cy], [Math.cos(an), Math.sin(an)], l, i % 2 ? Rr * .12 : Rr * .18, INK, T + .12 + (i % 2) * .08, { ...G, bend: 0 });
      }
      K.disc(cx, cy, Rr * .09, VERM, T + .3, { outline: false });
    } else {
      for (let i = 0; i < 4; i++) { const an = TAU * (i + .5) / 4; K.leaf([cx, cy], [Math.cos(an), Math.sin(an)], Rr * .62, Rr * .42, INK, T + .1 + i * .03, { ...G, bend: 0 }); }
      K.disc(cx, cy, Rr * .14, VERM, T + .25, { outline: false });
    }
  }

  // emaki clouds: gold bands with lobed ends, cutting between scenes
  function cloud(R, T, flip) {
    const th = 16;
    [.3, .55, .8].forEach((v, i) => {
      const y = R.y + R.h * v, a = R.x + R.w * (flip ? [.25, 0, .4][i] : [0, .15, .05][i]), b = R.x + R.w * (flip ? [1, .8, .95][i] : [.7, 1, .6][i]);
      K.fill([[a, y], [b, y]], th, INK, T + i * .08, { gold: true, outline: false, profile: PROFILE.flat, speed: 2600, ease: .3 });
      for (const x of [a, b]) K.disc(x, y + (i % 2 ? 3 : -3), th * .72, INK, T + i * .08 + .2, { gold: true, outline: false });
    });
  }

  // a sweep of gold across the hero's cut, off its axis: an arc from the top right down to the lower left,
  // leaf at its heart, gold-traced lines either side, and a few motifs gilded where nothing asked for them
  function heroGild(u, v, x) {
    const d = Math.abs(Math.hypot(u - .1, v + .2) - .95) + (noise1(u * 3.1 + v * 2.3, 5) - .5) * .09;
    const small = x.wash && x.w < 8;   // leaves, petals, seeds: leaf them; the big masses stay cut white
    if (d < .09) return small ? 2 : 1;
    if (d < .2) return 1;
    return small && noise1(u * 17 + v * 29, 3) > .78 ? 2 : 0;
  }

  // corner vines: from a page corner two stems run along its edges, each ending in a curl; acanthus wraps
  // them in blue, sage and rose; gold ivy hairlines fill in; a gilt boss at the corner itself
  function corner(x0, y0, sx, sy, L, T, seed) {
    const rr = rng(97 + seed);
    for (const axis of [0, 1]) {
      const n = 22, pts = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n, a = 18 + u * (L - 60), b = 18 + Math.sin(u * Math.PI * 2.4 + seed) * 6;
        pts.push(axis ? [x0 + sx * b, y0 + sy * a] : [x0 + sx * a, y0 + sy * b]);
      }
      // the curl: a log spiral turning in toward the page
      const [ex, ey] = pts[n], cr = 18, dir = axis ? -sx * sy : sx * sy;
      for (let j = 1; j <= 14; j++) {
        const th = j / 14 * 1.4 * TAU, q = cr * Math.exp(-th * .18), base = axis ? Math.atan2(sy, 0) : Math.atan2(0, sx);
        const c = axis ? [ex + sx * cr, ey] : [ex, ey + sy * cr];
        const an = Math.atan2(ey - c[1], ex - c[0]) + dir * th;
        pts.push([c[0] + Math.cos(an) * q, c[1] + Math.sin(an) * q]);
      }
      const t0 = T + axis * .15;
      add({ pts, w: 4.2, bristles: 5, color: hex('#2f5d4a'), alpha: 1, dry: .1, ink: 6, grain: .3, profile: PROFILE.taper, speed: 520, ease: .2, start: t0 });
      for (let i = 3; i < n - 1; i += 4) {
        const [px, py] = pts[i], [qx, qy] = pts[i + 1], h = Math.atan2(qy - py, qx - px), j = (i - 3) / 4, side = j % 2 ? 1 : -1;
        const inward = axis ? (sx > 0 ? 0 : Math.PI) : (sy > 0 ? Math.PI / 2 : -Math.PI / 2);
        const th0 = side > 0 ? lerp(h, inward, .55) : h + side * .5;
        K.acanthus(px, py, th0, rr.range(36, 54), side * (axis ? sx : -sy) > 0 ? 1 : -1, rr.range(15, 20), VINE[(j + seed) % VINE.length], t0 + i / n * .7, .5, { lobes: 3 });
        // a hairline of ivy off the stem, gold leaves on it, a berry
        const ia = inward + rr.range(-.5, .5), il = rr.range(26, 50), ip = [px + Math.cos(ia) * il, py + Math.sin(ia) * il];
        K.pen([[px, py], [lerp(px, ip[0], .5) + rr.range(-8, 8), lerp(py, ip[1], .5) + rr.range(-8, 8)], ip], t0 + i / n * .7 + .2, { w: .8, speed: 300 });
        for (const da of [-.6, 0, .6]) K.leaf(ip, [Math.cos(ia + da), Math.sin(ia + da)], da ? 7 : 10, 5.5, INK, t0 + i / n * .7 + .35, { gold: true, outline: false, bend: 0 });
        if (i % 2) K.disc(ip[0] + Math.cos(ia) * 12, ip[1] + Math.sin(ia) * 12, 3, VERM, t0 + i / n * .7 + .45);
      }
    }
    K.disc(x0 + sx * 18, y0 + sy * 18, 9, INK, T + .05, { gold: true, outline: false });
    K.disc(x0 + sx * 18, y0 + sy * 18, 3.6, VERM, T + .15, { outline: false });
  }

  // the arch of heaven for the last page, after the calendar of the Très Riches Heures: a half-disc in bands,
  // tiles ruled in gold, a blue zone of gold stars with a scroll and a comet, and a sun raying at the centre
  function arch(R, T) {
    const cx = R.x + R.w / 2, cy = R.y + R.h, Rr = R.w / 2, G = { gold: true, outline: false };
    const at = (rr, a) => [cx - Math.cos(a * Math.PI) * rr, cy - Math.sin(a * Math.PI) * rr];   // a: 0 left .. 1 right
    const arc = (rr, a0 = 0, a1 = 1, n = 90) => Array.from({ length: n + 1 }, (_, i) => at(rr, lerp(a0, a1, i / n)));
    const gl = (pts, t, w = 1.4, o = {}) => add({ pts, pen: true, linear: true, w, color: INK, gold: true, alpha: 1, speed: 700, minDur: .05, ease: .2, start: t, ...o });
    K.pen(arc(Rr), T, { color: SKY, w: .6, speed: 3000 });
    K.pen([[R.x - 30, cy], [R.x + R.w + 30, cy]], T + .05, { color: SKY, w: .6, speed: 3000, linear: true });
    const m1 = mask(3, cx, cy, Rr * .86, 0), m2 = mask(3, cx, cy, Rr * .64, 0), m3 = mask(3, cx, cy, Rr * .5, 0);
    K.rect(R.x, R.y, R.w, R.h, ULTRA, T + .2, .4, { outline: false, mask: m1 });
    K.rect(R.x, R.y, R.w, R.h, WHITE, T + .45, .25, { outline: false, mask: m2 });
    K.rect(R.x, R.y, R.w, R.h, ULTRA, T + .6, .25, { outline: false, mask: m3 });
    // the tiled bands: rows of voussoirs ruled in gold, each row's joints halfway between the last's
    const rows = [[.86, .93, 26], [.93, 1, 26], [.5, .57, 40], [.57, .64, 40]];
    for (const r0 of [1, .93, .86, .64, .57, .5]) gl(arc(Rr * r0), T + .5 + (1 - r0) * .3, r0 === 1 || r0 === .86 || r0 === .64 || r0 === .5 ? 2.6 : 1.3, { speed: Rr * 4 });
    rows.forEach(([a, b, n], j) => {
      for (let k = 0; k <= n; k++) { const f = (k + (j % 2) * .5) / n; if (f > 1) continue; gl([at(Rr * a, f), at(Rr * b, f)], T + .7 + f * .45 + j * .04, 1.3); }
    });
    // stars in the blue, gold, four- and eight-pointed, and a few white
    const rs = rng(5);
    for (let i = 0; i < 90; i++) {
      const f = rs.range(.02, .98), rad = Rr * rs.range(.66, .84), [x, y] = at(rad, f), sz = rs.range(3, 7), t = T + .9 + f * .5;
      if (i % 4 === 3) { K.disc(x, y, 1.3, WHITE, t, { outline: false }); continue; }
      const pts8 = i % 3 === 0;
      for (let q = 0; q < (pts8 ? 8 : 4); q++) { const an = q * TAU / (pts8 ? 8 : 4) + .2; K.leaf([x, y], [Math.cos(an), Math.sin(an)], q % 2 && pts8 ? sz * .55 : sz, sz * .35, INK, t, { ...G, bend: 0 }); }
    }
    // a sign's boundary, a gold scroll on the left of the zone, a comet on the right
    gl([at(Rr * .64, .36), at(Rr * .86, .3)], T + 1.0, 1.6);
    const [sx0, sy0] = at(Rr * .75, .14), sp = [];
    for (let j = 0; j <= 40; j++) { const th = j / 40 * 2.2 * TAU, q = Rr * .075 * Math.exp(-th * .2); sp.push([sx0 + Math.cos(th + 2) * q, sy0 + Math.sin(th + 2) * q]); }
    add({ pts: sp, wash: true, w: 4.5, color: INK, gold: true, alpha: 1, rim: 0, profile: u => 1 - u * .7, speed: 300, start: T + 1.1 });
    for (let j = 2; j < 30; j += 3) { const [px, py] = sp[j], an = Math.atan2(py - sy0, px - sx0); K.leaf([px, py], [Math.cos(an), Math.sin(an)], 13 - j * .25, 6, INK, T + 1.15 + j * .02, { ...G, bend: .3 }); }
    const [kx, ky] = at(Rr * .76, .8);
    K.disc(kx, ky, 6, INK, T + 1.2, G);
    for (let j = 0; j < 9; j++) gl([[kx + 4, ky + 1], [kx + 40 + j * 4, ky + 22 - j * 3.2]], T + 1.25 + j * .02, .9);
    // the sun: a gold disc off the centre, rayed with fine gold in every direction, kept inside the inner blue
    const [ux, uy] = [cx + Rr * .08, cy - Rr * .26], sr = Rr * .075;
    for (let j = 0; j < 84; j++) {
      const an = j / 84 * TAU + rs.range(-.02, .02), l = sr * rs.range(1.4, j % 3 ? 3.2 : 5.2);
      gl([[ux + Math.cos(an) * sr * 1.05, uy + Math.sin(an) * sr * 1.05], [ux + Math.cos(an) * l, uy + Math.sin(an) * l]], T + 1.35 + (j % 12) * .02, j % 3 ? .8 : 1.3, { mask: m3 });
    }
    K.disc(ux, uy, sr, INK, T + 1.3, G);
    for (let i = 0; i < 26; i++) { const f = rs.range(.05, .95), [x, y] = at(Rr * rs.range(.08, .46), f); if (Math.hypot(x - ux, y - uy) > sr * 3) K.disc(x, y, 1.2, WHITE, T + 1.4 + f * .2, { outline: false, mask: m3 }); }
    gl([[R.x - 10, cy], [R.x + R.w + 10, cy]], T + .6, 3);
  }

  // ── the index column (or, given a project, only that project's page)
  if (only == null) secs.forEach((sec, i) => {
    const T = i * SPAN;
    const prev = sec.previousElementSibling;
    if (prev && prev.hasAttribute('data-cloud')) cloud(wr(prev), T, prev.classList.contains('r'));
    const gild = sec.dataset.sec === 'hero' ? heroGild : null;
    $$('[data-plane]', sec).forEach(el => plane(wr(el), el.dataset, T, .42, gild));
    $$('[data-mon]', sec).forEach((el, j) => mon(wr(el), el.dataset.mon, T + .8 + j * .05));
    if (sec.dataset.sec === 'write') {
      // vines at the top right and the bottom right, to close the book
      const H = wr(sec);
      corner(H.x + H.w - 1, H.y, -1, 1, Math.min(300, vw * .22), T + 1.2, 2);
      corner(H.x + H.w - 1, H.y + H.h, -1, -1, Math.min(300, vw * .2), T + 1.4, 3);
    }
    if (sec.dataset.sec === 'hero') {
      // the hero's counterweight, a small vermilion block below the square; a vine in the page's top-left corner
      const R = wr($('[data-plane]', sec)), H = wr(sec);
      corner(H.x, H.y, 1, 1, Math.min(240, vw * .17), T + .6, 0);
      const vm = mask(2, R.x + R.w * .86, R.y + R.h + 22, R.x + R.w, R.y + R.h + 22 + R.w * .14);
      K.rect(R.x + R.w * .86, R.y + R.h + 22, R.w * .14, R.w * .14, VERM, T + 1.4, .2, { outline: false, mask: vm });
    }
  });

  // ── a project's page, in the world's second column: a band of its plane across the top, its mon
  else {
    const art = $(`article[data-p=${PROJ[only]}]`, detail), band = $('[data-band]', art), bx = vw, bh = Math.round(vh * .28);
    plane({ x: bx, y: 0, w: vw, h: bh }, { plane: 'rect', tint: band.dataset.tint, pattern: band.dataset.pattern }, 0, .5);
    const pad = vw > 820 ? vw * .14 : 22;
    mon({ x: bx + pad, y: bh - 60, w: 120, h: 120 }, $('[data-mon]', art).dataset.mon, 1.75);
    // the page's demonstration, if it has one, measured with only this article showing
    const map = $('[data-map]', art), ins = $('[data-insert]', art);
    const arts = $$('article', detail), was = arts.map(a => a.hidden), top = detail.scrollTop;
    arts.forEach(a => (a.hidden = a !== art));
    const dbox = detail.getBoundingClientRect();
    const wd = el => { const b = el.getBoundingClientRect(); return { x: vw + b.left - dbox.left, y: b.top - dbox.top + detail.scrollTop, w: b.width, h: b.height }; };
    const mapR = map && wd(map), insR = ins && wd(ins);
    arts.forEach((a, k) => (a.hidden = was[k])); detail.scrollTop = top;
    if (insR) {
      // the insert hangs between two rollers of leaf gold, the length of the scroll it pins through
      const inset = vw > 820 ? vw * .06 + 12 : 10, y0 = insR.y + vh * .07, y1 = insR.y + insR.h - vh * .07;
      for (const x of [insR.x + inset, insR.x + insR.w - inset - 1]) {
        K.fill([[x, y0], [x, y1]], 7, INK, SPAN, { gold: true, outline: false, profile: PROFILE.flat, speed: (y1 - y0) / .9, ease: .3 });
        for (const y of [y0, y1]) { K.disc(x, y, 12, INK, SPAN + .5, { gold: true, outline: false }); K.disc(x, y, 4.5, VERM, SPAN + .7, { outline: false }); }
      }
      demo = { end: SPAN + 1.2 };
    }
    if (map) {
      // the chart lives in the world's third column, which has its own camera (it follows the pinned stage)
      // and its own clock (the scroll's progress through the pin, a second a step)
      const R = { x: 2 * vw + mapR.x - vw, y: 0, w: mapR.w, h: mapR.h };
      const out = seaMap({ add, K, mask, R });
      map.querySelectorAll('.lab').forEach(l => l.remove());
      for (const { text, at: [x, y], kind, step } of out.labels) {
        const el = document.createElement('span'); el.className = `lab ${kind}`; el.textContent = text; el.dataset.step = step;
        el.style.left = `${(x - R.x) / R.w * 100}%`; el.style.top = `${(y - R.y) / R.h * 100}%`;
        map.append(el);
      }
      sea = { el: map, pin: art.querySelector('[data-pin]'), R, steps: out.steps, labs: [...map.querySelectorAll('.lab')], lis: [...art.querySelectorAll('[data-pin] .steps li')] };
    }
  }

  document.documentElement.classList.remove('measuring');
  return { S, masks, demo, sea };
}

// ── the clocks, the track, the light ──────────────────────────────────────────────────────────────────────
const need = () => { if (!raf) raf = requestAnimationFrame(frame); };
const ease = u => (u < .5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);

function frame(now) {
  raf = 0;
  const dt = last && now - last < 100 ? (now - last) / 1000 : 1 / 60; last = now;
  let busy = false;
  // the index's clock: through sections already passed in a rush, the newest at its own pace
  const tgt = (st.rev + 1) * SPAN;
  if (st.main < tgt) { st.main = Math.min(tgt, st.main + dt * (1 + Math.max(0, st.rev * SPAN - st.main) * 3)); busy = true; }
  // a project page's clock: its header, then (once scrolled to) its demonstration, rushing if behind
  if (st.open >= 0) {
    const dm = D[st.open].demo, dt2 = st.drev && dm ? dm.end + .3 : SPAN;
    if (st.det < dt2) { st.det = Math.min(dt2, st.det + dt * (1 + Math.max(0, SPAN - st.det) * (st.drev ? 3 : 0))); busy = true; }
    const fig = $(`article[data-p=${PROJ[st.open]}] [data-demo]`, detail);
    if (fig && dm) fig.classList.toggle('on', st.det > dm.end - .7);
    // the pinned chart: its clock follows the scroll through the pin, eased, both ways
    const L = D[st.open], sea = L.sea;
    if (sea) {
      const pin = sea.pin, goal = clamp((detail.scrollTop - pin.offsetTop + vh * .45) / (pin.offsetHeight - vh * .55)) * sea.steps;
      const was = L.seaP; L.seaP = reduced ? goal : L.seaP + (goal - L.seaP) * Math.min(1, dt * 7);
      if (Math.abs(goal - L.seaP) < .002) L.seaP = goal;
      if (L.seaP !== was || goal !== was) busy = true;
      const on = Math.min(sea.steps - 1, Math.floor(L.seaP + .1));
      sea.lis.forEach((li, i) => li.classList.toggle('on', L.seaP > .05 && i === on));
      sea.labs.forEach(l => l.classList.toggle('on', L.seaP > +l.dataset.step + .6));
    }
  }
  if (st.t0) {
    const u = clamp((now - st.t0) / 850);
    st.track = lerp(st.from, st.to, ease(u));
    if (u >= 1) { st.t0 = 0; if (st.to === 0) { st.open = -1; st.det = -1; reelCur = null; playPlate(null); } }
    busy = true;
  }
  const goal = st.ptr || [vw * .7, vh * .12];
  st.light = st.light ? st.light.map((v, i) => v + (goal[i] - v) * .18) : goal.slice();
  if (Math.hypot(st.light[0] - goal[0], st.light[1] - goal[1]) > .5) busy = true;
  draw();
  if (busy) need();
}

function draw() {
  track.style.transform = `translateX(${-st.track * vw}px)`;
  const mainCam = [st.track * vw, index.scrollTop], detCam = st.open >= 0 ? [vw * (st.open + st.track), detail.scrollTop] : [0, 0];
  const split = vw * (1 - st.track), [lx, ly] = st.light, cam = lx < split ? mainCam : detCam;
  const Dp = st.open >= 0 ? D[st.open] : null;
  for (const L of [B, Dp]) if (L) { L.colW = vw; L.split = split; L.splitCams = [...mainCam, ...detCam]; L.light = [lx + cam[0], ly + cam[1], 360]; }
  B.cams = [[...mainCam, st.track > .999 ? -1 : st.main]];   // nothing of the index once it has fully gone
  page.render(0);
  // the open project's page lives in its layer's second column, seen from where the track has it
  if (Dp?.ready) {
    Dp.cams = [[0, 0, -1], [st.track * vw, detail.scrollTop, st.det]];
    if (Dp.sea) {
      const b = Dp.sea.el.getBoundingClientRect(), mc = [Dp.sea.R.x - b.left, Dp.sea.R.y - b.top];
      Dp.cams.push([...mc, Dp.seaP]);
      if (Dp.seaP > 0) Dp.splitCams = [...mainCam, ...mc];
    }
    Dp.render(page.ctx.getCurrentTexture().createView(), 0);
  }
}

function reveal() {
  const y = index.scrollTop + vh * .78;
  secs.forEach((s, i) => { if (s.offsetTop < y) { st.rev = Math.max(st.rev, i); s.classList.add('on'); } });
  // the rail follows the section whose middle is nearest the screen's
  let on = 0, best = 1e9;
  secs.forEach((s, i) => { const d = Math.abs(s.offsetTop + s.offsetHeight / 2 - index.scrollTop - vh / 2); if (d < best) { best = d; on = i; } });
  $$('a', rail).forEach(a => a.classList.toggle('on', a.dataset.to === secs[on].dataset.sec));
}

function slide(to) { st.from = st.track; st.to = to; st.t0 = reduced ? 0 : performance.now(); if (reduced) { st.track = to; if (!to) { st.open = -1; st.det = -1; } } need(); }
function open(p, push = true) {
  const i = PROJ.indexOf(p); if (i < 0) return;
  $$('article', detail).forEach(a => (a.hidden = a.dataset.p !== p));
  reelCur = null; playPlate(null);
  detail.scrollTop = 0; st.open = i; st.det = reduced ? 1e3 : 0; st.drev = reduced ? 1 : 0;
  buildProject(i);
  document.body.classList.add('away');
  if (push) history.pushState({ p }, '', `#/${p}`);
  document.body.classList.remove('down');
  slide(1); reel();
}
function close(push = true) {
  document.body.classList.remove('away');
  if (push && history.state?.p) history.back(); else slide(0);
}

// the making-of reel: the pin is as tall as the reel is wide, and the page's scroll slides the reel across.
// The picture nearest the left margin is current: its words go to the fixed line, and if it is a plate, the
// plate itself is loaded and plays from its start (one at a time, so only one GPU scene ever runs)
let reelCur = null, reelTimer = 0;
function reel() {
  const pin = st.open >= 0 && $(`article[data-p=${PROJ[st.open]}] [data-reel]`, detail);
  if (!pin) return;
  const r = $('.reel', pin), over = Math.max(0, r.scrollWidth - vw);
  if (Math.abs(pin.offsetHeight - (over + vh)) > 2) pin.style.height = `${over + vh}px`;
  const f = clamp((detail.scrollTop - pin.offsetTop) / Math.max(1, pin.offsetHeight - vh));
  r.style.transform = `translateX(${-f * over}px)`;
  const anchor = vw > 820 ? vw * .14 : 22, cards = $$('.card', r);
  let cur = cards[0], best = 1e9;
  for (const c of cards) { const b = c.getBoundingClientRect(), d = Math.abs(b.left - anchor); if (b.right > anchor + 40 && d < best) { best = d; cur = c; } }
  if (cur === reelCur) return;
  reelCur = cur;
  const line = $('.reeltext', pin), p = $('p', cur);
  line.classList.add('out');
  setTimeout(() => { line.innerHTML = cur.classList.contains('text') ? '' : p ? p.innerHTML : ''; line.classList.remove('out'); }, 250);
  clearTimeout(reelTimer);
  reelTimer = setTimeout(() => playPlate(cur), 350);
}
function playPlate(card) {
  for (const f of $$('.card iframe', detail)) if (f.parentNode !== card) f.remove();
  if (!card?.dataset.plate || $('iframe', card) || reduced) return;
  const f = document.createElement('iframe');
  f.src = `plates/${card.dataset.plate}/?embed&pace=1.35`; f.title = card.dataset.plate; f.tabIndex = -1;
  f.addEventListener('load', () => setTimeout(() => f.classList.add('on'), 150));
  card.append(f);
}

function buildProject(i) {
  if (D[i].ready) return;
  const { S, masks, demo, sea } = compose(i); D[i].masks = masks; D[i].load(S); D[i].ready = true; D[i].demo = demo; D[i].sea = sea; D[i].seaP = 0;
}

// ── start ─────────────────────────────────────────────────────────────────────────────────────────────────
const dev = await device();
if (!dev) secs.forEach(s => s.classList.add('on'));
else {
  page = new GPage(dev); B = page.bristles; $('#gpu').append(page.canvas);
  PROJ.forEach(() => D.push(new Bristles(dev, page.format)));
  const build = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2), g = ++gen;
    const t = performance.now(), { S, masks } = compose();
    page.resize(vw, vh, dpr); B.page = [vw, vh];
    B.masks = masks; B.load(S);
    D.forEach(L => { L.ready = false; L.resize(page.canvas.width, page.canvas.height, dpr); L.page = [vw, vh]; });
    if (st.open >= 0) buildProject(st.open);
    // the rest in idle time, one at a time, once the index has had its first second
    PROJ.forEach((_, i) => setTimeout(() => g === gen && buildProject(i), 1400 + i * 300));
    window.__stats = { ...B.stats, ms: Math.round(performance.now() - t) };
    reveal(); need();
  };
  await document.fonts.ready;
  build();
  if (reduced) { st.main = 1e3; st.rev = secs.length; }
  let rt = 0;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(build, 160); });
  index.addEventListener('scroll', () => { reveal(); need(); }, { passive: true });
  detail.addEventListener('scroll', () => {
    const fig = st.open >= 0 && $(`article[data-p=${PROJ[st.open]}] [data-demo]`, detail);
    if (fig && fig.offsetTop < detail.scrollTop + vh * .8) st.drev = 1;
    document.body.classList.toggle('down', detail.scrollTop > vh * .2);
    reel();
    need();
  }, { passive: true });
  addEventListener('pointermove', e => { st.ptr = [e.clientX, e.clientY]; need(); });
  $$('[data-open]').forEach(b => b.addEventListener('click', () => open(b.dataset.open)));
  $$('[data-back]').forEach(b => b.addEventListener('click', () => close()));
  addEventListener('keydown', e => { if (e.key === 'Escape' && st.open >= 0) close(); });
  addEventListener('popstate', e => (e.state?.p ? open(e.state.p, false) : st.track > 0 || st.open >= 0 ? slide(0) : null));
  $$('a', rail).concat($$('.cue')).forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    const s = secs.find(x => x.dataset.sec === (a.dataset.to || 'pum'));
    index.scrollTo({ top: s.offsetTop - (s.dataset.sec === 'hero' ? 0 : vh * .08), behavior: reduced ? 'auto' : 'smooth' });
  }));
  const insert = $('[data-insert]'); if (insert) mountMagi(insert, detail);
  if (location.hash.startsWith('#/')) open(location.hash.slice(2), false);
  window.__site = { st, B, open, close };
}
