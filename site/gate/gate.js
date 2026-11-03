// The gate in front of a client's demo. nginx serves this page, with a 401, for anything under /for/<slug>/
// that arrives without the demo's cookie (tools/nginx/demos-server.conf). The cookie is the SHA-256 of the
// slug and the password; nginx holds only that hash (tools/demos.sh writes it), so the password itself never
// leaves the visitor's browser or Lewis's terminal. The corner vines are the hero's, and the password field is
// the hero's vermilion block, painted by the same worker (paint.js, kind 'gate') where this page measures it.
//
// Opened anywhere else (/gate/ itself, or `just serve`), it is a preview: ?name= sets the heading.
import { device } from '../shared/wash.js';
import { GPage } from '../shared/gpage.js';
import { layout } from '../shared/bristles.js';

const $ = s => document.querySelector(s);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const END = 4.5;   // the vines are all in by then; the clock stops and only the light moves
const BLOCK = .9;  // the brushed block is down by then, so the flat CSS one over it can fade (gate.css, .painted)
const root = document.documentElement;

const slug = location.pathname.match(/^\/for\/([a-z0-9-]+)\//)?.[1] || null;
const gate = $('.gate'), form = $('#form'), pw = $('#pw'), msg = $('#msg'), btn = $('button', form);

// ── the words: the client's name, then the form ───────────────────────────────────────────────────────────
async function meta() {
  if (!slug) return { name: new URLSearchParams(location.search).get('name') || 'Your project' };
  try {
    const r = await fetch(`/for/${slug}/_gate.json`, { cache: 'no-store' });
    if (r.ok) return await r.json();
  } catch {}
  return { name: slug.replace(/-/g, ' ') };
}
const m = await meta();
$('#for').textContent = m.name;
document.title = `${m.name} · Lewis Thompson`;
await document.fonts.ready;
gate.classList.add('on');
if (!reduced) setTimeout(() => pw.focus({ preventScroll: true }), 400); else pw.focus();

// ── the password: hashed here, set as the demo's cookie, and tried against the demo's own index ────────────
const hash = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
const cookie = (v, age) => { document.cookie = `demo_key=${v}; Path=/for/${slug}/; Max-Age=${age}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`; };
const say = s => { msg.textContent = s; };
function no(s) {
  say(s);
  form.classList.remove('no'); void form.offsetWidth; form.classList.add('no');
  pw.select();
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  // the same normalising as tools/demos.sh: a phone capitalises the first letter, and a pasted password trails a space
  const p = pw.value.trim().toLowerCase();
  if (!p) return;
  if (!slug) return say('This is a preview: there is nothing behind it.');
  btn.disabled = true; say('');
  try {
    cookie(await hash(`lewisthompson.dev/for/${slug}\n${p}`), 60 * 60 * 24 * 90);
    const r = await fetch(`/for/${slug}/`, { method: 'HEAD', cache: 'no-store', credentials: 'same-origin' });
    if (r.ok) {
      gate.classList.add('going');
      setTimeout(() => location.reload(), reduced ? 0 : 320);
      return;
    }
    cookie('', 0);
    no(r.status === 429 ? 'Too many tries. Wait a minute, then try again.' : r.status === 401 ? 'That isn’t the password.' : `Something went wrong (${r.status}). Try again in a moment.`);
  } catch {
    cookie('', 0);
    no('Couldn’t reach the server. Check your connection and try again.');
  }
  btn.disabled = false;
});

// ── the painting: the corner vines, painted once, then held; gold catches the pointer ────────────────────────
const dev = await device();
if (dev) {
  const page = new GPage(dev), B = page.bristles;
  $('#gpu').append(page.canvas);
  let worker = null, seq = 0, gen = 0, clock = reduced ? END : 0, raf = 0, last = 0, ptr = null, light = null, laid = false;
  const waiting = new Map();
  try {
    worker = new Worker(new URL('../paint-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => { const w = waiting.get(data.id); waiting.delete(data.id); w?.(data); };
    worker.onerror = () => { worker = null; for (const [id, w] of waiting) { waiting.delete(id); w({ error: 'worker' }); } };
  } catch { worker = null; }
  // the fallback paints here; imported only then, so the page never parses the painter when the worker works
  const local = async plan => { try { const { paint } = await import('../paint.js'), { S, masks } = paint(plan); return { L: layout(S), masks }; } catch (e) { return { error: String(e) }; } };
  const job = plan => (worker ? new Promise(res => { const id = ++seq; waiting.set(id, res); worker.postMessage({ id, plan }); }) : local(plan));

  const need = () => { if (!raf) raf = requestAnimationFrame(frame); };
  function frame(now) {
    raf = 0;
    const dt = last && now - last < 100 ? (now - last) / 1000 : 1 / 60; last = now;
    let busy = false;
    if (B.cum && clock < END) { clock = Math.min(END, clock + dt); busy = true; }
    const vw = innerWidth, vh = innerHeight, goal = ptr || [vw * .7, vh * .12];
    light = light ? light.map((v, i) => v + (goal[i] - v) * .18) : goal.slice();
    if (Math.hypot(light[0] - goal[0], light[1] - goal[1]) > .5) busy = true;
    if (B.cum) { B.light = [...light, 360]; page.render(clock); }
    if (laid && clock >= BLOCK) root.classList.add('painted');
    if (busy) need();
  }

  // where the field rests: offsets, not getBoundingClientRect, so the entrance's 16 px lift isn't measured in
  const at = el => { let x = 0, y = 0; for (let e = el; e; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; } return { x, y, w: el.offsetWidth, h: el.offsetHeight }; };
  // a resize repaints at the new size and keeps the clock, so what has been painted stays painted; the flat
  // block covers the field meanwhile, since the painted one is where the field was
  const build = () => {
    const vw = innerWidth, vh = innerHeight;
    if (vw < 2 || vh < 2) return;
    const dpr = Math.min(devicePixelRatio || 1, 2), g = ++gen;
    job({ kind: 'gate', vw, vh, field: at($('#field')) }).then(out => {
      if (g !== gen) return;
      if (out.error) return console.warn('painting the gate failed', out.error);
      page.resize(vw, vh, dpr); B.page = [vw, vh]; B.masks = out.masks || []; B.upload(out.L);
      laid = true; need();
    });
  };
  build();
  let rt = 0;
  addEventListener('resize', () => { laid = false; root.classList.remove('painted'); clearTimeout(rt); rt = setTimeout(build, 160); });
  addEventListener('pointermove', e => { ptr = [e.clientX, e.clientY]; need(); });
}
