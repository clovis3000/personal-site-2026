// 15 Emaki — the site as a scroll. The text is DOM and scrolls; one WebGPU canvas sits fixed behind it and
// paints the world the text scrolls through. The ornament is placed by measuring the DOM's own layout (the
// DOM is the scribe), and each section paints itself as it comes into view, quickly, then holds: ink you
// have seen stays. Opening a project slides the whole world left so its page comes in from the right; back
// slides it home. Each column of the world has its own camera and clock in the bristle engine. The painting
// itself is composed in a worker (paint.js, paint-worker.js) from measurements this page takes of itself.
//
// The Japanese-modernist half: each project is one flat geometric plane in one ink (a circle, a square, the
// half-disc of a horizon), and up close the plane is a katagami stencil, its Morris pattern cut out of it
// in white. Heraldry and mon meet in the gold emblems; emaki cloud bands in gold divide the sections.
import { device } from './shared/wash.js';
import { GPage } from './shared/gpage.js';
import { Bristles, layout } from './shared/bristles.js';
import { paint, SPAN } from './paint.js';
import { mountMagi } from './demo-magi.js';
import { clamp, lerp } from './shared/util.js';

const PROJ = ['pum', 'magi', 'sea', 'making'];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
const index = $('#index'), detail = $('#detail'), track = $('#track'), rail = $('#rail');
const secs = $$('section[data-sec]', index);

const st = { track: 0, from: 0, to: 0, t0: 0, open: -1, main: 0, rev: 0, det: -1, drev: 0, ptr: null, light: null };
let vw = innerWidth, vh = innerHeight, page, B, raf = 0, last = 0, gen = 0;
const D = [];   // each project's page has its own layer, painted in the worker once the index has been

// ── measuring the page for the painter ─────────────────────────────────────────────────────────────────────
// The layout as it will rest, not mid-entrance (see .measuring in the CSS), in world units: the index is the
// world's first column, a project's page its second
const box = (el, of, x0 = 0) => { const b = el.getBoundingClientRect(), o = of.getBoundingClientRect(); return { x: x0 + b.left - o.left, y: b.top - o.top + of.scrollTop, w: b.width, h: b.height }; };
function measureIndex() {
  vw = innerWidth; vh = innerHeight;
  document.documentElement.classList.add('measuring'); void index.offsetHeight;
  const plan = { kind: 'index', vw, vh, upto: 99, secs: secs.map(sec => {
    const prev = sec.previousElementSibling, cl = prev && prev.hasAttribute('data-cloud');
    return {
      name: sec.dataset.sec, H: box(sec, index),
      cloud: cl ? { R: box(prev, index), r: prev.classList.contains('r') } : null,
      planes: $$('[data-plane]', sec).map(el => ({ R: box(el, index), plane: el.dataset.plane, tint: el.dataset.tint, pattern: el.dataset.pattern })),
      mons: $$('[data-mon]', sec).map(el => ({ R: box(el, index), kind: el.dataset.mon })),
    };
  }) };
  document.documentElement.classList.remove('measuring');
  return plan;
}
function measureProject(i) {
  vw = innerWidth; vh = innerHeight;
  const art = $(`article[data-p=${PROJ[i]}]`, detail), band = $('[data-band]', art);
  // the demonstration's place, measured with only this article showing
  const map = $('[data-map]', art), ins = $('[data-insert]', art);
  const arts = $$('article', detail), was = arts.map(a => a.hidden), top = detail.scrollTop;
  arts.forEach(a => (a.hidden = a !== art));
  const mapR = map && box(map, detail, vw), insR = ins && box(ins, detail, vw);
  arts.forEach((a, k) => (a.hidden = was[k])); detail.scrollTop = top;
  return { kind: 'project', vw, vh, band: { tint: band.dataset.tint, pattern: band.dataset.pattern }, mon: $('[data-mon]', art).dataset.mon, mapR, insR };
}

// ── the painter: a worker, one plan at a time; or, if a worker can't be had, the same code here ───────────────
let worker = null, seq = 0;
const waiting = new Map();
try {
  worker = new Worker(new URL('./paint-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => { const w = waiting.get(data.id); waiting.delete(data.id); w?.res(data); };
  worker.onerror = e => { console.warn('painter worker failed; painting on the page instead', e.message); worker = null; for (const [id, w] of waiting) { waiting.delete(id); w.res(local(w.plan)); } };
} catch { worker = null; }
function local(plan) { const { S, masks, demo, sea } = paint(plan); return { L: layout(S), masks, demo, sea }; }
const job = plan => new Promise(res => {
  if (!worker) return setTimeout(() => res(local(plan)));
  const id = ++seq; waiting.set(id, { res, plan }); worker.postMessage({ id, plan });
});

// project pages, painted one after another once the index is up; opening or pointing at one moves it first
let todo = [], working = false, indexUp = false;
function want(i) {
  if (i < 0 || D[i].ready) return;
  const k = todo.indexOf(i); if (k >= 0) todo.splice(k, 1);
  todo.unshift(i); pump();
}
function pump() {
  if (working || !indexUp) return;
  const i = todo.shift(); if (i == null) return;
  if (D[i].ready) return pump();
  const g = gen; working = true;
  job(measureProject(i)).then(out => {
    working = false;
    if (g === gen) adoptProject(i, out); else todo.push(i);
    pump();
  });
}
function adoptProject(i, { L, masks, demo, sea }) {
  const Lr = D[i];
  Lr.masks = masks; Lr.upload(L); Lr.ready = true; Lr.demo = demo; Lr.seaP = 0; Lr.sea = null;
  if (sea) {
    // the chart's labels are DOM, set over it in percentages of its box
    const art = $(`article[data-p=${PROJ[i]}]`, detail), map = $('[data-map]', art), { R } = sea;
    map.querySelectorAll('.lab').forEach(l => l.remove());
    for (const { text, at: [x, y], kind, step } of sea.labels) {
      const el = document.createElement('span'); el.className = `lab ${kind}`; el.textContent = text; el.dataset.step = step;
      el.style.left = `${(x - R.x) / R.w * 100}%`; el.style.top = `${(y - R.y) / R.h * 100}%`;
      map.append(el);
    }
    Lr.sea = { el: map, pin: art.querySelector('[data-pin]'), R, steps: sea.steps, labs: [...map.querySelectorAll('.lab')], lis: [...art.querySelectorAll('[data-pin] .steps li')] };
  }
  need();
}

// ── the clocks, the track, the light ──────────────────────────────────────────────────────────────────────
const need = () => { if (!raf) raf = requestAnimationFrame(frame); };
const ease = u => (u < .5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);

function frame(now) {
  raf = 0;
  const dt = last && now - last < 100 ? (now - last) / 1000 : 1 / 60; last = now;
  let busy = false;
  // the index's clock: through sections already passed in a rush, the newest at its own pace
  const tgt = (st.rev + 1) * SPAN + (st.rev >= secs.length - 1 ? 1 : 0);   // the last page has nothing after it to finish in
  if (B.cum && st.main < tgt) { st.main = Math.min(tgt, st.main + dt * (1 + Math.max(0, st.rev * SPAN - st.main) * 3)); busy = true; }
  // a project page's clock: its header, then (once scrolled to) its demonstration, rushing if behind
  if (st.open >= 0) {
    const dm = D[st.open].demo, dt2 = st.drev && dm ? dm.end + .3 : SPAN;
    if (D[st.open].ready && st.det < dt2) { st.det = Math.min(dt2, st.det + dt * (1 + Math.max(0, SPAN - st.det) * (st.drev ? 3 : 0))); busy = true; }
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
  if (!B.cum) return;   // the painting hasn't arrived yet
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
  want(i);
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
// The picture nearest the left margin is current: its words go to the fixed line, and if it is a plate, its
// recording plays from the start. Recordings and not the live plates: a plate builds its whole painting on
// the main thread before its first frame (Meander's river took 630 ms), which froze the scroll mid-reel
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
  setTimeout(() => { line.innerHTML = cur.classList.contains('words') ? '' : p ? p.innerHTML : ''; line.classList.remove('out'); }, 250);
  clearTimeout(reelTimer);
  reelTimer = setTimeout(() => playPlate(cur), 180);
}
function playPlate(card) {
  for (const v of $$('.card video', detail)) if (v.parentNode !== card) { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); }
  if (!card?.dataset.video || $('video', card) || reduced) return;
  const v = Object.assign(document.createElement('video'), { muted: true, playsInline: true, preload: 'auto', src: card.dataset.video });
  v.setAttribute('aria-hidden', 'true');
  v.addEventListener('playing', () => v.classList.add('on'), { once: true });
  card.append(v); v.play().catch(() => {});
}

// MAGI's record: progress through the prose is the paragraph under the reading line plus how far it has got
// toward the next; each page lands at its own point in that, the third paragraph scatters them, the fourth
// gathers them up
function docs() {
  const el = st.open >= 0 && $(`article[data-p=${PROJ[st.open]}] [data-docs]`, detail);
  if (!el) return;
  const ps = $$('.prose p', el), line = vh * .62, tops = ps.map(q => q.getBoundingClientRect().top);
  let p = -1;
  tops.forEach((t, k) => { if (t <= line) p = k + clamp((line - t) / ((tops[k + 1] ?? t + ps[k].offsetHeight + vh * .3) - t)); });
  const desk = $('.desk', el);
  $$('img', desk).forEach(im => im.classList.toggle('in', p >= +im.dataset.at));
  desk.classList.toggle('apart', p >= 2 && p < 3);
  desk.classList.toggle('gather', p >= 3);
}

// ── start ─────────────────────────────────────────────────────────────────────────────────────────────────
// The words first: they show as soon as their faces are in, whatever the GPU is doing; the painting follows,
// the hero alone first so it can start, then the whole index, which replaces it stroke for stroke
await document.fonts.ready;
reveal(); performance.mark('words');
const dev = await device();
if (!dev) secs.forEach(s => s.classList.add('on'));
else {
  page = new GPage(dev); B = page.bristles; $('#gpu').append(page.canvas);
  PROJ.forEach(() => D.push(new Bristles(dev, page.format)));
  const adoptIndex = ({ L, masks }, what) => { B.masks = masks; B.upload(L); performance.mark(`painting:${what}`, { detail: L.stats }); need(); };
  const build = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2), g = ++gen, t = performance.now();
    const plan = measureIndex();
    page.resize(vw, vh, dpr); B.page = [vw, vh];
    D.forEach(L => { L.ready = false; L.resize(page.canvas.width, page.canvas.height, dpr); L.page = [vw, vh]; });
    indexUp = false; todo = PROJ.map((_, i) => i);
    if (st.open >= 0) { todo.splice(st.open, 1); todo.unshift(st.open); }
    job({ ...plan, upto: 0 }).then(out => {
      if (g !== gen) return;
      adoptIndex(out, 'hero');
      if (st.open >= 0) { indexUp = true; pump(); }   // a page opened by its link goes before the rest of the index
      job(plan).then(out => {
        if (g !== gen) return;
        adoptIndex(out, 'index'); indexUp = true; pump();
        window.__stats = { ...B.stats, ms: Math.round(performance.now() - t) };
      });
    });
    reveal(); need();
  };
  build();
  let rt = 0;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(build, 160); });
  index.addEventListener('scroll', () => { reveal(); need(); }, { passive: true });
  detail.addEventListener('scroll', () => {
    const fig = st.open >= 0 && $(`article[data-p=${PROJ[st.open]}] [data-demo]`, detail);
    if (fig && fig.offsetTop < detail.scrollTop + vh * .8) st.drev = 1;
    document.body.classList.toggle('down', detail.scrollTop > vh * .2);
    reel(); docs();
    need();
  }, { passive: true });
  addEventListener('pointermove', e => { st.ptr = [e.clientX, e.clientY]; need(); });
  $$('[data-open]').forEach(b => {
    b.addEventListener('click', e => { e.preventDefault(); open(b.dataset.open); });
    b.addEventListener('pointerenter', () => want(PROJ.indexOf(b.dataset.open)));
  });
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
  window.__site = { st, B, page, draw, open, close };   // for devtools, and for capturing og.png
}
