// Wet media on WebGPU. A grid of cells, each holding water and suspended pigment (as absorbance, so
// colours mix subtractively), over a fibrous paper whose permeability and wetting threshold vary cell
// to cell. Brush stamps are rasterised additively into an inflow texture; compute then lets water run
// downhill across the fibres, carries pigment with it, evaporates fastest where it is thin (so pigment
// is drawn out to the drying edge), and deposits what is left. Display is exp(-absorbance) over white.
import { spline, PROFILE } from './brush.js';
import { clamp, lerp, rng, hash } from './util.js';

const WGSL_COMMON = /* wgsl */`
struct U {
  size: vec2u, res: f32, nStamps: u32,
  kFlow: f32, evap: f32, edge: f32, wDry: f32,
  dep0: f32, dep1: f32, theta: f32, gran: f32,
  inkScale: f32, wetDark: f32, view: vec2f,
  mob: f32, rim: f32, _b: f32, _c: f32,
};
fn h21(p: vec2f) -> f32 { var q = fract(p * vec2f(123.34, 456.21)); q += dot(q, q + 45.32); return fract(q.x * q.y); }
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2f(1, 0)), u.x), mix(h21(i + vec2f(0, 1)), h21(i + vec2f(1, 1)), u.x), u.y);
}
`;

const WGSL_PAPER = WGSL_COMMON + /* wgsl */`
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read_write> paper: array<vec4f>;
fn rot(p: vec2f, a: f32) -> vec2f { let c = cos(a); let s = sin(a); return vec2f(c * p.x - s * p.y, s * p.x + c * p.y); }
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u.size.x || id.y >= u.size.y) { return; }
  let p = vec2f(id.xy) / u.res;
  // fibres: thin, long streaks at a few orientations, plus a soft cloud (formation) underneath
  var fib = 0.0;
  for (var k = 0; k < 5; k++) {
    let a = f32(k) * 1.37 + 0.4;
    let q = rot(p, a) * vec2f(0.035, 0.9) + vec2f(f32(k) * 17.0, 3.0);
    fib = max(fib, smoothstep(0.7, 0.97, vnoise(q)) * (0.6 + 0.4 * vnoise(p * 0.02 + f32(k))));
  }
  let cloud = vnoise(p * 0.012) * 0.6 + vnoise(p * 0.05) * 0.4;
  let tooth = vnoise(p * 0.7);
  // x: height (granulation), y: wetting threshold, z: permeability
  paper[id.y * u.size.x + id.x] = vec4f(tooth * 0.6 + fib * 0.4, 0.55 + 0.9 * (1.0 - fib) * (0.5 + cloud), 0.35 + 0.65 * fib + 0.2 * cloud, 0.0);
}`;

const WGSL_STAMP = WGSL_COMMON + /* wgsl */`
struct S { pos: vec2f, r: f32, ang: f32, col: vec3f, water: f32, pig: f32, dry: f32, seed: f32, aspect: f32 };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read> st: array<S>;
@group(0) @binding(2) var<storage, read> paper: array<vec4f>;
struct V { @builtin(position) pos: vec4f, @location(0) l: vec2f, @location(1) @interpolate(flat) i: u32 };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> V {
  var quad = array(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  let c = quad[vi] * 1.15;
  let s = st[ii];
  let ca = cos(s.ang); let sa = sin(s.ang);
  let off = vec2f(c.x * s.r * s.aspect, c.y * s.r);
  let w = (s.pos + vec2f(ca * off.x - sa * off.y, sa * off.x + ca * off.y)) * u.res;
  var o: V; o.pos = vec4f(w.x / f32(u.size.x) * 2.0 - 1.0, 1.0 - w.y / f32(u.size.y) * 2.0, 0, 1); o.l = c; o.i = ii; return o;
}
@fragment fn fs(v: V) -> @location(0) vec4f {
  let s = st[v.i];
  let d = length(v.l); if (d > 1.0) { discard; }
  let body = 1.0 - smoothstep(0.7, 1.0, d);
  let cell = vec2u(clamp(v.pos.xy, vec2f(0), vec2f(u.size) - 1.0));
  let pp = paper[cell.y * u.size.x + cell.x];
  // bristle lanes across the brush; a dry brush only touches where lane and paper tooth agree
  let lane = h21(vec2f(floor((v.l.y * 0.5 + 0.5) * 22.0), s.seed));
  let gate = smoothstep(s.dry - 0.08, s.dry + 0.08, mix(lane, pp.x, 0.45));
  let m = body * gate;
  return vec4f(s.col * s.pig * m, s.water * m * mix(1.0, 0.4, s.dry));
}`;

const WGSL_APPLY = WGSL_COMMON + /* wgsl */`
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read_write> a: array<vec4f>;
@group(0) @binding(2) var inflow: texture_2d<f32>;
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u.size.x || id.y >= u.size.y) { return; }
  let i = id.y * u.size.x + id.x;
  a[i] += textureLoad(inflow, vec2i(id.xy), 0);
}`;

const WGSL_STEP = WGSL_COMMON + /* wgsl */`
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read> src: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> dst: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> dep: array<vec4f>;
@group(0) @binding(4) var<storage, read> paper: array<vec4f>;
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u.size.x || id.y >= u.size.y) { return; }
  let W = u.size.x; let i = id.y * W + id.x;
  let c = src[i]; let pi = paper[i];
  var w = c.a; var p = c.rgb;
  var dw = 0.0; var dp = vec3f(0);
  var offs = array(vec2i(1, 0), vec2i(-1, 0), vec2i(0, 1), vec2i(0, -1), vec2i(1, 1), vec2i(-1, -1), vec2i(1, -1), vec2i(-1, 1));
  for (var k = 0; k < 8; k++) {
    let q = vec2i(id.xy) + offs[k];
    if (q.x < 0 || q.y < 0 || q.x >= i32(W) || q.y >= i32(u.size.y)) { continue; }
    let j = u32(q.y) * W + u32(q.x);
    let cn = src[j]; let pn = paper[j];
    let wn = cn.a;
    // wetting front: water only crosses into a dry-ish pair when the wetter side clears the fibre threshold
    let th = u.theta * (pi.y + pn.y) * 0.5;
    if (max(w, wn) < th) { continue; }
    let f = u.kFlow * (pi.z + pn.z) * 0.5 * (wn - w) * select(1.0, 0.7071, k >= 4);
    dw += f;
    dp += f * u.mob * select(p / max(w, 1e-5), cn.rgb / max(wn, 1e-5), f > 0.0);
  }
  w = max(0.0, w + dw); p = max(vec3f(0), p + dp);
  let thin = 1.0 - smoothstep(0.0, u.wDry, w);
  w = max(0.0, w - u.evap * (1.0 + u.edge * thin));
  var rate = u.dep0 + u.dep1 * thin * thin;
  if (w < 1e-4) { rate = 1.0; }
  rate = clamp(rate * mix(1.0, 0.4 + 1.2 * pi.x, u.gran), 0.0, 1.0);
  let d = p * rate;
  dep[i] += vec4f(d, 0);
  dst[i] = vec4f(p - d, w);
}`;

const WGSL_SHOW = WGSL_COMMON + /* wgsl */`
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read> a: array<vec4f>;
@group(0) @binding(2) var<storage, read> dep: array<vec4f>;
@vertex fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  var tri = array(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3)); return vec4f(tri[vi], 0, 1);
}
fn at(q: vec2i) -> vec4f {
  let c = clamp(q, vec2i(0), vec2i(u.size) - 1); let i = u32(c.y) * u.size.x + u32(c.x);
  let s = a[i]; return vec4f(dep[i].rgb + s.rgb * 0.85, s.a);
}
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let g = fc.xy / u.view * vec2f(u.size) - 0.5;
  let b = vec2i(floor(g)); let f = fract(g);
  let a00 = at(b); let a10 = at(b + vec2i(1, 0)); let a01 = at(b + vec2i(0, 1)); let a11 = at(b + vec2i(1, 1));
  let v = mix(mix(a00, a10, f.x), mix(a01, a11, f.x), f.y);
  var col = exp(-v.rgb * u.inkScale);
  if (u.rim > 0.0) {
    let s00 = dot(a00.rgb, vec3f(1)); let s10 = dot(a10.rgb, vec3f(1)); let s01 = dot(a01.rgb, vec3f(1)); let s11 = dot(a11.rgb, vec3f(1));
    let g = length(vec2f(s10 - s00 + s11 - s01, s01 - s00 + s11 - s10)) * 0.5;
    let inside = smoothstep(0.02, 0.25, dot(v.rgb, vec3f(1)));
    col *= 1.0 - u.rim * smoothstep(0.03, 0.35, g) * inside;
  }
  col *= 1.0 - u.wetDark * smoothstep(0.0, 0.5, v.a);
  return vec4f(col, 1);
}`;

export async function device() {
  const ad = await navigator.gpu?.requestAdapter();
  return ad ? ad.requestDevice() : null;
}

export const PARAMS = { kFlow: .2, evap: .0016, edge: 2.5, wDry: .18, dep0: .004, dep1: .1, theta: .22, gran: .5, inkScale: 1, wetDark: .05, mob: .6, rim: 0, substeps: 8 };

export class Wash {
  constructor(dev, { W, H, res = 1, params = {} }) {
    this.dev = dev; this.res = res;
    this.P = { ...PARAMS, ...params };
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('webgpu');
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.ctx.configure({ device: dev, format: this.format, alphaMode: 'opaque' });

    const S = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    this.u = dev.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.maxStamps = 16384; this.stamps = dev.createBuffer({ size: this.maxStamps * 48, usage: S }); this.sdata = new Float32Array(this.maxStamps * 12); this.ns = 0;

    const mod = code => dev.createShaderModule({ code });
    const cp = code => dev.createComputePipeline({ layout: 'auto', compute: { module: mod(code), entryPoint: 'main' } });
    this.pPaper = cp(WGSL_PAPER); this.pApply = cp(WGSL_APPLY); this.pStep = cp(WGSL_STEP);
    const sm = mod(WGSL_STAMP);
    this.pStamp = dev.createRenderPipeline({ layout: 'auto', vertex: { module: sm, entryPoint: 'vs' },
      fragment: { module: sm, entryPoint: 'fs', targets: [{ format: 'rgba16float', blend: { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } } }] } });
    const shm = mod(WGSL_SHOW);
    this.pShow = dev.createRenderPipeline({ layout: 'auto', vertex: { module: shm, entryPoint: 'vs' }, fragment: { module: shm, entryPoint: 'fs', targets: [{ format: this.format }] } });
    this.setSize(W, H);
  }

  // (re)allocate the grid for a design size; a full-page scene calls this whenever the viewport's shape changes
  setSize(W, H) {
    if (this.W === W && this.H === H) return;
    this.W = W; this.H = H;
    for (const r of [this.A, this.B, this.D, this.paper, this.inflow]) r?.destroy();
    const dev = this.dev, SW = this.SW = Math.round(W * this.res), SH = this.SH = Math.round(H * this.res), N = SW * SH;
    const S = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, buf = size => dev.createBuffer({ size, usage: S });
    this.A = buf(N * 16); this.B = buf(N * 16); this.D = buf(N * 16); this.paper = buf(N * 16);
    this.inflow = dev.createTexture({ size: [SW, SH], format: 'rgba16float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    const bg = (p, ...res) => dev.createBindGroup({ layout: p.getBindGroupLayout(0), entries: res.map((r, i) => ({ binding: i, resource: r.createView ? r.createView() : { buffer: r } })) });
    this.gApply = bg(this.pApply, this.u, this.A, this.inflow);
    this.gStep = [bg(this.pStep, this.u, this.A, this.B, this.D, this.paper), bg(this.pStep, this.u, this.B, this.A, this.D, this.paper)];
    this.gStamp = bg(this.pStamp, this.u, this.stamps, this.paper);
    this.gShow = bg(this.pShow, this.u, this.A, this.D);
    this.writeU(1, 1);
    const e = dev.createCommandEncoder(), p = e.beginComputePass();
    p.setPipeline(this.pPaper); p.setBindGroup(0, bg(this.pPaper, this.u, this.paper)); p.dispatchWorkgroups(Math.ceil(SW / 16), Math.ceil(SH / 16)); p.end();
    dev.queue.submit([e.finish()]);
  }

  writeU(vw, vh) {
    const P = this.P, b = new ArrayBuffer(80), u32 = new Uint32Array(b), f = new Float32Array(b);
    u32[0] = this.SW; u32[1] = this.SH; f[2] = this.res; u32[3] = this.ns;
    [P.kFlow, P.evap, P.edge, P.wDry, P.dep0, P.dep1, P.theta, P.gran, P.inkScale, P.wetDark, vw, vh, P.mob, P.rim].forEach((v, i) => (f[4 + i] = v));
    this.dev.queue.writeBuffer(this.u, 0, b);
  }

  resize(scale) { this.canvas.width = Math.round(this.W * scale); this.canvas.height = Math.round(this.H * scale); }

  reset() {
    const e = this.dev.createCommandEncoder();
    for (const b of [this.A, this.B, this.D]) e.clearBuffer(b);
    this.dev.queue.submit([e.finish()]); this.ns = 0;
  }

  // pos in design units; col is absorbance per unit pigment
  stamp(x, y, r, ang, col, water, pig, dry, seed, aspect = 1) {
    if (this.ns >= this.maxStamps) return;
    this.sdata.set([x, y, r, ang, col[0], col[1], col[2], water, pig, dry, seed, aspect], this.ns++ * 12);
  }

  step() {
    const e = this.dev.createCommandEncoder(), gx = Math.ceil(this.SW / 16), gy = Math.ceil(this.SH / 16);
    if (this.ns) {
      this.dev.queue.writeBuffer(this.stamps, 0, this.sdata, 0, this.ns * 12);
      this.writeU(this.canvas.width, this.canvas.height);
      const r = e.beginRenderPass({ colorAttachments: [{ view: this.inflow.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
      r.setPipeline(this.pStamp); r.setBindGroup(0, this.gStamp); r.draw(6, this.ns); r.end();
      const p = e.beginComputePass(); p.setPipeline(this.pApply); p.setBindGroup(0, this.gApply); p.dispatchWorkgroups(gx, gy); p.end();
      this.ns = 0;
    }
    const p = e.beginComputePass(); p.setPipeline(this.pStep);
    for (let k = 0; k < this.P.substeps; k++) { p.setBindGroup(0, this.gStep[k & 1]); p.dispatchWorkgroups(gx, gy); }
    p.end();
    this.dev.queue.submit([e.finish()]);
  }

  render() {
    this.writeU(this.canvas.width, this.canvas.height);
    const e = this.dev.createCommandEncoder();
    const r = e.beginRenderPass({ colorAttachments: [{ view: this.ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [1, 1, 1, 1] }] });
    r.setPipeline(this.pShow); r.setBindGroup(0, this.gShow); r.draw(3); r.end();
    this.dev.queue.submit([e.finish()]);
  }

  settle() { return this.dev.queue.onSubmittedWorkDone(); }
}

// A brush stroke for the wash: dwell (the press, where ink pools and blooms), travel, lift.
// Ink load runs down along the stroke; as it does, and as speed rises, the brush goes dry (飛白).
export class WetStroke {
  constructor(o) {
    Object.assign(this, { w: 30, col: [1, 1.02, 1.06], water: 1, pig: 1, dry: 0, ink: 2, speed: 600, dwell: .12, minDur: .15,
      start: 0, profile: PROFILE.stroke, seed: 1, ease: .6, flying: .25, aspect: 1, nib: null, nibAspect: .13 }, o);
    this.path = spline(o.pts, 1);
    this.travel = Math.max(this.minDur, this.path.L / this.speed);
    this.dur = this.dwell + this.travel; this.end = this.start + this.dur;
    this.lastS = -1;
  }
  sAt(t) {
    const u = clamp((t - this.start - this.dwell) / this.travel), e = lerp(u, u * u * (3 - 2 * u), this.ease);
    return e * this.path.L;
  }
  emit(wash, t0, t1) {
    if (t1 < this.start || t0 > this.end) return;
    const { x, y, nx, ny, n, L } = this.path, at = s => Math.min(n - 1, Math.round(s));
    const stampAt = (s, amt, asp = this.aspect) => {
      const k = at(s), p = Math.max(.04, this.profile(s / L)), hw = this.w * .5 * p;
      const load = clamp(1 - s / (L * this.ink));
      const v = (this.sAt(t1) - this.sAt(t0)) / (t1 - t0 + 1e-6);   // design units / s
      const dry = clamp(this.dry + (1 - load) * .75 + this.flying * clamp(v / 2500), 0, .95);
      // a broad nib keeps its angle whatever the direction; its long axis is the stamp's local y
      const ang = this.nib == null ? Math.atan2(nx[k], -ny[k]) : Math.atan2(-Math.cos(this.nib * Math.PI / 180), -Math.sin(this.nib * Math.PI / 180));
      wash.stamp(x[k], y[k], hw, ang, this.col, this.water * amt * (.3 + .7 * load), this.pig * amt * (.45 + .55 * load), dry, (this.seed % 997) + .5, this.nib == null ? asp : this.nibAspect);
    };
    if (t0 < this.start + this.dwell && t1 > this.start) stampAt(0, .16 * (t1 - t0) / (1 / 60), 1.5);
    const s0 = Math.max(0, this.sAt(t0)), s1 = this.sAt(t1);
    if (s1 <= s0) return;
    let s = this.lastS < 0 ? s0 : Math.max(this.lastS, s0);
    while (s < s1) {
      const hw = this.w * .5 * Math.max(.04, this.profile(s / L)), th = this.nib == null ? hw : hw * this.nibAspect;
      const sp = Math.max(this.nib == null ? .6 : .35, th * .22);
      stampAt(s, sp / Math.max(th, 1) * .9);
      s += sp;
    }
    this.lastS = s;
  }
}
export { rng, hash };
