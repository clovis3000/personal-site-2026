// A light for gold leaf: it follows the pointer over the page and, left alone, drifts in a slow figure across
// it. Contact sheets and ?t= freezes drive it from the plate's clock instead, so they stay deterministic.
const q = new URLSearchParams(location.search);
const frozen = q.has('sheet') || q.has('t');

export function lamp(scene, { z = 460 } = {}) {
  let tx = null, ty = null, seen = -1e9, cur = null;
  addEventListener('pointermove', e => {
    const c = scene.canvas.getBoundingClientRect();
    tx = (e.clientX - c.left) / c.width * scene.W; ty = (e.clientY - c.top) / c.height * scene.H; seen = performance.now();
  });
  document.addEventListener('pointerleave', () => { seen = -1e9; });
  return t => {
    const clock = frozen ? t : performance.now() / 1000;
    const W = scene.W, H = scene.H;
    let goal = [W * (.5 + .45 * Math.sin(clock * .31)), H * (.45 + .38 * Math.sin(clock * .47 + 1.3)), z];
    if (!frozen && performance.now() - seen < 6000) goal = [tx, ty, z];
    if (frozen || !cur) cur = goal;
    else cur = cur.map((v, i) => v + (goal[i] - v) * .14);
    return cur;
  };
}
