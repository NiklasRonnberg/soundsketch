export class CanvasViewport {
  constructor(world, layer) {
    this.world = world;
    this.layer = layer;
    this.scale = 1;
    this.x = 0;
    this.y = 0;
    this.onTransform = () => {};
    this.panning = null;
    world.addEventListener('contextmenu', e => e.preventDefault());
    world.addEventListener('wheel', e => {
      e.preventDefault();
      const rect = world.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      const worldX = (px - this.x) / this.scale;
      const worldY = (py - this.y) / this.scale;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      this.scale = Math.max(.35, Math.min(2.5, this.scale * factor));
      this.x = px - worldX * this.scale;
      this.y = py - worldY * this.scale;
      this.apply();
    }, { passive: false });
    world.addEventListener('pointerdown', e => {
      const rightButton = e.button === 2;
      const leftOnEmptyCanvas = e.button === 0 && !e.target.closest('.sound-object') && !e.target.closest('.toolbar');
      if (!rightButton && !leftOnEmptyCanvas) return;
      e.preventDefault();
      this.panning = { sx: e.clientX, sy: e.clientY, x: this.x, y: this.y, id: e.pointerId };
      world.setPointerCapture(e.pointerId);
      world.classList.add('panning');
    });
    world.addEventListener('pointermove', e => {
      if (!this.panning || e.pointerId !== this.panning.id) return;
      this.x = this.panning.x + e.clientX - this.panning.sx;
      this.y = this.panning.y + e.clientY - this.panning.sy;
      this.apply();
    });
    const end = e => {
      if (!this.panning || (e?.pointerId !== undefined && e.pointerId !== this.panning.id)) return;
      this.panning = null;
      world.classList.remove('panning');
    };
    world.addEventListener('pointerup', end);
    world.addEventListener('pointercancel', end);
    world.addEventListener('lostpointercapture', end);
    this.apply();
  }
  apply() {
    this.layer.style.transform = `translate(${this.x}px, ${this.y}px) scale(${this.scale})`;
    this.onTransform();
  }
  screenToWorld(clientX, clientY) {
    const rect = this.world.getBoundingClientRect();
    return { x: (clientX - rect.left - this.x) / this.scale, y: (clientY - rect.top - this.y) / this.scale };
  }
}
