// A bristle brush for canvas 2D. A stroke is a centreline + a pressure profile; the brush is N bristles,
// each with its own ink load, so the stroke breaks into dry streaks (kasure) as the load runs out and
// wherever the paper tooth is high. Everything is precomputed per stroke, so drawing up to any point
// along the stroke is deterministic and replayable.
import { clamp, lerp, rng, noise1, noise2 } from './util.js';

const cr = (a, b, c, d, t) => .5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);

// Catmull-Rom through pts, resampled to even arc length
export function spline(pts, step = 1.4) {
  const P = [pts[0], ...pts, pts[pts.length - 1]], D = [];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const m = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 2));
    for (let k = 0; k < m; k++) D.push([cr(p0[0], p1[0], p2[0], p3[0], k / m), cr(p0[1], p1[1], p2[1], p3[1], k / m)]);
  }
  D.push(pts[pts.length - 1]);
  const xs = [D[0][0]], ys = [D[0][1]];
  let acc = 0, want = step;
  for (let i = 1; i < D.length; i++) {
    const [ax, ay] = D[i - 1], [bx, by] = D[i], d = Math.hypot(bx - ax, by - ay);
    while (acc + d >= want && d > 0) { const u = (want - acc) / d; xs.push(ax + (bx - ax) * u); ys.push(ay + (by - ay) * u); want += step; }
    acc += d;
  }
  if (xs.length < 2) { xs.push(D[D.length - 1][0] + .01); ys.push(D[D.length - 1][1]); }
  const n = xs.length, x = Float32Array.from(xs), y = Float32Array.from(ys), nx = new Float32Array(n), ny = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2), dx = x[b] - x[a], dy = y[b] - y[a], l = Math.hypot(dx, dy) || 1;
    nx[i] = -dy / l; ny[i] = dx / l;
  }
  return { x, y, nx, ny, n, L: (n - 1) * step, step };
}

// straight segments, corners kept sharp; same shape as spline()
export function polyline(pts, step = 1.4) {
  const xs = [], ys = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], m = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 0; k < m; k++) { xs.push(ax + (bx - ax) * k / m); ys.push(ay + (by - ay) * k / m); }
  }
  xs.push(pts[pts.length - 1][0]); ys.push(pts[pts.length - 1][1]);
  const n = xs.length, x = Float32Array.from(xs), y = Float32Array.from(ys), nx = new Float32Array(n), ny = new Float32Array(n);
  let L = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1), dx = x[b] - x[a], dy = y[b] - y[a], l = Math.hypot(dx, dy) || 1;
    nx[i] = -dy / l; ny[i] = dx / l; if (i) L += Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]);
  }
  return { x, y, nx, ny, n, L, step: L / Math.max(1, n - 1) };
}

// pressure profiles, u = 0..1 along the stroke
export const PROFILE = {
  stroke: u => clamp(u / .1) ** .6 * (1 - .6 * clamp((u - .72) / .28) ** 1.4),   // press, travel, lift
  blunt: u => (.62 + .38 * clamp(u / .12) ** .7) * (1 - .32 * clamp((u - .78) / .22)),  // square entry, heavy all the way
  leaf: u => Math.sin(Math.PI * u ** .8) ** .85,                                     // pointed in, belly, pointed out
  petal: u => Math.sin(Math.PI * clamp(u * .92 + .04)) ** .45,                       // round both ends
  taper: u => clamp(u / .05) ** .5 * (1 - u) ** .9,                                  // full start, hairline end
  hair: u => .35 + .65 * Math.sin(Math.PI * u),
  tap: u => Math.sin(Math.PI * u) ** .5,
  flat: () => 1,
};

const css = ([r, g, b], a) => `rgba(${r},${g},${b},${a.toFixed(3)})`;

export class Stroke {
  constructor(o) {
    Object.assign(this, {
      w: 10, color: [24, 22, 20], alpha: .85, ink: 1.4, dry: .15, grain: .4, profile: PROFILE.stroke,
      speed: 800, minDur: .18, start: 0, bristles: 0, seed: 1, pen: false, wobble: .1, ease: .7, step: 1.4,
    }, o);
    this.path = (this.linear ? polyline : spline)(o.pts, this.step);
    this.dur = Math.max(this.minDur, this.path.L / this.speed);
    this.end = this.start + this.dur;
  }

  prepare() {
    if (this.B) return;
    const r = rng(this.seed), { x, y, nx, ny, n, L, step } = this.path;
    const nb = this.pen ? 1 : this.bristles || Math.round(clamp(this.w * 1.15, 5, 120));
    const prof = new Float32Array(n);
    for (let k = 0; k < n; k++) prof[k] = Math.max(.035, this.profile(k / (n - 1)));
    this.B = [];
    for (let b = 0; b < nb; b++) {
      const o = nb === 1 ? 0 : clamp(((b + .5 + (r() - .5) * .9) / nb) * 2 - 1, -1, 1);
      const th = this.pen ? this.w : (this.w / nb) * lerp(.9, 2.1, r()) + .25;
      const a = this.pen ? this.alpha : this.alpha * lerp(.35, 1, r() ** .7);
      const inkLen = L * this.ink * lerp(.55, 1.5, r()) * (1 - .45 * o * o) + 6;
      const ph = r() * 1e3, sc = lerp(3, 16, r()), lag = lerp(-.04, .04, r()) * this.w;
      const P = new Float32Array(n * 2), M = new Uint8Array(n);
      for (let k = 0; k < n; k++) {
        const s = k * step, p = prof[k], hw = this.w * .5 * p;
        const wob = (noise1(s / 70 + ph, 11) - .5) * this.wobble * this.w;
        const off = o * hw + wob + lag * (1 - p);
        const px = x[k] + nx[k] * off, py = y[k] + ny[k] * off;
        P[2 * k] = px; P[2 * k + 1] = py;
        if (this.pen) { M[k] = 1; continue; }
        const left = 1 - s / inkLen;
        const v = lerp(noise1(s / sc + ph, 3), noise2(px * .45, py * .45, 5), this.grain);
        const thr = this.dry * .55 + (left < 0 ? 1 : (1 - left) ** 2 * .75) + (Math.abs(o) ** 4) * .3 * (1 - p) - .12 * p;
        M[k] = v > thr ? 1 : 0;
      }
      this.B.push({ P, M, th, style: css(this.color, a) });
    }
  }

  // index of the last sample reached at time t
  reach(t) {
    const u = clamp((t - this.start) / this.dur), e = lerp(u, u * u * (3 - 2 * u), this.ease);
    return Math.floor(e * (this.path.n - 1));
  }

  // wash: a flat, boneless body (the envelope, filled once) with the darker rim of pigment that
  // gathers where a wet stroke dries
  drawWash(ctx, k1) {
    const { x, y, nx, ny } = this.path, n = this.path.n, L = [], R = [];
    for (let k = 0; k <= k1; k++) {
      const hw = this.w * .5 * Math.max(.04, this.profile(k / (n - 1)));
      L.push(x[k] + nx[k] * hw, y[k] + ny[k] * hw); R.push(x[k] - nx[k] * hw, y[k] - ny[k] * hw);
    }
    ctx.beginPath(); ctx.moveTo(L[0], L[1]);
    for (let i = 2; i < L.length; i += 2) ctx.lineTo(L[i], L[i + 1]);
    for (let i = R.length - 2; i >= 0; i -= 2) ctx.lineTo(R[i], R[i + 1]);
    ctx.closePath();
    ctx.fillStyle = css(this.color, this.alpha); ctx.fill();
    ctx.lineJoin = 'round'; ctx.lineWidth = this.rim ?? 1.1; ctx.strokeStyle = css(this.color, Math.min(1, this.alpha * .7)); ctx.stroke();
  }

  draw(ctx, k1 = this.path.n - 1) {
    if (this.wash) return this.drawWash(ctx, k1);
    this.prepare();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const { P, M, th, style } of this.B) {
      ctx.beginPath(); let down = false;
      for (let k = 0; k <= k1; k++) {
        if (M[k]) { if (down) ctx.lineTo(P[2 * k], P[2 * k + 1]); else { ctx.moveTo(P[2 * k], P[2 * k + 1]); down = true; } }
        else if (down) { down = false; }
      }
      ctx.lineWidth = th; ctx.strokeStyle = style; ctx.stroke();
    }
  }
}

// A seal: a square of vermilion paste whose edges and tooth come from noise, with a glyph carved out.
export class Stamp {
  constructor(o) {
    Object.assign(this, { x: 0, y: 0, size: 40, color: [208, 56, 36], alpha: .92, glyph: '', start: 0, seed: 1, font: '"Hiragino Mincho ProN","Yu Mincho",serif' }, o);
    this.dur = .1; this.end = this.start + this.dur; this.path = { n: 2 };
  }
  reach(t) { return t >= this.start ? 1 : 0; }
  prepare() {}
  draw(ctx) {
    const { x, y, size, seed } = this, c = .5, n = Math.round(size / c);
    ctx.fillStyle = css(this.color, this.alpha);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const u = i / (n - 1), v = j / (n - 1), e = Math.min(u, v, 1 - u, 1 - v);
      const g = noise2(i * .35, j * .35, seed) * .6 + noise2(i * 1.7, j * 1.7, seed + 1) * .4;
      if (g > .26 + .5 * Math.max(0, .05 - e) / .05 * noise2(i * .2, j * .2, seed + 2) + .03) ctx.fillRect(x + i * c, y + j * c, c + .02, c + .02);
    }
    if (!this.glyph) return;
    ctx.save(); ctx.globalCompositeOperation = 'destination-out';
    ctx.font = `600 ${size * .74}px ${this.font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000'; ctx.fillText(this.glyph, x + size / 2, y + size * .53);
    ctx.restore();
  }
}

// Committed strokes live on `base`; strokes in flight are redrawn whole each frame onto a scratch
// layer and multiplied over, so overlapping colours mix like pigment rather than stacking like paint.
export class Painter {
  constructor(W, H, bg = '#fff') {
    this.W = W; this.H = H; this.bg = bg;
    this.canvas = document.createElement('canvas'); this.ctx = this.canvas.getContext('2d');
    this.base = document.createElement('canvas'); this.bctx = this.base.getContext('2d');
    this.scr = document.createElement('canvas'); this.sctx = this.scr.getContext('2d');
    this.scale = 1; this.strokes = [];
  }
  setSize(W, H) { this.W = W; this.H = H; }
  resize(scale) {
    this.scale = scale;
    for (const c of [this.canvas, this.base, this.scr]) { c.width = Math.round(this.W * scale); c.height = Math.round(this.H * scale); }
  }
  reset(strokes) {
    this.strokes = strokes.slice().sort((a, b) => a.start - b.start);
    for (const s of this.strokes) s.done = false;
    const b = this.bctx; b.setTransform(1, 0, 0, 1, 0, 0); b.globalCompositeOperation = 'source-over';
    if (this.bg) { b.fillStyle = this.bg; b.fillRect(0, 0, this.base.width, this.base.height); } else b.clearRect(0, 0, this.base.width, this.base.height);
  }
  // A mark's footprint in design units, cached. Clearing and compositing only this rectangle, rather than
  // the whole page, is what keeps hundreds of short strokes in flight cheap (a fern rib is ~1/1000 of
  // the page). Marks without geometry (typed labels) fall back to the whole page.
  box(s) {
    if (s._bb !== undefined) return s._bb;
    let bb = null;
    if (s.path?.x) {
      const { x, y } = s.path; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < x.length; i++) { if (x[i] < x0) x0 = x[i]; if (x[i] > x1) x1 = x[i]; if (y[i] < y0) y0 = y[i]; if (y[i] > y1) y1 = y[i]; }
      const p = (s.w || 0) * .75 + (s.rim || 0) + 6;
      bb = [x0 - p, y0 - p, x1 + p, y1 + p];
    } else if (s.r != null && s.x != null) bb = [s.x - s.r - 3, s.y - s.r - 3, s.x + s.r + 3, s.y + s.r + 3];
    else if (s instanceof Stamp) bb = [s.x - 2, s.y - 2, s.x + s.size + 2, s.y + s.size + 2];
    return (s._bb = bb);
  }
  rect(s) {
    const bb = this.box(s), W = this.scr.width, H = this.scr.height;
    if (!bb) return [0, 0, W, H];
    const x0 = Math.max(0, Math.floor(bb[0] * this.scale)), y0 = Math.max(0, Math.floor(bb[1] * this.scale));
    const x1 = Math.min(W, Math.ceil(bb[2] * this.scale)), y1 = Math.min(H, Math.ceil(bb[3] * this.scale));
    return [x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0)];
  }
  // Draw a batch of marks into the scratch canvas inside the union of their rectangles, then composite that
  // rectangle once. Marks in flight are batched by blend mode: one flush per group per frame, rather than one
  // per mark (a fern puts ~30 ribs in flight at once). Within a batch marks stack source-over, then the batch
  // multiplies onto the page, which for same-coloured ribs is indistinguishable.
  batch(target, items) {
    if (!items.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [s] of items) { const [x, y, w, h] = this.rect(s); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h); }
    const w = x1 - x0, h = y1 - y0; if (w <= 0 || h <= 0) return;
    const c = this.sctx;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(x0, y0, w, h);
    c.save(); c.beginPath(); c.rect(x0, y0, w, h); c.clip(); c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    for (const [s, k] of items) s.draw(c, k);
    c.restore();
    target.globalCompositeOperation = items[0][0].blend || 'multiply';
    target.drawImage(this.scr, x0, y0, w, h, x0, y0, w, h);
    target.globalCompositeOperation = 'source-over';
  }
  // consecutive marks (in start order) that share a blend mode go together; order is kept across groups
  groups(target, items) {
    let g = [];
    for (const it of items) { if (g.length && (g[0][0].blend || 'multiply') !== (it[0].blend || 'multiply')) { this.batch(target, g); g = []; } g.push(it); }
    this.batch(target, g);
  }
  step(t0, t1) {
    const done = [];
    for (const s of this.strokes) {
      if (s.start > t1) break;
      if (!s.done && s.end <= t1) { s.done = true; done.push([s, undefined]); }
    }
    if (!done.length) return;
    this.bctx.setTransform(1, 0, 0, 1, 0, 0);
    this.groups(this.bctx, done);
    for (const [s] of done) s.B = null;   // free the bristle cache once it is on the page
  }
  render(t) {
    const c = this.ctx; c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over';
    if (!this.bg) c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.drawImage(this.base, 0, 0);
    const live = [];
    for (const s of this.strokes) {
      if (s.start > t) break;
      if (s.done) continue;
      const k = s.reach(t); if (k >= 1) live.push([s, k]);
    }
    this.groups(c, live);
  }
}
