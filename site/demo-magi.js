// MAGI's insert: the pipeline as a diagram in MAGI's own grammar, drawn on a 2D canvas inside the pinned
// sheet. The page's scroll walks it, step by step and back again: an archive unpacks into hashed pages, OCR
// reads one and scores them all, spans are marked, threads run from spans to entities on the lattice of the
// trellis above (the ornament become the mesh), and the tables keep source, editors and readers apart. Once
// the mesh is up, amber packets keep moving along the threads: the one motion that stays. At the end of the
// walk the sheet offers the record itself, in a new tab.
const C = {
  text: '#c7cfd9', dim: '#66707e', amber: '#ffb000', panel: '#0f1319', heat: 'rgba(240, 100, 42, 0.86)',
  line: 'rgba(200, 215, 235, 0.12)', lineDim: 'rgba(200, 215, 235, 0.06)', lineStrong: 'rgba(200, 215, 235, 0.35)',
};
const SANS = 'Inter, "Helvetica Neue", sans-serif', MONO = '"JetBrains Mono", ui-monospace, monospace';
const ease = t => 1 - (1 - t) ** 3;
const cl = t => Math.max(0, Math.min(1, t));
const lerp = (a, b, t) => a + (b - a) * t;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const STATUS = 'ccgccceccgcc';                           // clean, garbled, empty, page by page
const HASH = ['a3f9', '0c71', '9e2b', '41d8', 'b7a0', '5f13', 'e8c4', '2d96', '7a5e', 'c1b2', '68f0', '3e47'];
const SPANS = [[2, .1, .34], [4, .48, .3], [7, .18, .42], [9, .05, .26], [11, .44, .36], [13, .14, .3]];
const ENT = ['Project Blue Book', 'Malmstrom AFB', 'NORAD', 'Kirtland AFB', '24 March 1967', 'radar', 'Air Defense Command', 'Washington'];
const LINK = [0, 1, 4, 5, 2, 3];                        // span k names entity LINK[k]
const EDGE = [[0, 1], [1, 4], [4, 5], [2, 6], [6, 7], [3, 5], [0, 7], [1, 2]];
const PICK = 2;                                         // the span the reader follows, and its thread, in amber

export function mountMagi(section, scroller) {
  const sheet = section.querySelector('.sheet'), cv = sheet.querySelector('canvas'), x = cv.getContext('2d');
  const steps = [...section.querySelectorAll('.steps li')];
  const go = section.querySelector('.go');
  let W = 0, H = 0, dpr = 1, p = 0, goal = 0, raf = 0, visible = false, L = null;

  function layout() {
    // portrait (a phone): the stages stack down the sheet, page above mesh above tables; landscape: the
    // pages and the page read on the left, the mesh and the tables on the right
    const port = W < 560, pad = port ? 16 : 30, fs = port ? 10.5 : 13;
    let thumbs, gy, big, xr, g, mt, mb, mr, tiers;
    if (port) {
      const tw = Math.min(34, (W - 2 * pad - 5 * 8) / 6), th = tw * 1.3;
      thumbs = Array.from({ length: 12 }, (_, i) => ({
        stack: [W / 2 - tw / 2 + i * 2.2, pad + 20 + i * 2.2],
        grid: [pad + (i % 6) * (tw + 8), pad + 20 + Math.floor(i / 6) * (th + 20)],
      }));
      gy = pad + 20 + 2 * (th + 20) + 4;
      const bh = Math.min(170, H * .24);
      big = { x: pad, y: gy + 60, w: Math.min(150, W * .44), h: bh };
      tiers = [0, 1, 2].map(i => ({ x: pad, y: H - pad - 3 * 30 + i * 30, w: W - 2 * pad, h: 23 }));
      xr = pad; mt = big.y + big.h + 34; mb = tiers[0].y - 22; mr = W - pad - 112;
      g = Math.max(40, Math.min(64, (mr - xr) / 3.2));
      L = { pad, fs, port, tw, th, thumbs, gy, big, xr, g, mt, mb, tiers };
    } else {
      const wl = W * .36, tw = Math.min(46, (wl - 3 * 12) / 4), th = tw * 1.3, gap = tw * .32;
      thumbs = Array.from({ length: 12 }, (_, i) => ({
        stack: [pad + wl * .28 + i * 2.2, pad + 26 + i * 2.2],
        grid: [pad + (i % 4) * (tw + gap), pad + 26 + Math.floor(i / 4) * (th + gap + 12)],
      }));
      gy = pad + 26 + 3 * (th + gap + 12);
      big = { x: pad, y: gy + 72, w: wl * .86, h: H - gy - 72 - pad };
      xr = W * .44; g = Math.max(54, Math.min(96, (W - pad - xr) / 4.6));
      tiers = [0, 1, 2].map(i => ({ x: xr, y: H - pad - 3 * 34 + i * 34, w: W - pad - xr, h: 26 }));
      mt = pad + 40; mb = H * .62 + mt; mr = W - pad - 190;
      L = { pad, fs, port, tw, th, thumbs, gy, big, xr, g, mt, mb: tiers[0].y - 18, tiers };
    }
    L.lines = Array.from({ length: 16 }, (_, i) => ({ y: big.y + (port ? 12 : 20) + i * (big.h - (port ? 24 : 40)) / 15, l: .45 + ((i * 37) % 11) / 11 * .5 }));
    // the mesh, on the trellis's diamond lattice
    const pts = [];
    for (let r = 0; port ? mt + r * g * .5 <= mb : r * g * .5 < H * .62; r++) for (let c = 0; xr + c * g * .5 + g * .25 < mr; c++) if ((r + c) % 2 === 0) pts.push([xr + c * g * .5 + g * .25, mt + r * g * .5]);
    if (!pts.length) { L = null; return; }   // a sheet too small to hold the mesh (mid-resize, mid-slide): draw nothing
    L.pts = pts;
    L.nodes = [.06, .3, .55, .19, .44, .7, .85, .95].map(f => pts[Math.min(pts.length - 1, Math.floor(f * pts.length))]);
  }

  // a cubic from a span's end to its entity, sampled; f draws only the first part of it
  const thread = (k, f = 1) => {
    const [li, a, b] = SPANS[k], y = L.lines[li].y, x0 = L.big.x + 14 + (L.big.w - 28) * (a + b) + 4, [x1, y1] = L.nodes[LINK[k]];
    const n = 40, out = [];
    for (let i = 0; i <= n * f; i++) {
      const u = i / n, v = 1 - u, cx0 = x0 + (x1 - x0) * .5, cx1 = x0 + (x1 - x0) * .5;
      out.push([v * v * v * x0 + 3 * v * v * u * cx0 + 3 * v * u * u * cx1 + u * u * u * x1, v * v * v * y + 3 * v * v * u * y + 3 * v * u * u * y1 + u * u * u * y1]);
    }
    return out;
  };
  const poly = pts => { x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke(); };
  const text = (s, a, b, { size = 13, col = C.text, weight = 400, font = SANS, align = 'left', alpha = 1 } = {}) => {
    if (alpha <= 0) return; x.globalAlpha = alpha; x.font = `${weight} ${size}px ${font}`; x.fillStyle = col; x.textAlign = align; x.fillText(s, a, b); x.globalAlpha = 1;
  };

  function draw(time) {
    x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
    if (!L) return;
    const e = k => ease(cl(p - k));
    const e0 = e(0), e1 = e(1), e2 = e(2), e3 = e(3), e4 = e(4);
    x.lineWidth = 1;

    // 1 · the archive unpacks into pages, each under its hash
    L.thumbs.forEach((t, i) => {
      const k = ease(cl(p * 1.25 - i * .02)), [px, py] = [lerp(t.stack[0], t.grid[0], k), lerp(t.stack[1], t.grid[1], k)];
      x.fillStyle = C.panel; x.fillRect(px, py, L.tw, L.th);
      x.strokeStyle = C.lineStrong; x.strokeRect(px + .5, py + .5, L.tw - 1, L.th - 1);
      if (STATUS[i] !== 'e') { x.fillStyle = 'rgba(199, 207, 217, 0.22)'; for (let j = 0; j < 5; j++) x.fillRect(px + 6, py + 8 + j * (L.th - 16) / 5, (L.tw - 12) * (.55 + ((i + j) % 3) * .15), 1.5); }
      text(HASH[i], px, py + L.th + 11, { size: L.port ? 8 : 9, font: MONO, col: C.dim, alpha: cl(k * 2 - 1) });
      // 2 · its score, once OCR has passed it
      const s = cl(e1 * 1.3 - i / 14);
      if (s > 0) {
        x.globalAlpha = s;
        if (STATUS[i] === 'e') { x.strokeStyle = C.dim; x.strokeRect(px + L.tw - 9.5, py + 3.5, 6, 6); }
        else { x.fillStyle = STATUS[i] === 'g' ? C.heat : C.text; x.fillRect(px + L.tw - 10, py + 3, 7, 7); }
        x.globalAlpha = 1;
      }
    });
    text('9 clean   2 garbled   1 empty', L.pad, L.gy + 6, { size: L.fs, alpha: e1 });
    text('12 of 12 against the release index', L.pad, L.gy + 24, { size: L.fs, col: C.dim, alpha: e4 });

    // 2 · one page, read: its lines brighten as the scan passes
    if (e1 > 0) {
      const t5 = L.thumbs[5].grid, B = { x: lerp(t5[0], L.big.x, e1), y: lerp(t5[1], L.big.y, e1), w: lerp(L.tw, L.big.w, e1), h: lerp(L.th, L.big.h, e1) };
      x.fillStyle = C.panel; x.fillRect(B.x, B.y, B.w, B.h); x.strokeStyle = C.lineStrong; x.strokeRect(B.x + .5, B.y + .5, B.w - 1, B.h - 1);
      if (e1 > .5) {
        const scan = L.big.y + L.big.h * cl((e1 - .5) * 2.2);
        L.lines.forEach(({ y, l }) => { x.fillStyle = y < scan ? 'rgba(199, 207, 217, 0.55)' : 'rgba(199, 207, 217, 0.16)'; x.fillRect(L.big.x + 14, y - 1.5, (L.big.w - 28) * l, 3); });
        if (scan < L.big.y + L.big.h) { x.fillStyle = C.text; x.fillRect(L.big.x, scan, L.big.w, 1); }
        text('page 14', L.big.x, L.big.y - 10, { size: L.fs, col: C.dim, alpha: cl((e1 - .5) * 2) });
      }
    }

    // 3 · spans marked on it
    SPANS.forEach(([li, a, b], k) => {
      const f = cl(e2 * 1.6 - k * .12); if (f <= 0) return;
      const y = L.lines[li].y, x0 = L.big.x + 14 + (L.big.w - 28) * a, w = (L.big.w - 28) * b * f;
      if (k === PICK) { x.fillStyle = 'rgba(255, 176, 0, 0.14)'; x.fillRect(x0 - 3, y - 7, w + 6, 14); x.strokeStyle = C.amber; }
      else x.strokeStyle = C.lineStrong;
      x.strokeRect(x0 - 3.5, y - 7.5, w + 7, 15);
    });

    // 4 · the mesh: the lattice faint, entities on it, threads from the spans, links between entities
    if (e3 > 0) {
      x.globalAlpha = e3; x.strokeStyle = C.lineDim;
      const { xr, g } = L, top = L.mt - g * .25, bot = L.mb;
      for (let c = -12; c < 30; c++) {
        x.beginPath(); x.moveTo(xr + c * g * .5, top); x.lineTo(xr + c * g * .5 + (bot - top), bot); x.stroke();
        x.beginPath(); x.moveTo(xr + c * g * .5, top); x.lineTo(xr + c * g * .5 - (bot - top), bot); x.stroke();
      }
      x.save(); x.globalCompositeOperation = 'destination-out'; x.fillRect(0, 0, xr - 10, H); x.fillRect(W - L.pad, 0, L.pad, H); if (L.port) x.fillRect(0, 0, W, top + g * .1); x.restore();
      x.globalAlpha = 1;
      x.strokeStyle = C.line;
      EDGE.forEach(([a, b], i) => { const f = cl(e3 * 1.5 - .3 - i * .05); if (f > 0) { const [ax, ay] = L.nodes[a], [bx, by] = L.nodes[b]; poly([[ax, ay], [lerp(ax, bx, f), lerp(ay, by, f)]]); } });
      SPANS.forEach((_, k) => { x.strokeStyle = k === PICK ? C.amber : C.lineStrong; poly(thread(k, cl(e3 * 1.4 - k * .08))); });
      L.nodes.forEach(([nx, ny], i) => {
        const f = cl(e3 * 1.6 - .4 - i * .06); if (f <= 0) return;
        const hot = i === LINK[PICK];
        x.globalAlpha = f; x.fillStyle = hot ? C.amber : C.text; x.fillRect(nx - 3.5, ny - 3.5, 7, 7); x.globalAlpha = 1;
        text(ENT[i], nx + 10, ny + 4.5, { size: L.fs, col: hot ? C.text : C.dim, alpha: f });
      });
      // the claim, resolved: the amber entity cites its page and span
      const [hx, hy] = L.nodes[LINK[PICK]];
      const claim = L.port ? 'page 14 · 212 to 247' : 'page 14 · characters 212 to 247';
      text(claim, Math.min(hx + 10, W - L.pad - claim.length * L.fs * .52), hy + 20, { size: L.fs, col: C.amber, alpha: cl(e3 * 2 - 1.2) });
      // packets: they keep going once the mesh is up, slowly, amber on the followed thread
      if (e3 > .95) SPANS.forEach((_, k) => {
        const th = thread(k), u = (time * (k === PICK ? .16 : .1) + k * .37) % 1, [qx, qy] = th[Math.floor(u * (th.length - 1))];
        x.fillStyle = k === PICK ? C.amber : 'rgba(199, 207, 217, 0.6)'; const s = k === PICK ? 4 : 3; x.fillRect(qx - s / 2, qy - s / 2, s, s);
      });
    }

    // 5 · three tables that never share: source, editors, readers; a reader's theory stops at the rule
    if (e4 > 0) {
      L.tiers.forEach((t, i) => {
        x.globalAlpha = cl(e4 * 1.6 - i * .2);
        x.strokeStyle = C.line; x.strokeRect(t.x + .5, t.y + .5, t.w - 1, t.h - 1);
        text(['source', 'editors', 'readers'][i], t.x + 12, t.y + t.h * .67, { size: L.fs, col: C.dim });
        for (let j = 0; j < [6, 2, 1][i]; j++) { x.fillStyle = i ? 'rgba(199, 207, 217, 0.45)' : C.text; x.fillRect(t.x + 100 + j * 26, t.y + t.h / 2 - 3, 6, 6); }
        x.globalAlpha = 1;
      });
      const r = L.tiers[2], s = L.tiers[1], f = cl(e4 * 1.5 - .5);
      if (f > 0) {
        const sx = r.x + 103, y0 = r.y + r.h / 2 - 3, stop = s.y + s.h + 3;
        x.strokeStyle = C.dim; x.setLineDash([3, 3]); poly([[sx, y0], [sx, lerp(y0, stop, f)]]); x.setLineDash([]);
        if (f >= 1) { x.strokeStyle = C.text; poly([[sx - 6, stop], [sx + 6, stop]]); }
      }
    }
  }

  function tick(now) {
    raf = 0;
    p += (goal - p) * .16; if (Math.abs(goal - p) < .002) p = goal;
    const on = Math.min(4, Math.floor(p + .2));
    steps.forEach((li, i) => li.classList.toggle('on', i === on));
    go?.classList.toggle('on', p > 4.55);
    draw(now / 1000);
    if (visible) raf = requestAnimationFrame(tick);
  }
  const kick = () => { if (!raf && visible) raf = requestAnimationFrame(tick); };
  const read = () => {
    const span = section.offsetHeight - scroller.clientHeight * .9;
    goal = cl((scroller.scrollTop - section.offsetTop + scroller.clientHeight * .1) / span) * 5;
    if (reduced) p = goal;
  };
  const size = () => {
    const b = cv.getBoundingClientRect(); if (!b.width) return;
    dpr = Math.min(devicePixelRatio || 1, 2); W = b.width; H = b.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    layout(); draw(performance.now() / 1000);
  };
  new ResizeObserver(size).observe(cv);
  new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) { read(); kick(); } }).observe(sheet);
  scroller.addEventListener('scroll', () => { read(); kick(); }, { passive: true });
  return { read };
}
