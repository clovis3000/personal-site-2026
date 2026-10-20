// A white page on the GPU with the bristle timeline painted onto it: for plates that are all bristles and
// no wet wash. The page is cleared to white each frame and Bristles composites over it.
import { Bristles } from './bristles.js';

export class GPage {
  constructor(dev) {
    this.dev = dev;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('webgpu');
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.ctx.configure({ device: dev, format: this.format, alphaMode: 'opaque' });
    this.bristles = new Bristles(dev, this.format);
  }
  resize(W, H, s) {
    this.canvas.width = Math.round(W * s); this.canvas.height = Math.round(H * s);
    this.bristles.resize(this.canvas.width, this.canvas.height, s);
  }
  render(t) {
    const view = this.ctx.getCurrentTexture().createView(), e = this.dev.createCommandEncoder();
    e.beginRenderPass({ colorAttachments: [{ view, loadOp: 'clear', clearValue: [1, 1, 1, 1], storeOp: 'store' }] }).end();
    this.dev.queue.submit([e.finish()]);
    this.bristles.render(view, t);
  }
}
