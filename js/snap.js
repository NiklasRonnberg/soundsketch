export class SnapEngine {
  constructor() { this.gap = 12; this.threshold = 34; }
  resolve(item, items) {
    const w = item.element.offsetWidth, h = item.element.offsetHeight;
    const others = items.filter(other => other !== item);
    let x = item.x, y = item.y;
    const intersects = (px, py, other) => {
      const ow = other.element.offsetWidth, oh = other.element.offsetHeight;
      return px < other.x + ow && px + w > other.x && py < other.y + oh && py + h > other.y;
    };
    const candidates = [];
    for (const other of others) {
      const ow = other.element.offsetWidth, oh = other.element.offsetHeight;
      candidates.push(
        { x: other.x - w - this.gap, y: other.y, d: Math.hypot(x - (other.x - w - this.gap), y - other.y) },
        { x: other.x + ow + this.gap, y: other.y, d: Math.hypot(x - (other.x + ow + this.gap), y - other.y) },
        { x: other.x, y: other.y - h - this.gap, d: Math.hypot(x - other.x, y - (other.y - h - this.gap)) },
        { x: other.x, y: other.y + oh + this.gap, d: Math.hypot(x - other.x, y - (other.y + oh + this.gap)) }
      );
    }
    const snap = candidates.filter(c => c.d <= this.threshold).sort((a, b) => a.d - b.d)[0];
    if (snap) { x = snap.x; y = snap.y; }
    for (let pass = 0; pass < others.length + 2; pass++) {
      const collision = others.find(other => intersects(x, y, other));
      if (!collision) break;
      const ow = collision.element.offsetWidth, oh = collision.element.offsetHeight;
      const positions = [
        { x: collision.x - w - this.gap, y: collision.y },
        { x: collision.x + ow + this.gap, y: collision.y },
        { x: collision.x, y: collision.y - h - this.gap },
        { x: collision.x, y: collision.y + oh + this.gap }
      ].map(p => ({ ...p, d: Math.hypot(x - p.x, y - p.y), blocked: others.some(o => o !== collision && intersects(p.x, p.y, o)) }))
       .sort((a, b) => Number(a.blocked) - Number(b.blocked) || a.d - b.d);
      x = positions[0].x;
      y = positions[0].y;
    }
    return { x, y };
  }
}
