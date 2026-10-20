// The bristle brush on WebGPU, as a timeline. The canvas Painter redraws every stroke in flight each frame,
// so its cost follows how many are in flight. Here every bristle of every stroke is laid out once, at load,
// as line segments stamped with the moment the brush reaches them, sorted by that moment; a frame is one
// instanced draw of the prefix the clock has reached (one array lookup), and the vertex shader drops the
// few in the clock's own quarter-frame still ahead of it. Per-frame CPU is a 16-byte write and one draw.
// Bristles come from Stroke.prepare() untouched, so the dry-brush gaps (kasure) are the very samples the
// canvas brush leaves out, and a plate can swap Painter for this and keep its composition.
//
// Blend. 07 paints its bristles on a transparent canvas laid over the wash: strokes multiply each other
// there, and the layer sits source-over on the wash. Both halves are products, so they are sums in log space
// and one additive float target holds them in any order: rgb gathers -ln(1 - a·cov·(1 - c)), what every
// bristle multiplied onto white would leave (V), and alpha gathers -ln(1 - a·cov), how much of the wash still
// shows through the layer (Z). The layer is then V - Z of colour over Z of wash (see WGSL_COMP), which is the
// canvas result exactly but for one thing: canvas stacks a stroke's own bristles source-over before the
// multiply, so where they converge (a tapered rib's tip, five bristles deep) the stroke saturates at its own
// colour, where a plain multiply would go to black. So each stroke's overlap depth d is measured per sample
// at load, and a bristle there deposits 1/d of what d coincident bristles stacked source-over would:
// -ln(c + (1 - a)^d·(1 - c)) / d, which is the single-bristle multiply when d = 1. 'source-over' strokes (body
// colour: cream over sumi) aren't a product, so they go to a second premultiplied target in the same draw and
// lie over everything multiplied, whatever their time; marks the canvas lays over them later end up beneath.
//
// Joints. A canvas bristle is one path and never darkens where it meets itself. Segments drawn one by one
// would bead at every joint, so each segment owns only the region between the bisectors at its ends, the
// same line computed from the same points by both neighbours: they tile with no overlap and no gap. The ends
// of a run of ink, and the moving head, get the round cap.
import { lerp } from './util.js';

// gold leaf's flat colour, before it is lit: what a gold stroke paints, and what the composite takes back out
export const GOLD = [.8, .62, .3];

const WGSL = /* wgsl */`
// clip: a design-unit rect that clip-flagged strokes stay out of. Columns: the world is cut into vertical strips
// cols.x wide; strip i is seen through cam[i] = (offset x, offset y, its own clock, -), so a scrolling page can
// give each column its own scroll and its own time. One strip whose clock is u.time is the plain case.
// Masks: a stroke can be confined to a shape (a stencil): mask[2i] holds its numbers, mask[2i+1].x its kind:
// 1 circle (cx, cy, r), 2 rect (x0, y0, x1, y1), 3 the upper half of a disc (cx, cy, r). Mask 0 is none.
struct U { view: vec2f, scale: f32, time: f32, clip: vec4f, cols: vec4f, cam: array<vec4f, 8>, mask: array<vec4f, 32> };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read> pts: array<vec4f>;   // x, y, half-width, time the brush gets here
@group(0) @binding(2) var<storage, read> seg: array<vec2u>;   // first point, bristle << 7 | mask << 3 | clipped << 2 | run ends << 1 | run starts
@group(0) @binding(3) var<storage, read> bri: array<vec4f>;   // colour 0..1, alpha (negative: source-over)
@group(0) @binding(4) var<storage, read> dep: array<f32>;     // the stroke's overlap depth at each point
struct V {
  @builtin(position) pos: vec4f,
  @location(0) @interpolate(flat) a: vec4f,    // A, rA, rB
  @location(1) @interpolate(flat) b: vec2f,
  @location(2) @interpolate(flat) m: vec4f,    // cut lines at A and B (their tangents)
  @location(3) @interpolate(flat) col: vec4f,
  @location(4) @interpolate(flat) caps: u32,   // 1: round at A, 2: round at B, 4: kept out of u.clip
  @location(5) @interpolate(flat) d: f32,
  @location(6) @interpolate(flat) off: vec2f,
};
fn dir(p: vec2f, q: vec2f) -> vec2f { let d = q - p; let l = length(d); return select(vec2f(1, 0), d / l, l > 1e-6); }
// the bisector at p1, shared by the segments either side of it; one function so both get identical bits
fn cut(p0: vec2f, p1: vec2f, p2: vec2f) -> vec2f { let m = dir(p0, p1) + dir(p1, p2); let l = length(m); return select(dir(p1, p2), m / l, l > 1e-3); }
fn side(p: vec2f, o: vec2f, m: vec2f) -> f32 { return dot(p - o, m); }

@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> V {
  var o: V;
  let s = seg[ii]; let k = s.x;
  let A = pts[k]; let B = pts[k + 1u];
  let cam = u.cam[u32(clamp(floor(A.x / u.cols.x), 0.0, 7.0))]; let clock = cam.z;
  if (B.w > clock) { o.pos = vec4f(-9, -9, 0, 1); return o; }   // not painted yet: a point off-screen
  let capA = (s.y & 1u) != 0u;
  var head = (s.y & 2u) != 0u;
  if (!head) { head = pts[k + 2u].w > clock; }                  // the next segment isn't painted yet
  let d = dir(A.xy, B.xy); let n = vec2f(-d.y, d.x);
  var mA = d; var mB = d;
  if (!capA) { mA = cut(pts[k - 1u].xy, A.xy, B.xy); }
  if (!head) { mB = cut(A.xy, B.xy, pts[k + 2u].xy); }
  // sub-pixel bristles are drawn a pixel wide at reduced coverage, as canvas does
  let px = 1.0 / u.scale;
  // the quad is the shape plus the half pixel its antialiased edge reaches; a quad any larger is mostly
  // fragments that get discarded, and at half a million segments those are the frame's cost
  let rA = max(A.z, 0.5 * px); let rB = max(B.z, 0.5 * px); let r = max(rA, rB) + 0.5 * px;
  // along the axis a cap needs its radius; a cut line leans out by r·tan(half the turn)
  let back = select(r * abs(d.x * mA.y - d.y * mA.x) / max(dot(d, mA), 0.2) + 0.5 * px, r, capA);
  let fwd = select(r * abs(d.x * mB.y - d.y * mB.x) / max(dot(d, mB), 0.2) + 0.5 * px, r, head);
  let len = length(B.xy - A.xy);
  var q = array(vec2f(0, -1), vec2f(1, -1), vec2f(0, 1), vec2f(0, 1), vec2f(1, -1), vec2f(1, 1));
  let c = q[vi];
  let w = (A.xy - cam.xy - d * back + d * (len + back + fwd) * c.x + n * r * c.y) * u.scale;
  o.pos = vec4f(w.x / u.view.x * 2.0 - 1.0, 1.0 - w.y / u.view.y * 2.0, 0, 1);
  o.a = vec4f(A.xy, A.z, B.z); o.b = B.xy; o.m = vec4f(mA, mB);
  o.col = bri[s.y >> 7u]; o.caps = select(0u, 1u, capA) | select(0u, 2u, head) | (s.y & 0x7Cu); o.d = 0.5 * (dep[k] + dep[k + 1u]); o.off = cam.xy;
  return o;
}

struct Out { @location(0) ab: vec4f, @location(1) over: vec4f, @location(2) gold: vec4f };
@fragment fn fs(v: V) -> Out {
  let p = v.pos.xy / u.scale + v.off;
  let A = v.a.xy; let B = v.b;
  let capA = (v.caps & 1u) != 0u; let head = (v.caps & 2u) != 0u;
  if (!capA && side(p, A, v.m.xy) < 0.0) { discard; }
  if (!head && side(p, B, v.m.zw) >= 0.0) { discard; }
  if ((v.caps & 4u) != 0u && all(p >= u.clip.xy) && all(p <= u.clip.zw)) { discard; }
  let mi = (v.caps >> 3u) & 15u;
  if (mi > 0u) {
    let M = u.mask[mi * 2u]; let kind = u.mask[mi * 2u + 1u].x; var inside = true;
    if (kind == 1.0) { inside = length(p - M.xy) <= M.z; }
    else if (kind == 2.0) { inside = all(p >= M.xy) && all(p <= M.zw); }
    else if (kind == 3.0) { inside = length(p - M.xy) <= M.z && p.y <= M.y; }
    if (!inside) { discard; }
  }
  let ab = B - A; let len = length(ab); let d = select(vec2f(1, 0), ab / len, len > 1e-6);
  let s = dot(p - A, d);
  var dist: f32; var r: f32;
  if (capA && s < 0.0) { dist = length(p - A); r = v.a.z; }
  else if (head && s > len) { dist = length(p - B); r = v.a.w; }
  else { dist = abs(dot(p - A, vec2f(-d.y, d.x))); r = mix(v.a.z, v.a.w, clamp(s / max(len, 1e-6), 0.0, 1.0)); }
  let rp = r * u.scale;
  let cov = clamp(max(rp, 0.5) - dist * u.scale + 0.5, 0.0, 1.0) * min(1.0, rp * 2.0);
  if (cov <= 0.0) { discard; }
  // alpha >= 2 is gold leaf: body colour like 'source-over', and its coverage into the gold target as well;
  // every other body colour goes over the gold target too (alpha only), so later paint covers earlier gold
  if (v.col.a >= 1.5) { let a = (v.col.a - 2.0) * cov; return Out(vec4f(0), vec4f(v.col.rgb * a, a), vec4f(a, 0, 0, a)); }
  let a = abs(v.col.a) * cov;
  if (v.col.a < 0.0) { return Out(vec4f(0), vec4f(v.col.rgb * a, a), vec4f(0, 0, 0, a)); }
  let c = v.col.rgb; let z = max(1.0 - a, 1e-4);
  return Out(vec4f(-log(c + pow(z, v.d) * (1.0 - c)) / v.d, -log(z)), vec4f(0), vec4f(0));
}`;

// Onto the wash already in the canvas. A multiply layer over a backdrop, when the layer starts empty, is
// V - Z + Z·backdrop: with V and Z both products, the layer's own colour is V - Z (never negative, since each
// bristle's 1 - a(1 - c) >= 1 - a) and Z is how much backdrop shows. Body colour then goes over the top.
//
// Gold leaf. Wherever the gold target says gold shows, its flat albedo is swapped for gold lit by a point
// light (g.light: design units, z its height): leaf laid in squares in ragged rows, each square tilted a
// little its own way so they flash one by one as the light passes; a crinkle; the seams where leaves
// overlap; and the edge of the raised gesso, from the gold coverage's own gradient. Optional folds (a
// byōbu): the page in panels tilted alternately, which shades the paint and turns the gold's normals.
const WGSL_COMP = /* wgsl */`
struct G { light: vec4f, leaf: vec4f, page: vec4f, cam: vec4f };   // light xyz, on; leaf size, px/unit, folds, fold tilt; W, H, bevel, split;
// cam: the world offset left of the screen x page.w, then right of it (the gold pattern is fixed to the world)
@group(0) @binding(0) var ab: texture_2d<f32>;
@group(0) @binding(1) var over: texture_2d<f32>;
@group(0) @binding(2) var gold: texture_2d<f32>;
@group(0) @binding(3) var<uniform> g: G;
const ALBEDO = vec3f(${GOLD.join(', ')});
fn h1(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn vn(p: vec2f) -> f32 {   // value noise: hashed lattice, smoothly interpolated
  let i = floor(p); let f = fract(p); let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h1(i), h1(i + vec2f(1, 0)), u.x), mix(h1(i + vec2f(0, 1)), h1(i + vec2f(1, 1)), u.x), u.y);
}
fn h3(p: vec2f) -> vec3f { return fract(sin(vec3f(dot(p, vec2f(127.1, 311.7)), dot(p, vec2f(269.5, 183.3)), dot(p, vec2f(419.2, 371.9)))) * 43758.5453); }
@vertex fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  var tri = array(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3)); return vec4f(tri[vi], 0, 1);
}
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let q = vec2i(fc.xy); let ps = fc.xy / g.leaf.y; let p = ps + select(g.cam.zw, g.cam.xy, ps.x < g.page.w);
  let e = exp(-textureLoad(ab, q, 0)); let o = textureLoad(over, q, 0); let gl = textureLoad(gold, q, 0).r;
  var rgb = (e.rgb - e.a) * (1.0 - o.a) + o.rgb; let a = e.a * (1.0 - o.a);
  // folds: panel i leans one way, i+1 the other; lit from the upper left
  var tilt = 0.0; var f = 1.0;
  if (g.leaf.z > 0.0) {
    let pw = g.page.x / g.leaf.z; let k = p.x / pw; let i = floor(k); let side = select(-1.0, 1.0, (i32(i) & 1) == 0);
    tilt = g.leaf.w * side;
    f = 1.0 + 0.55 * (sin(tilt) * -0.62);
    let edge = min(fract(k), 1.0 - fract(k)) * pw * g.leaf.y;
    f *= mix(0.82, 1.0, smoothstep(0.0, 2.5, edge));
  }
  if (gl > 0.002 && g.light.w > 0.0) {
    let L = g.leaf.x; let row = floor(p.y / L); let off = h1(vec2f(row, 7.0)) * L; let col = floor((p.x + off) / L);
    let h = h3(vec2f(col, row)); let fr = fract(vec2f((p.x + off) / L, p.y / L));
    var n = vec3f((h.x - 0.5) * 0.22, (h.y - 0.5) * 0.22, 1.0);
    // the crinkle: leaf is never flat; two octaves of noise slope, sampled per square so seams break it
    let c0 = p * 0.32 + h.xy * 40.0; let c1 = p * 0.9 + h.yz * 40.0;
    n += vec3f(vn(c0 + vec2f(0.5, 0.0)) - vn(c0 - vec2f(0.5, 0.0)), vn(c0 + vec2f(0.0, 0.5)) - vn(c0 - vec2f(0.0, 0.5)), 0.0) * 0.16
       + vec3f(vn(c1 + vec2f(0.5, 0.0)) - vn(c1 - vec2f(0.5, 0.0)), vn(c1 + vec2f(0.0, 0.5)) - vn(c1 - vec2f(0.0, 0.5)), 0.0) * 0.06;
    let b = g.page.z;
    let gx = textureLoad(gold, q + vec2i(3, 0), 0).r - textureLoad(gold, q - vec2i(3, 0), 0).r;
    let gy = textureLoad(gold, q + vec2i(0, 3), 0).r - textureLoad(gold, q - vec2i(0, 3), 0).r;
    n += vec3f(-gx, -gy, 0.0) * b;
    n = normalize(vec3f(n.x * cos(tilt) + n.z * sin(tilt), n.y, n.z * cos(tilt) - n.x * sin(tilt)));
    let P = vec3f(p, 0.0); let l = normalize(g.light.xyz - P); let hv = normalize(l + vec3f(0.0, 0.0, 1.0));
    let nh = max(dot(n, hv), 0.0); let dif = max(dot(n, l), 0.0);
    // a tight flash (one leaf square lined up with the light) over a broad sheen; broad and bright together
    // turn every square under the light to white
    let spec = pow(nh, 260.0) * 1.2 + pow(nh, 24.0) * 0.28;
    let seam = min(min(fr.x, 1.0 - fr.x), min(fr.y, 1.0 - fr.y)) * L * g.leaf.y;
    var c = vec3f(0.36, 0.24, 0.07) + vec3f(0.52, 0.39, 0.15) * dif + vec3f(1.0, 0.9, 0.62) * spec;
    c *= mix(0.8, 1.0, smoothstep(0.0, 1.6, seam)) * (0.94 + 0.12 * h.z);
    rgb += gl * (c - ALBEDO);
  }
  return vec4f(rgb * f, a * f);   // blend: src + dst·src.a
}`;

// u where the stroke's eased progress reaches e: the inverse of Stroke.reach's ease, by bisection
const uAt = (e, ease) => {
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (lerp(m, m * m * (3 - 2 * m), ease) < e) lo = m; else hi = m; }
  return hi;
};

// A stroke as bristles: { P: xy pairs, M: ink mask, r: half-width (number or per sample), col: 0..1, a }.
// A wash stroke (boneless petal) is one bristle as wide as its envelope, plus its two darker rims.
function lay(s) {
  const over = s.blend === 'source-over' || !!s.gold, gold = !!s.gold, clip = !!s.clip, mask = s.mask | 0;
  if (s.wash) {
    const { x, y, nx, ny, n } = s.path, hw = new Float32Array(n), C = new Float32Array(n * 2), L = new Float32Array(n * 2), R = new Float32Array(n * 2);
    for (let k = 0; k < n; k++) {
      hw[k] = s.w * .5 * Math.max(.04, s.profile(k / (n - 1)));
      C[2 * k] = x[k]; C[2 * k + 1] = y[k];
      L[2 * k] = x[k] + nx[k] * hw[k]; L[2 * k + 1] = y[k] + ny[k] * hw[k]; R[2 * k] = x[k] - nx[k] * hw[k]; R[2 * k + 1] = y[k] - ny[k] * hw[k];
    }
    const col = gold ? GOLD : s.color.map(v => v / 255), M = new Uint8Array(n).fill(1), rim = (s.rim ?? 1.1) / 2;
    // rim: 0 is a flat body-colour shape (the ornament kit's), with no rims to lay
    return { B: [{ P: C, M, r: hw, col, a: s.alpha, over, gold, clip, mask }, ...(rim > 0 ? [L, R] : []).map(P => ({ P, M, r: rim, col, a: Math.min(1, s.alpha * .7), over, gold, clip, mask }))], D: null };
  }
  s.prepare();
  const B = s.B.map(({ P, M, th, style }) => {
    const [r, g, b, a] = style.match(/[\d.]+/g).map(Number);   // the canvas brush's own rgba(), so colour and alpha match it exactly
    return { P, M, r: th / 2, col: gold ? GOLD : [r / 255, g / 255, b / 255], a, over, gold, clip, mask };
  });
  s.B = null;
  // overlap depth: the inked bristles' summed width over the width they span across the stroke
  const { x, y, nx, ny, n } = s.path, D = new Float32Array(n).fill(1);
  if (B.length > 1) for (let k = 0; k < n; k++) {
    let lo = Infinity, hi = -Infinity, sum = 0;
    for (const b of B) {
      if (!b.M[k]) continue;
      const o = (b.P[2 * k] - x[k]) * nx[k] + (b.P[2 * k + 1] - y[k]) * ny[k];
      lo = Math.min(lo, o - b.r); hi = Math.max(hi, o + b.r); sum += 2 * b.r;
    }
    if (sum) D[k] = Math.max(1, sum / (hi - lo));
  }
  return { B, D };
}

// Every bristle segment of every stroke, with the moment it is painted, sorted by that moment: pure arithmetic,
// so the site runs it in a worker and only the upload touches the GPU
export function layout(strokes) {
  const all = strokes.slice().sort((a, b) => a.start - b.start), TOL = .04, SPAN = 1 / 120;
  // points (x, y, r, t), depths, segments (point, info), bristle colours, segment times, in typed arrays grown
  // by doubling, so the result leaves a worker without a copy
  let P = new Float32Array(1 << 18), np = 0, D = new Float32Array(1 << 16), S = new Uint32Array(1 << 17), ns = 0, C = new Float32Array(1 << 14), nc = 0, when = new Float64Array(1 << 16);
  const grow = (a, need) => { if (need <= a.length) return a; let n = a.length * 2; while (n < need) n *= 2; const g = new a.constructor(n); g.set(a); return g; };
  for (const s of all) {
    const { B, D: dep } = lay(s), n = s.path.n;
    // when the brush reaches sample k: the clock time at which Stroke.reach first returns k
    const T = new Float32Array(n);
    for (let k = 0; k < n; k++) T[k] = s.start + s.dur * uAt(k / Math.max(1, n - 1), s.ease);
    for (const b of B) {
      const ib = nc >> 2, M = b.M, X = b.P, br = b.r, R = typeof br === 'number' ? () => br : k => br[k];
      C = grow(C, nc + 4); C[nc] = b.col[0]; C[nc + 1] = b.col[1]; C[nc + 2] = b.col[2]; C[nc + 3] = b.gold ? b.a + 2 : b.over ? -b.a : b.a; nc += 4;
      // does the chord i..j stand in for every sample between?
      const straight = (i, j) => {
        const ax = X[2 * i], ay = X[2 * i + 1], dx = X[2 * j] - ax, dy = X[2 * j + 1] - ay, l = Math.hypot(dx, dy) || 1;
        for (let m = i + 1; m < j; m++) {
          const u = (m - i) / (j - i);
          if (Math.abs(((X[2 * m] - ax) * dy - (X[2 * m + 1] - ay) * dx) / l) > TOL || Math.abs(R(m) - lerp(R(i), R(j), u)) > TOL) return false;
        }
        return true;
      };
      for (let k = 0; k < n - 1; k++) {
        if (!(M[k] & M[k + 1]) || (k && M[k - 1])) continue;   // k starts a run
        let e = k + 1; while (e + 1 < n && M[e + 1]) e++;      // ... that ends at e
        const V = [k];
        for (let i = k; i < e;) { let j = i + 1; while (j < e && T[j + 1] - T[i] <= SPAN && straight(i, j + 1)) j++; V.push(j); i = j; }
        const p0 = np >> 2, nv = V.length;
        P = grow(P, np + 4 * nv); D = grow(D, p0 + nv);
        for (const v of V) { D[np >> 2] = dep ? dep[v] : 1; P[np] = X[2 * v]; P[np + 1] = X[2 * v + 1]; P[np + 2] = R(v); P[np + 3] = T[v]; np += 4; }
        S = grow(S, 2 * (ns + nv)); when = grow(when, ns + nv);
        for (let i = 0; i < nv - 1; i++) {
          S[2 * ns] = p0 + i; S[2 * ns + 1] = ib << 7 | b.mask << 3 | (b.clip ? 4 : 0) | (i === 0 ? 1 : 0) | (i === nv - 2 ? 2 : 0);
          when[ns++] = T[V[i + 1]];
        }
        k = e - 1;
      }
    }
  }
  // counting sort by paint time, in quarter-frame buckets: cum[q] segments are painted by bucket q's end
  let tmax = 0; for (let i = 0; i < ns; i++) if (when[i] > tmax) tmax = when[i];
  const Q = 240, nq = Math.ceil(tmax * Q) + 2, cum = new Uint32Array(nq + 1);
  const bucket = t => Math.min(nq - 1, Math.max(0, Math.ceil(t * Q)));
  for (let i = 0; i < ns; i++) cum[bucket(when[i]) + 1]++;
  for (let q = 0; q < nq; q++) cum[q + 1] += cum[q];
  const at = cum.slice(), Ss = new Uint32Array(ns * 2);
  for (let i = 0; i < ns; i++) { const o = at[bucket(when[i])]++; Ss[2 * o] = S[2 * i]; Ss[2 * o + 1] = S[2 * i + 1]; }
  return { P: P.slice(0, np), D: D.slice(0, np >> 2), S: Ss, C: C.slice(0, nc), cum, Q, n: ns, stats: { strokes: all.length, bristles: nc >> 2, segments: ns, points: np >> 2 } };
}

export class Bristles {
  constructor(dev, format) {
    this.dev = dev; this.n = 0;
    this.u = dev.createBuffer({ size: 688, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.g = dev.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    // what a plate may set: clip [x0, y0, x1, y1]; light [x, y, z] (null: no gold shading); leaf size; folds, fold tilt; bevel
    this.clip = [1e9, 1e9, -1e9, -1e9];
    // columns: colW wide; cams[i] = [offset x, offset y, clock] (null: one column on the plate clock); split and
    // splitCams tell the gold where on screen one column's world gives way to the next
    this.colW = 1e9; this.cams = null; this.masks = [];   // masks[i - 1] = [kind, a, b, c, d] for stroke.mask = i (1..15)
     this.split = 1e9; this.splitCams = [0, 0, 0, 0]; this.light = null; this.leaf = 26; this.folds = 0; this.foldTilt = .22; this.bevel = 2.2; this.page = [1600, 1000];
    const m = dev.createShaderModule({ code: WGSL }), cm = dev.createShaderModule({ code: WGSL_COMP });
    const add = { srcFactor: 'one', dstFactor: 'one' }, over = { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' };
    this.pDraw = dev.createRenderPipeline({ layout: 'auto', vertex: { module: m, entryPoint: 'vs' },
      fragment: { module: m, entryPoint: 'fs', targets: [{ format: 'rgba16float', blend: { color: add, alpha: add } }, { format: 'rgba8unorm', blend: { color: over, alpha: over } }, { format: 'rgba8unorm', blend: { color: over, alpha: over } }] } });
    const tx = binding => ({ binding, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } });
    this.lComp = dev.createBindGroupLayout({ entries: [tx(0), tx(1), tx(2), { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: {} }] });
    this.pComp = dev.createRenderPipeline({ layout: dev.createPipelineLayout({ bindGroupLayouts: [this.lComp] }), vertex: { module: cm, entryPoint: 'vs' },
      fragment: { module: cm, entryPoint: 'fs', targets: [{ format, blend: { color: { srcFactor: 'one', dstFactor: 'src-alpha' }, alpha: { srcFactor: 'zero', dstFactor: 'one' } } }] } });
  }

  // Lay every bristle of every stroke out on the GPU. Each run of ink is cut down to the chords that stay
  // within TOL of its samples (bristles wobble slowly, so most chords span several 1.4-unit samples), but no
  // chord covers more than half a frame of the brush's travel, so the moving head never visibly jumps.
  // Segments are then sorted by when they get painted, so a frame draws only the painted prefix.
  load(strokes) { this.upload(layout(strokes)); }

  // a layout() result onto the GPU
  upload(L) {
    for (const b of [this.pts, this.dep, this.seg, this.bri]) b?.destroy();
    const buf = a => { const g = this.dev.createBuffer({ size: Math.max(16, a.byteLength), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST }); this.dev.queue.writeBuffer(g, 0, a); return g; };
    this.pts = buf(L.P); this.dep = buf(L.D); this.seg = buf(L.S); this.bri = buf(L.C);
    this.cum = L.cum; this.Q = L.Q; this.n = L.n; this.stats = L.stats;
    this.bind();
  }

  // segments painted by t: every bucket up to t's, and t's own (the vertex shader drops its later ones)
  count(t) { return this.cum[Math.min(this.cum.length - 1, Math.max(0, Math.ceil(t * this.Q) + 1))]; }

  // canvas size in pixels, and pixels per design unit
  resize(w, h, scale) {
    this.scale = scale;
    if (this.w === w && this.h === h) return;
    this.w = w; this.h = h;
    for (const t of [this.tAb, this.tOver, this.tGold]) t?.destroy();
    const tex = format => this.dev.createTexture({ size: [w, h], format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    this.tAb = tex('rgba16float'); this.tOver = tex('rgba8unorm'); this.tGold = tex('rgba8unorm');   // body colour is premultiplied paint: 8 bits is plenty
    this.gComp = this.dev.createBindGroup({ layout: this.lComp, entries: [{ binding: 0, resource: this.tAb.createView() }, { binding: 1, resource: this.tOver.createView() }, { binding: 2, resource: this.tGold.createView() }, { binding: 3, resource: { buffer: this.g } }] });
  }

  bind() {
    if (!this.pts) return;
    this.gDraw = this.dev.createBindGroup({ layout: this.pDraw.getBindGroupLayout(0), entries: [this.u, this.pts, this.seg, this.bri, this.dep].map((buffer, binding) => ({ binding, resource: { buffer } })) });
  }

  // paint everything the brush has reached by t over what `view` already holds
  render(view, t) {
    if (!this.tAb || !this.gDraw) return;
    const U = new Float32Array(172); U.set([this.w, this.h, this.scale, t, ...this.clip, this.colW, 8, 0, 0]);
    const cams = this.cams || [[0, 0, t]];
    cams.forEach((c, i) => U.set([c[0], c[1], c[2], 0], 12 + i * 4));
    this.masks.slice(0, 15).forEach(([kind, a, b, c, d], i) => { U.set([a, b, c, d], 44 + (i + 1) * 8); U[48 + (i + 1) * 8] = kind; });
    this.dev.queue.writeBuffer(this.u, 0, U);
    const L = this.light;
    this.dev.queue.writeBuffer(this.g, 0, new Float32Array([...(L || [0, 0, 1]), L ? 1 : 0, this.leaf, this.scale, this.folds, this.foldTilt, ...this.page, this.bevel, this.split, ...this.splitCams]));
    const e = this.dev.createCommandEncoder(), z = { loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] };
    const r = e.beginRenderPass({ colorAttachments: [{ view: this.tAb.createView(), ...z }, { view: this.tOver.createView(), ...z }, { view: this.tGold.createView(), ...z }] });
    r.setPipeline(this.pDraw); r.setBindGroup(0, this.gDraw); const n = this.count(this.cams ? Math.max(...this.cams.map(c => c[2])) : t); if (n) r.draw(6, n); r.end();
    const c = e.beginRenderPass({ colorAttachments: [{ view, loadOp: 'load', storeOp: 'store' }] });
    c.setPipeline(this.pComp); c.setBindGroup(0, this.gComp); c.draw(3);
    c.end();
    this.dev.queue.submit([e.finish()]);
  }
}
