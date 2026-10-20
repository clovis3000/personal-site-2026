// The painting, composed and laid out off the main thread: the page posts a plan of its own measurements and
// gets back the typed arrays the GPU wants, so neither the first paint nor a project page ever stalls the page.
import { paint } from './paint.js';
import { layout } from './shared/bristles.js';

// A plan that can't be painted is reported, not thrown: an uncaught error would end the worker for good.
onmessage = ({ data: { id, plan } }) => {
  try {
    const t0 = performance.now(), { S, masks, demo, sea } = paint(plan), t1 = performance.now(), L = layout(S);
    L.stats.ms = [Math.round(t1 - t0), Math.round(performance.now() - t1)];   // paint, layout
    postMessage({ id, L, masks, demo, sea }, [L.P.buffer, L.D.buffer, L.S.buffer, L.C.buffer, L.cum.buffer]);
  } catch (e) { postMessage({ id, error: String(e) }); }
};
