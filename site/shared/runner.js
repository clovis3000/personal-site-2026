// One runner for every exploration. A scene is deterministic: reset(seed), then step(t0, t1) at a fixed
// 1/60 s, render(t) whenever a frame is wanted. That makes seeking and contact sheets exact.
//
//   scene = { W, H, duration, canvas, async init?(), resize(pxPerUnit), reset(seed), step(t0, t1), render(t), settle?() }
//   scene.live = true keeps render(t) running after the end (t stays at duration), for light that moves.
//   A full-page scene sets `fill: true` and `setSize(W, H)`: H stays 1000 units, W follows the viewport's shape,
//   and the composition is rebuilt for it.
//
// URL: ?seed=3   ?t=4.5 (freeze at 4.5 s)   ?sheet=12 (contact sheet; &at=0.5,1,2 for explicit times, &cols=4, &aspect=1.6 for fill scenes)
// Keys: R replay · N next seed · space pause. Click also replays.
import { el, clamp } from './util.js';

const DT = 1 / 60;
const q = new URLSearchParams(location.search);
// ?embed: a plate shown inside another page (the site's making-of), without its own labels; ?pace=1.4 plays faster
const PACE = +(q.get('pace') || 1);
if (q.has('embed')) document.documentElement.classList.add('embed');

export async function run(scene, { name = location.pathname.split('/').filter(Boolean).pop() || 'scene' } = {}) {
  const stage = document.querySelector('.stage') || document.body.appendChild(el('div', { class: 'stage' }));
  if (scene.init) await scene.init();
  window.__scene = scene;   // for poking at from devtools
  const shape = aspect => { if (!scene.fill) return; const H = 1000, W = Math.round(H * clamp(aspect, .45, 2.8)); if (W !== scene.W || H !== scene.H) scene.setSize(W, H); };
  shape(q.has('sheet') ? +(q.get('aspect') || 1.6) : innerWidth / innerHeight);
  let seed = +(q.get('seed') ?? scene.seed ?? 1);
  let t = 0;
  scene.reset(seed);

  const seek = target => {
    scene.reset(seed); t = 0;
    while (t < target - 1e-6) { scene.step(t, t + DT); t += DT; }
    scene.render(t);
  };

  if (q.has('sheet')) return sheet(scene, seed, name);

  const layers = scene.layers || [scene.canvas];
  const frame = el('div', { style: 'position:relative' });
  layers.forEach((c, i) => { if (i) c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'; frame.append(c); });
  stage.append(frame);
  if (scene.fill) document.body.classList.add('fill');
  const fit = () => {
    shape(innerWidth / innerHeight);
    const { W, H } = scene, pad = scene.fill ? 0 : innerWidth < 700 ? 16 : 48;
    const s = Math.min((innerWidth - pad * 2) / W, (innerHeight - pad * 2) / H);
    frame.style.width = layers[0].style.width = `${W * s}px`; frame.style.height = layers[0].style.height = `${H * s}px`;
    scene.resize(s * Math.min(devicePixelRatio || 1, 2));
  };
  fit();

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const freeze = q.has('t') ? +q.get('t') : reduced ? scene.duration : null;
  let paused = false, last = 0, raf = 0;
  const rest = () => document.body.classList.toggle('rest', t >= scene.duration - 1e-6);

  const tick = now => {
    raf = 0;
    if (paused) return;
    const dt = last ? Math.min((now - last) / 1000, .1) : DT; last = now;
    let n = Math.round(dt * PACE / DT) || 1;
    while (n-- > 0 && t < scene.duration) { scene.step(t, t + DT); t += DT; }
    scene.render(t); rest();
    // a live scene (gold that catches a moving light) keeps rendering once the painting is done
    if (t < scene.duration || scene.live) raf = requestAnimationFrame(tick);
  };
  const play = () => { last = 0; if (!raf) raf = requestAnimationFrame(tick); };
  const replay = () => { seek(0); rest(); play(); };

  if (freeze != null) { seek(freeze); rest(); } else replay();

  addEventListener('resize', () => { fit(); const at = t; seek(at); rest(); if (freeze == null) play(); });
  stage.addEventListener('click', replay);
  addEventListener('keydown', e => {
    if (e.key === 'r') replay();
    else if (e.key === 'n') { seed++; const u = new URL(location); u.searchParams.set('seed', seed); history.replaceState(null, '', u); replay(); }
    else if (e.key === ' ') { e.preventDefault(); paused = !paused; if (!paused) play(); }
  });
}

async function sheet(scene, seed, name) {
  const { W, H } = scene;
  if (scene.fill) name += `-a${q.get('aspect') || 1.6}`;
  const n = +q.get('sheet') || 12;
  scene.reset(seed);
  const times = q.get('at') ? q.get('at').split(',').map(Number)
    : Array.from({ length: n }, (_, i) => scene.duration * i / (n - 1));
  const cols = +q.get('cols') || 4, rows = Math.ceil(times.length / cols);
  const cw = +q.get('cw') || 560, ch = Math.round(cw * H / W), lab = 22, gap = 10;
  scene.resize(cw / W * 1.5);
  const out = el('canvas'); out.width = cols * (cw + gap) + gap; out.height = rows * (ch + lab + gap) + gap;
  const x = out.getContext('2d');
  x.fillStyle = '#e9e9e6'; x.fillRect(0, 0, out.width, out.height);
  x.font = '12px ui-monospace, Menlo, monospace'; x.textBaseline = 'middle';

  scene.reset(seed);
  let t = 0, steps = 0;
  for (let i = 0; i < times.length; i++) {
    while (t < times[i] - 1e-6) {
      scene.step(t, t + DT); t += DT;
      if (++steps % 30 === 0 && scene.settle) await scene.settle();
    }
    scene.render(t);
    const cx = gap + (i % cols) * (cw + gap), cy = gap + Math.floor(i / cols) * (ch + lab + gap);
    x.fillStyle = '#555'; x.fillText(`${times[i].toFixed(2)} s`, cx + 2, cy + lab / 2);
    for (const c of scene.layers || [scene.canvas]) x.drawImage(c, cx, cy + lab, cw, ch);
  }
  out.style.cssText = 'max-width:100%;display:block;margin:0 auto';
  document.body.replaceChildren(out);
  const blob = await new Promise(r => out.toBlob(r, 'image/png'));
  const file = `${name}-s${seed}${q.get('tag') ? '-' + q.get('tag') : ''}.png`;
  await fetch(`/__sheet/${file}`, { method: 'POST', body: blob }).catch(() => {});
  document.title = `sheet saved: ${file}`;
}
