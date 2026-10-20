// Pen-and-type marks for the Painter: a broad nib that sweeps its own width, text that types itself, a dot.
// Each has the Painter's shape: start, dur, end, reach(t), draw(ctx, k), prepare().
import { lerp, clamp, TAU } from './util.js';
import { spline } from './brush.js';

const css = ([r, g, b], a = 1) => `rgba(${r},${g},${b},${a})`;
const MUTE = [138, 143, 152], SUMI = [24, 21, 20];

// polyline sampled evenly with corners kept sharp (textura is all corners)
export function poly(pts, step = .8) {
  const xs = [], ys = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], m = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 0; k < m; k++) { xs.push(ax + (bx - ax) * k / m); ys.push(ay + (by - ay) * k / m); }
  }
  xs.push(pts[pts.length - 1][0]); ys.push(pts[pts.length - 1][1]);
  return { x: Float32Array.from(xs), y: Float32Array.from(ys), n: xs.length, L: (xs.length - 1) * step };
}

// a broad-nib stroke: the nib is a segment of width w at angle a; the ink is the area it sweeps
export class Nib {
  constructor(o) {
    Object.assign(this, { w: 10, angle: 40, color: SUMI, alpha: 1, start: 0, speed: 260, minDur: .06, ease: .5 }, o);
    // curve: pass the points through a spline first, so bowls are round rather than faceted
    const pts = this.curve ? (({ x, y }) => Array.from(x, (v, i) => [v, y[i]]))(spline(o.pts, 2)) : o.pts;
    this.path = poly(pts);
    this.dur = Math.max(this.minDur, this.path.L / this.speed); this.end = this.start + this.dur;
    const a = this.angle * Math.PI / 180; this.ex = Math.cos(a) * this.w / 2; this.ey = -Math.sin(a) * this.w / 2;
  }
  prepare() {}
  reach(t) { const u = clamp((t - this.start) / this.dur), e = lerp(u, u * u * (3 - 2 * u), this.ease); return Math.floor(e * (this.path.n - 1)); }
  draw(ctx, k1 = this.path.n - 1) {
    const { x, y } = this.path, { ex, ey } = this;
    ctx.beginPath();
    for (let k = 0; k < k1; k++) {
      const q = [[x[k] - ex, y[k] - ey], [x[k] + ex, y[k] + ey], [x[k + 1] + ex, y[k + 1] + ey], [x[k + 1] - ex, y[k + 1] - ey]];
      let area = 0; for (let i = 0; i < 4; i++) { const [a, b] = q[i], [c, d] = q[(i + 1) % 4]; area += a * d - b * c; }
      if (area < 0) q.reverse();
      ctx.moveTo(q[0][0], q[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0], q[i][1]); ctx.closePath();
    }
    // the nib's own footprint at the ends, so a stroke never starts or stops on a sliver
    for (const k of [0, k1]) { ctx.moveTo(x[k] - ex, y[k] - ey); ctx.lineTo(x[k] + ex + .01, y[k] + ey + .4); ctx.lineTo(x[k] + ex, y[k] + ey); }
    ctx.fillStyle = css(this.color, this.alpha); ctx.fill('nonzero');
  }
}

// text that types itself
export class Label {
  constructor(o) { Object.assign(this, { size: 11, color: MUTE, align: 'left', weight: 400, track: .06, start: 0, cps: 60, font: '"Helvetica Neue",Helvetica,Arial,sans-serif', rot: 0 }, o); this.path = { n: this.text.length + 1 }; this.dur = this.text.length / this.cps; this.end = this.start + this.dur; }
  prepare() {}
  reach(t) { return Math.floor(clamp((t - this.start) / this.dur) * this.text.length) + 1; }
  draw(ctx, k1 = this.text.length + 1) {
    ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.rot);
    ctx.font = `${this.weight} ${this.size}px ${this.font}`; ctx.letterSpacing = `${this.track * this.size}px`;
    ctx.textAlign = this.align; ctx.fillStyle = css(this.color); ctx.fillText(this.text.slice(0, k1 - 1), 0, 0);
    ctx.restore();
  }
}

// a pricking hole, a pearl: one dot
export class Dot {
  constructor(o) { Object.assign(this, { r: 1.6, color: SUMI, alpha: 1, start: 0, ring: false }, o); this.dur = .04; this.end = this.start + this.dur; this.path = { n: 2 }; }
  prepare() {}
  reach(t) { return t >= this.start ? 1 : 0; }
  draw(ctx) {
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, TAU);
    if (this.ring) { ctx.lineWidth = .7; ctx.strokeStyle = css(this.color, this.alpha); ctx.stroke(); }
    else { ctx.fillStyle = css(this.color, this.alpha); ctx.fill(); }
  }
}

