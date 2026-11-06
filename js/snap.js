export class SnapEngine {
  constructor() {
    this.gap = 12;
    this.threshold = 34;
    this.verticalOffsets = [-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75];
  }

  resolve(item, items) {
    const w = item.element.offsetWidth;
    const h = item.element.offsetHeight;
    const others = items.filter(other => other !== item);
    const x = item.x;
    const y = item.y;
    const candidates = [];

    const overlaps = (px, py, other) => {
      const ow = other.element.offsetWidth;
      const oh = other.element.offsetHeight;
      return px < other.x + ow && px + w > other.x && py < other.y + oh && py + h > other.y;
    };

    for (const other of others) {
      const ow = other.element.offsetWidth;
      const oh = other.element.offsetHeight;

      const verticalOverlap = Math.min(y + h, other.y + oh) - Math.max(y, other.y);
      if (verticalOverlap > 0) {
        const leftX = other.x - w - this.gap;
        const rightX = other.x + ow + this.gap;
        const leftDistance = Math.abs(x - leftX);
        const rightDistance = Math.abs(x - rightX);
        if (leftDistance <= this.threshold) candidates.push({ x: leftX, y: other.y, axis: 'x', distance: leftDistance });
        if (rightDistance <= this.threshold) candidates.push({ x: rightX, y: other.y, axis: 'x', distance: rightDistance });
      }

      const topY = other.y - h - this.gap;
      const bottomY = other.y + oh + this.gap;
      for (const fraction of this.verticalOffsets) {
        const offsetX = other.x + ow * fraction;
        const horizontalOverlap = Math.min(offsetX + w, other.x + ow) - Math.max(offsetX, other.x);
        if (horizontalOverlap <= 0) continue;

        const topDistance = Math.hypot(x - offsetX, y - topY);
        const bottomDistance = Math.hypot(x - offsetX, y - bottomY);
        if (topDistance <= this.threshold) candidates.push({ x: offsetX, y: topY, axis: 'y', fraction, other, distance: topDistance });
        if (bottomDistance <= this.threshold) candidates.push({ x: offsetX, y: bottomY, axis: 'y', fraction, other, distance: bottomDistance });
      }
    }

    const snapped = candidates.sort((a, b) => a.distance - b.distance)[0];
    item.verticalSnap = null;
    if (snapped) {
      if (snapped.axis === 'y') item.verticalSnap = { otherId: snapped.other.id, fraction: snapped.fraction };
      return { x: snapped.x, y: snapped.y };
    }

    const collision = others.find(other => overlaps(x, y, other));
    if (!collision) return { x, y };

    const ow = collision.element.offsetWidth;
    const oh = collision.element.offsetHeight;
    const positions = [
      { x: collision.x - w - this.gap, y },
      { x: collision.x + ow + this.gap, y },
      { x, y: collision.y - h - this.gap },
      { x, y: collision.y + oh + this.gap }
    ].map(position => ({
      ...position,
      distance: Math.hypot(x - position.x, y - position.y),
      blocked: others.some(other => other !== collision && overlaps(position.x, position.y, other))
    })).sort((a, b) => Number(a.blocked) - Number(b.blocked) || a.distance - b.distance);

    return { x: positions[0].x, y: positions[0].y };
  }
}
